import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, where } from '../hooks/useFirestore'
import { getProfile } from '../utils/profiles'
import { computeStandings } from '../utils/standings'
import { formatLongDate } from '../utils/sheetStats'
import HeaderBadges from '../components/HeaderBadges'
import PredictionSheet from '../components/PredictionSheet'
import MyPositionCard from '../components/classement/MyPositionCard'
import StandingsList from '../components/classement/StandingsList'
import PlayerSheet from '../components/classement/PlayerSheet'

// Page Classement : complément de la carte « Classement général » de l'Accueil.
//   1. « Ma position » : mon rang et les deux joueurs les plus proches ;
//   2. une liste unique (médailles pour le podium, ▲▼ et points du dernier GP) ;
//   3. au toucher, la feuille d'un joueur (d'où viennent ses points) ; un GP
//      touché dans cette feuille ouvre la feuille du GP (celle de Courses).
// Lecture seule : les points viennent de calculateAllSeasonScores.

function ClassementSkeleton() {
  return (
    <div className="px-5 pt-5 pb-4 space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between mb-2">
        <div className="skeleton h-9 w-32 rounded-xl" />
        <div className="skeleton h-11 w-32 rounded-xl" />
      </div>
      <div className="skeleton h-8 w-40 rounded" />
      <div className="skeleton h-4 w-56 rounded" />
      <div className="skeleton h-[226px] w-full rounded-lg mt-4" />
      <div className="card p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[52px] w-full rounded-lg" />)}
      </div>
    </div>
  )
}

export default function Classement({ currentPlayerId, activeLeagueName, activeLeagueId, leagueOptions, onSwitchLeague, setActiveTab, addToast }) {
  const { user } = useAuth()
  const leagueConstraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: players, loading: playersLoading, error: playersError } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races, loading: racesLoading, error: racesError } = useCollection(user ? 'races' : null)
  const { data: predictions, error: predictionsError } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties, error: penaltiesError } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: drivers } = useCollection(user ? 'drivers' : null)

  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedRace, setSelectedRace] = useState(null)

  const loading = playersLoading || racesLoading
  const hasReadError = !!(playersError || racesError || predictionsError || penaltiesError)

  const sortedRaces = useMemo(() => [...races].sort((a, b) => a.id - b.id), [races])

  // Courses restantes : les GP annulés ne seront jamais courus, on ne les compte pas.
  const remainingRacesCount = useMemo(
    () => sortedRaces.filter(r => r.status === 'upcoming').length,
    [sortedRaces],
  )

  // Identité (couleur, avatar, pseudo) résolue depuis profiles/{authUid}.
  const resolveIdentity = useMemo(() => (player) => {
    const identity = getProfile(profiles, player)
    return {
      color: String(identity?.color ?? '#6B6B8A'),
      avatar: String(identity?.avatar ?? '🏎️'),
      displayName: String(identity?.displayName ?? player.id),
    }
  }, [profiles])

  const { list: standings, completed: completedRaces, lastRace } = useMemo(
    () => computeStandings({ players, sortedRaces, predictions, penalties, resolveIdentity }),
    [players, sortedRaces, predictions, penalties, resolveIdentity],
  )

  const list = useMemo(
    () => standings.map(p => ({ ...p, isMe: p.id === currentPlayerId })),
    [standings, currentPlayerId],
  )
  const me = list.find(p => p.isMe) ?? null
  const started = completedRaces.length > 0

  if (loading) return <ClassementSkeleton />

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <HeaderBadges
          leagueName={activeLeagueName}
          leagueId={activeLeagueId}
          leagueOptions={leagueOptions}
          onSwitchLeague={onSwitchLeague}
          onManageLeagues={() => setActiveTab?.('leagues')}
          player={{
            avatar: String(me?.avatar ?? '🏎️'),
            color: String(me?.color ?? '#6B6B8A'),
            displayName: String(me?.displayName ?? currentPlayerId),
            points: me?.total ?? 0,
          }}
          onOpenProfile={() => setActiveTab?.('monprofil')}
        />
        <h1 className="text-2xl font-black tracking-tight mb-1">Classement</h1>
        <p className="text-sm text-muted">
          {completedRaces.length} course{completedRaces.length !== 1 ? 's' : ''} disputée{completedRaces.length !== 1 ? 's' : ''}
          {' '}· {remainingRacesCount} restante{remainingRacesCount !== 1 ? 's' : ''}
        </p>
        {lastRace && (
          <p className="text-[11px] text-muted mt-0.5">
            Dernier résultat : {lastRace.flag} GP {lastRace.name} · {formatLongDate(lastRace.date)}
          </p>
        )}
      </div>

      {/* Bannière d'erreur de lecture : reste visible à côté des données chargées */}
      {hasReadError && (
        <div className="px-5 mb-4">
          <div className="card p-5 border-accent/40">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-sm mb-1">Certaines données n'ont pas pu être chargées</p>
                <p className="text-xs text-muted leading-relaxed">
                  Les scores affichés peuvent être incomplets. Réessayez en rechargeant la page.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="px-5">
          <div className="card p-5 text-center">
            <p className="text-sm text-muted">Aucun joueur dans cette ligue pour le moment.</p>
          </div>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {started && me && (
            <MyPositionCard me={me} count={list.length} lastRace={lastRace} onOpenPlayer={setSelectedPlayer} />
          )}
          {!started && (
            <div className="card p-4">
              <p className="text-sm font-bold">Le classement démarre au premier GP</p>
              <p className="text-xs text-muted mt-1">Pour l'instant, tout le monde est à 0 point.</p>
            </div>
          )}
          <StandingsList list={list} lastRace={lastRace} started={started} onOpenPlayer={setSelectedPlayer} />
          <p className="text-[11px] text-muted text-center leading-snug px-2">
            Points = pronostics + podiums parfaits + bonus série − pénalités.{' '}
            <button
              type="button"
              onClick={() => setActiveTab?.('reglages-du-jeu')}
              className="relative text-accent font-bold after:absolute after:-inset-y-3.5 after:inset-x-0"
            >
              Voir les règles →
            </button>
          </p>
        </div>
      )}

      {selectedPlayer && (
        <PlayerSheet
          player={list.find(p => p.id === selectedPlayer.id) ?? selectedPlayer}
          count={list.length}
          completedRaces={completedRaces}
          meTotal={started && me ? me.total : null}
          onClose={() => setSelectedPlayer(null)}
          onOpenRace={setSelectedRace}
        />
      )}

      <PredictionSheet
        isOpen={!!selectedRace}
        race={selectedRace}
        races={sortedRaces}
        onClose={() => setSelectedRace(null)}
        currentPlayerId={currentPlayerId}
        activeLeagueId={activeLeagueId}
        addToast={addToast}
        players={players}
        profiles={profiles}
        predictions={predictions}
        penalties={penalties}
        drivers={drivers}
      />
    </div>
  )
}
