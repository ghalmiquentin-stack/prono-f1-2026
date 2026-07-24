import { useMemo, useState, useEffect } from 'react'
import { Trophy, Crown, Plus, LogIn, Settings, ShieldCheck, User, LogOut, MoreVertical, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, where } from '../hooks/useFirestore'
import { calculateAllSeasonScores } from '../utils/scoring'
import { getProfile } from '../utils/profiles'
import LeaveLeagueSheet from '../components/LeaveLeagueSheet'
import DeleteLeagueSheet from '../components/DeleteLeagueSheet'
import PlayerBadge from '../components/PlayerBadge'
import Skeleton from '../components/Skeleton'

// Dense ranking: same points → same rank, no gap after ties
function rankWithTies(sorted) {
  const uniqueTotals = [...new Set(sorted.map(p => p.total))].sort((a, b) => b - a)
  return sorted.map(player => ({
    ...player,
    rank: uniqueTotals.indexOf(player.total) + 1,
  }))
}

export default function MesLigues({ setActiveTab, onOpenLeagueSettings, activeLeagueId, onSelectLeague, onActivateLeague, onClearActiveLeague, addToast }) {
  const { user } = useAuth()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Check the super-admin custom claim on the connected Firebase user
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setIsSuperAdmin(false)
      return
    }
    user.getIdTokenResult()
      .then(tokenResult => {
        if (!cancelled) setIsSuperAdmin(tokenResult.claims.admin === true)
      })
      .catch(() => {
        if (!cancelled) setIsSuperAdmin(false)
      })
    return () => { cancelled = true }
  }, [user])

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

  const myLeagues = useMemo(() => {
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

        const standings = rankWithTies(
          calculateAllSeasonScores(leaguePlayers, sortedRaces, leaguePredictions, leaguePenalties)
            .sort((a, b) => b.total - a.total)
        )
        const mine = standings.find(s => s.id === profile.id)
        const identity = getProfile(profiles, profile)

        return {
          profile,
          identity,
          league,
          rank: mine?.rank ?? null,
          total: mine?.total ?? 0,
          playerCount: leaguePlayers.length,
          isLeagueAdmin: Array.isArray(league.adminUids) && league.adminUids.includes(user?.uid),
        }
      })
      .filter(Boolean)
  }, [myProfiles, leagues, allPlayers, profiles, predictions, penalties, sortedRaces, user])

  const [leaveTarget, setLeaveTarget] = useState(null) // { profile, league, isLeagueAdmin }
  const [deleteTarget, setDeleteTarget] = useState(null) // { league }
  const [menuOpenFor, setMenuOpenFor] = useState(null) // league._id

  const isSoleAdmin = (league) =>
    Array.isArray(league.adminUids) && league.adminUids.length === 1 && league.adminUids.includes(user?.uid)

  const openLeaveSheet = (entry) => {
    setMenuOpenFor(null)
    setLeaveTarget(entry)
  }

  const closeLeaveSheet = () => setLeaveTarget(null)

  const openDeleteSheet = (entry) => {
    setMenuOpenFor(null)
    setDeleteTarget(entry)
  }

  const closeDeleteSheet = () => setDeleteTarget(null)

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

  const handleLeagueDeleted = () => {
    if (deleteTarget) redirectIfActiveLeagueGone(deleteTarget.league._id)
  }

  const activeLeagueEntry = myLeagues.find(({ league }) => league._id === activeLeagueId)

  if (loading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={3} height="h-28" />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Mes Ligues</h1>
          <p className="text-sm text-muted">
            {myLeagues.length} ligue{myLeagues.length !== 1 ? 's' : ''} rejointe{myLeagues.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab?.('admin')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-bold text-muted hover:text-white hover:border-muted transition-colors active:scale-95"
              aria-label="Réglages super-admin"
            >
              <ShieldCheck size={16} />
              Super Admin
            </button>
          )}
          {activeLeagueEntry ? (
            <PlayerBadge
              avatar={String(activeLeagueEntry.identity?.avatar ?? '🏎️')}
              color={String(activeLeagueEntry.identity?.color ?? '#6B6B8A')}
              displayName={String(activeLeagueEntry.identity?.displayName ?? activeLeagueEntry.profile.id)}
              points={activeLeagueEntry.total}
              onClick={() => setActiveTab?.('monprofil')}
            />
          ) : (
            <button
              onClick={() => setActiveTab?.('monprofil')}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted hover:text-white hover:border-muted transition-colors active:scale-95"
              aria-label="Mon profil"
            >
              <User size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 space-y-3">
        {myLeagues.length === 0 ? (
          <div className="card p-6 text-center">
            <Trophy size={32} className="mx-auto mb-3 text-muted" />
            <p className="font-bold text-sm">Aucune ligue pour le moment</p>
            <p className="text-xs text-muted mt-1">Rejoignez ou créez une ligue pour commencer.</p>
          </div>
        ) : (
          myLeagues.map(({ profile, identity, league, rank, total, playerCount, isLeagueAdmin }) => {
            const isActive = league._id === activeLeagueId
            return (
              <div
                key={league._id}
                onClick={() => { if (!isActive) onActivateLeague?.(league._id) }}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isActive) onActivateLeague?.(league._id) }}
                className={`card p-4 border transition-all cursor-pointer active:scale-[0.98] ${
                  isActive
                    ? 'border-green-500 bg-green-500/5'
                    : 'border-border'
                }`}
              >
                <div className="mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Trophy size={18} className="text-gold shrink-0" />
                      <h3 className="font-black text-lg break-words">{league.name}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isLeagueAdmin && (
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === league._id ? null : league._id) }}
                            className="p-1.5 rounded-lg text-muted hover:text-white transition-colors"
                            aria-label="Menu de la ligue"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {menuOpenFor === league._id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={e => { e.stopPropagation(); setMenuOpenFor(null) }}
                              />
                              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                                <button
                                  onClick={e => { e.stopPropagation(); setMenuOpenFor(null); onOpenLeagueSettings?.(league._id) }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-left hover:bg-surfaceHigh transition-colors"
                                >
                                  <Settings size={16} />
                                  Réglages
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); openDeleteSheet({ league }) }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-left text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 size={16} />
                                  Supprimer la ligue
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); openLeaveSheet({ profile, league, isLeagueAdmin }) }}
                        className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                        aria-label="Quitter la ligue"
                      >
                        <LogOut size={18} />
                      </button>
                    </div>
                  </div>
                  {(isActive || isLeagueAdmin) && (
                    <div className="flex items-center gap-2 mt-2">
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full shrink-0">
                          Active
                        </span>
                      )}
                      {isLeagueAdmin && (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-accent/20 text-accent px-2 py-1 rounded-full">
                          <Crown size={12} />
                          Admin
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-14 h-14 rounded-full bg-surfaceHigh shrink-0">
                    <span className="font-black text-xl leading-none">{rank ?? '–'}</span>
                    <span className="text-[9px] text-muted uppercase tracking-wide mt-0.5">Rang</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-2xl leading-tight" style={{ color: identity?.color ?? '#E8002D' }}>
                      {total} pts
                    </p>
                    <p className="text-xs text-muted">
                      {playerCount} joueur{playerCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted">Code d'invitation</p>
                  <p className="text-xs font-mono font-black tracking-widest">{league.code}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Actions ── */}
      <div className="px-5 mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setActiveTab?.('creer-ligue')}
          className="card p-4 flex flex-col items-center gap-2 active:opacity-70"
        >
          <Plus size={22} />
          <span className="font-bold text-sm">Nouvelle ligue</span>
        </button>
        <button
          onClick={() => setActiveTab?.('rejoindre-ligue')}
          className="card p-4 flex flex-col items-center gap-2 active:opacity-70"
        >
          <LogIn size={22} />
          <span className="font-bold text-sm">Rejoindre une ligue</span>
        </button>
      </div>

      <LeaveLeagueSheet
        isOpen={!!leaveTarget}
        onClose={closeLeaveSheet}
        profileId={leaveTarget?.profile._id}
        isSoleAdmin={leaveTarget ? isSoleAdmin(leaveTarget.league) : false}
        onLeft={handleLeagueLeft}
      />

      <DeleteLeagueSheet
        isOpen={!!deleteTarget}
        onClose={closeDeleteSheet}
        league={deleteTarget?.league}
        onDeleted={handleLeagueDeleted}
        addToast={addToast}
      />
    </div>
  )
}
