import { useMemo, useState, useEffect, useRef } from 'react'
import { Trophy, Plus, LogIn, ShieldCheck, User, Search, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, where } from '../hooks/useFirestore'
import { useRaceTiming } from '../hooks/useRaceTiming'
import { computeStandings, normalizeText } from '../utils/standings'
import { gapFromStandings, pronoState } from '../utils/leagueSummary'
import { getProfile } from '../utils/profiles'
import LeaveLeagueSheet from '../components/LeaveLeagueSheet'
import PlayerBadge from '../components/PlayerBadge'
import Skeleton from '../components/Skeleton'
import LeagueHead from '../components/ligues/LeagueHead'
import LeagueDetail from '../components/ligues/LeagueDetail'
import ActiveLeagueCard from '../components/ligues/ActiveLeagueCard'
import AddLeagueSheet from '../components/ligues/AddLeagueSheet'

const NEUTRAL_COLOR = '#6B6B8A'
// À partir de ce nombre de ligues, un champ de recherche apparaît au-dessus des autres ligues.
const SEARCH_FROM = 8

export default function MesLigues({ setActiveTab, onOpenLeagueSettings, activeLeagueId, onSelectLeague, onClearActiveLeague, addToast }) {
  const { user } = useAuth()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminCheckLoading, setAdminCheckLoading] = useState(true)
  const [adminCheckError, setAdminCheckError] = useState(false)
  const [adminAttempt, setAdminAttempt] = useState(0)

  // Check the super-admin custom claim on the connected Firebase user.
  // Forces a token refresh (getIdTokenResult(true)) — the cached token can
  // be up to ~1h stale and wouldn't reflect a role just granted via
  // scripts/set-admin-claim.cjs until the next natural refresh/reconnection,
  // leaving the button silently missing with no indication why.
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setIsSuperAdmin(false)
      setAdminCheckLoading(false)
      setAdminCheckError(false)
      return
    }
    setAdminCheckLoading(true)
    setAdminCheckError(false)
    user.getIdTokenResult(true)
      .then(tokenResult => {
        if (cancelled) return
        setIsSuperAdmin(tokenResult.claims.admin === true)
        setAdminCheckLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setIsSuperAdmin(false)
        setAdminCheckError(true)
        setAdminCheckLoading(false)
      })
    return () => { cancelled = true }
  }, [user, adminAttempt])

  // Query Firestore directly for the player profiles linked to this account
  const { data: myProfiles, loading: profilesLoading } = useCollection(
    user?.uid ? 'players' : null,
    user?.uid ? [where('authUid', '==', user.uid)] : []
  )

  const { data: leagues, loading: leaguesLoading } = useCollection(user ? 'leagues' : null)
  const { data: races, loading: racesLoading } = useCollection(user ? 'races' : null)
  const { data: allPlayers } = useCollection(user ? 'players' : null)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: predictions } = useCollection(user ? 'predictions' : null)
  const { data: penalties } = useCollection(user ? 'penalties' : null)

  const loading = profilesLoading || leaguesLoading || racesLoading

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  // Prochain GP : le premier « à venir », comme l'Accueil. Le point d'état de
  // chaque ligue dit si le joueur y a déjà un pronostic pour ce GP. useRaceTiming
  // n'est lu que pour savoir si la course a démarré (gris au lieu de rouge).
  const nextRace = useMemo(() => sortedRaces.find(r => r.status === 'upcoming') ?? null, [sortedRaces])
  const { started: nextRaceStarted } = useRaceTiming(nextRace)

  const baseEntries = useMemo(() => {
    // active !== false so pre-existing docs without the field default to
    // active — only an explicit active: false (left league) is excluded.
    return myProfiles
      .filter(profile => profile.active !== false)
      .map(profile => {
        const league = leagues.find(l => l._id === profile.leagueId)
        if (!league) return null

        const leaguePlayers = allPlayers.filter(p => p.leagueId === profile.leagueId)
        const leaguePredictions = predictions.filter(p => p.leagueId === profile.leagueId)
        const leaguePenalties = penalties.filter(p => p.leagueId === profile.leagueId)

        const resolveIdentity = (player) => {
          const identity = getProfile(profiles, player)
          return {
            color: String(identity?.color ?? NEUTRAL_COLOR),
            avatar: String(identity?.avatar ?? '🏎️'),
            displayName: String(identity?.displayName ?? player.id),
          }
        }
        // Même rang « sportif » que la page Classement (ex æquo = rang partagé).
        const { list } = computeStandings({
          players: leaguePlayers,
          sortedRaces,
          predictions: leaguePredictions,
          penalties: leaguePenalties,
          resolveIdentity,
          silent: true,
        })
        const mine = list.find(s => s.id === profile.id)
        const identity = getProfile(profiles, profile)

        return {
          profile,
          identity,
          league,
          rank: mine?.rank ?? null,
          total: mine?.total ?? 0,
          gap: gapFromStandings(list, profile.id),
          playerCount: leaguePlayers.length,
          color: String(identity?.color ?? NEUTRAL_COLOR),
          isLeagueAdmin: Array.isArray(league.adminUids) && league.adminUids.includes(user?.uid),
          hasPrediction: !!nextRace && leaguePredictions.some(p => p.playerId === profile.id && p.raceId === nextRace.id),
        }
      })
      .filter(Boolean)
  }, [myProfiles, leagues, allPlayers, profiles, predictions, penalties, sortedRaces, nextRace, user])

  const myLeagues = useMemo(
    () => baseEntries.map(entry => ({
      ...entry,
      prono: pronoState({ nextRace, started: nextRaceStarted, hasPrediction: entry.hasPrediction }),
    })),
    [baseEntries, nextRace, nextRaceStarted]
  )

  const activeEntry = myLeagues.find(({ league }) => league._id === activeLeagueId) ?? null
  const otherEntries = useMemo(
    () => myLeagues
      .filter(({ league }) => league._id !== activeLeagueId)
      .sort((a, b) => a.league.name.localeCompare(b.league.name, 'fr')),
    [myLeagues, activeLeagueId]
  )

  const [leaveTarget, setLeaveTarget] = useState(null) // { profile, league, isLeagueAdmin }
  const [openId, setOpenId] = useState(null) // league._id de la ligue ouverte (une seule à la fois)
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Règles et options de la ligue active : null = pas encore touché (défaut : ouvert s'il n'y a qu'une ligue).
  const [activeOptionsOverride, setActiveOptionsOverride] = useState(null)

  // La ligue ouverte se détache de la liste dans sa propre carte : React recrée donc son
  // bouton. On remet le focus dessus (ou sur la ligne refermée), puis, à l'ouverture, on la
  // fait défiler juste assez pour voir sa fiche en entier au-dessus de la barre du bas
  // (rien ne bouge si elle est déjà visible).
  const prevOpenRef = useRef(null)
  useEffect(() => {
    const target = openId ?? prevOpenRef.current
    prevOpenRef.current = openId
    const el = target ? document.getElementById(`ligue-${target}`) : null
    el?.querySelector('button[aria-expanded]')?.focus({ preventScroll: true })
    if (!openId) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [openId])

  const isSoleAdmin = (league) =>
    Array.isArray(league.adminUids) && league.adminUids.length === 1 && league.adminUids.includes(user?.uid)

  // Fall back to another league (or clear the active league) right away —
  // don't rely on App.jsx's 400ms stabilization effects to eventually get
  // there.
  const redirectIfActiveLeagueGone = (goneLeagueId) => {
    if (activeLeagueId !== goneLeagueId) return
    const remaining = myLeagues.filter(({ league }) => league._id !== goneLeagueId)
    if (remaining.length > 0) {
      onSelectLeague?.(remaining[0].league._id)
    } else {
      onClearActiveLeague?.()
      setActiveTab?.('leagues')
    }
  }

  const handleLeagueLeft = () => {
    if (leaveTarget) redirectIfActiveLeagueGone(leaveTarget.league._id)
  }

  // « Jouer ici » : devient la ligue active et renvoie à l'Accueil (selectActiveLeague).
  const playIn = (entry) => {
    onSelectLeague?.(entry.league._id)
    addToast?.(`Tu joues maintenant dans « ${entry.league.name} »`, 'success')
  }

  const detailHandlers = (entry) => ({
    onSettings: () => onOpenLeagueSettings?.(entry.league._id),
    onLeave: () => setLeaveTarget({ profile: entry.profile, league: entry.league, isLeagueAdmin: entry.isLeagueAdmin }),
  })

  if (loading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={3} height="h-28" />
      </div>
    )
  }

  const count = myLeagues.length
  const activeOptionsOpen = activeOptionsOverride ?? count === 1
  const searchable = count >= SEARCH_FROM
  const q = normalizeText(query.trim())
  const shownOthers = searchable && q
    ? otherEntries.filter(({ league }) => normalizeText(league.name).includes(q))
    : otherEntries

  // Liste « Mes autres ligues » : les lignes pliées forment des blocs compacts ; la ligue
  // ouverte se détache dans sa propre carte (contour blanc fin, espace avant et après), pour
  // qu'on voie où elle s'arrête par rapport à la suivante. Le vert reste réservé à la ligue active.
  const openIdx = shownOthers.findIndex(({ league }) => league._id === openId)
  const openedEntry = openIdx === -1 ? null : shownOthers[openIdx]
  const rowsBefore = openIdx === -1 ? shownOthers : shownOthers.slice(0, openIdx)
  const rowsAfter = openIdx === -1 ? [] : shownOthers.slice(openIdx + 1)
  const collapsedBlock = (list) => list.length > 0 && (
    <div className="card divide-y divide-border overflow-hidden">
      {list.map(entry => (
        <div key={entry.league._id} id={`ligue-${entry.league._id}`} className="px-4">
          <LeagueHead entry={entry} open={false} onToggle={() => setOpenId(entry.league._id)} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-5 flex items-center justify-between gap-x-2 gap-y-3 flex-wrap">
        <div className="shrink-0">
          <h1 className="text-2xl font-black tracking-tight">Mes ligues</h1>
          <p className="text-sm text-muted">{count} ligue{count !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 ml-auto">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab?.('admin')}
              aria-label="Administration"
              className="w-11 h-11 rounded-xl border border-border bg-surfaceHigh flex items-center justify-center shrink-0 active:opacity-70"
            >
              <ShieldCheck size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Ajouter une ligue"
            className="w-11 h-11 rounded-xl border border-border bg-surfaceHigh flex items-center justify-center shrink-0 active:opacity-70"
          >
            <Plus size={20} />
          </button>
          {activeEntry ? (
            <PlayerBadge
              avatar={String(activeEntry.identity?.avatar ?? '🏎️')}
              color={activeEntry.color}
              displayName={String(activeEntry.identity?.displayName ?? activeEntry.profile.id)}
              points={activeEntry.total}
              onClick={() => setActiveTab?.('monprofil')}
              className="!shrink min-w-[84px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab?.('monprofil')}
              className="w-11 h-11 flex items-center justify-center rounded-full border border-border text-muted hover:text-white hover:border-muted transition-colors active:scale-95 shrink-0"
              aria-label="Mon profil"
            >
              <User size={18} />
            </button>
          )}
        </div>
      </div>

      {adminCheckError && (
        <div className="px-5 -mt-2 mb-3 flex items-center gap-2 flex-wrap" role="alert">
          <p className="text-xs text-accent font-bold">Impossible de vérifier vos droits.</p>
          <button
            type="button"
            onClick={() => setAdminAttempt(n => n + 1)}
            className="min-h-[44px] px-2 text-xs font-bold underline"
          >
            Réessayer
          </button>
        </div>
      )}
      {adminCheckLoading && <span className="sr-only" aria-live="polite">Vérification des droits</span>}

      <div className="px-5">
        {count === 0 ? (
          <>
            <div className="card p-6 text-center">
              <Trophy size={32} className="mx-auto mb-3 text-muted" />
              <p className="font-bold text-sm">Aucune ligue pour le moment</p>
              <p className="text-xs text-muted mt-1">Rejoignez ou créez une ligue pour commencer.</p>
            </div>
            {/* Écran d'arrivée d'un joueur sans ligue : traité à part (intro de bienvenue). */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab?.('creer-ligue')}
                className="card p-4 flex flex-col items-center gap-2 active:opacity-70"
              >
                <Plus size={22} />
                <span className="font-bold text-sm">Nouvelle ligue</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab?.('rejoindre-ligue')}
                className="card p-4 flex flex-col items-center gap-2 active:opacity-70"
              >
                <LogIn size={22} />
                <span className="font-bold text-sm">Rejoindre une ligue</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {activeEntry && (
              <section aria-label="Ma ligue active">
                <h2 className="text-xs font-black uppercase tracking-widest text-white mb-2">Ma ligue active</h2>
                <ActiveLeagueCard
                  entry={activeEntry}
                  nextRace={nextRace}
                  open={activeOptionsOpen}
                  onToggle={() => setActiveOptionsOverride(!activeOptionsOpen)}
                  {...detailHandlers(activeEntry)}
                />
              </section>
            )}

            {otherEntries.length > 0 && (
              <section aria-label={activeEntry ? 'Mes autres ligues' : 'Mes ligues'}>
                <h2 className="text-xs font-black uppercase tracking-widest text-white mt-6 mb-2">
                  {activeEntry ? 'Mes autres ligues' : 'Mes ligues'}
                  <span className="text-muted font-bold"> · {otherEntries.length}</span>
                </h2>
                {searchable && (
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                      type="search"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Rechercher une ligue"
                      aria-label="Rechercher une ligue"
                      className="w-full min-h-[44px] bg-bg border border-border rounded-xl pl-9 pr-10 text-sm placeholder:text-muted outline-none focus:border-white/30 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                      <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-muted">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}
                {shownOthers.length === 0 ? (
                  <div className="card p-4 text-center">
                    <p className="text-sm text-muted">Aucune ligue ne correspond à « {query.trim()} ».</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {collapsedBlock(rowsBefore)}
                    {openedEntry && (
                      <div
                        id={`ligue-${openedEntry.league._id}`}
                        className="card overflow-hidden ring-1 ring-white/25 bg-surfaceHigh/40 scroll-mb-24"
                      >
                        <div className="px-4">
                          <LeagueHead entry={openedEntry} open onToggle={() => setOpenId(null)} />
                        </div>
                        <div className="px-4 pb-4 pt-1">
                          <LeagueDetail
                            entry={openedEntry}
                            nextRace={nextRace}
                            onPlay={() => playIn(openedEntry)}
                            {...detailHandlers(openedEntry)}
                          />
                        </div>
                      </div>
                    )}
                    {collapsedBlock(rowsAfter)}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <AddLeagueSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={() => { setAddOpen(false); setActiveTab?.('creer-ligue') }}
        onJoin={() => { setAddOpen(false); setActiveTab?.('rejoindre-ligue') }}
      />

      <LeaveLeagueSheet
        isOpen={!!leaveTarget}
        onClose={() => setLeaveTarget(null)}
        profileId={leaveTarget?.profile._id}
        isSoleAdmin={leaveTarget ? isSoleAdmin(leaveTarget.league) : false}
        onLeft={handleLeagueLeft}
      />
    </div>
  )
}
