import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, where } from '../hooks/useFirestore'
import { computeStatsData } from '../utils/statsData'
import HeaderBadges from '../components/HeaderBadges'
import StatsTabs from '../components/stats/StatsTabs'
import FormCard from '../components/stats/FormCard'
import SeasonCard from '../components/stats/SeasonCard'
import ExactCard from '../components/stats/ExactCard'
import PilotsCard from '../components/stats/PilotsCard'
import ModsCard from '../components/stats/ModsCard'
import TitleCard from '../components/stats/TitleCard'
import GapCard from '../components/stats/GapCard'
import DuelCard from '../components/stats/DuelCard'

// Page Stats, en trois onglets courts :
//   Ma forme    : ma forme du moment, ma saison ;
//   Mes rivaux  : la course au titre, mon écart avec les autres, le duel ;
//   Mes pronos  : mes pronostics exacts, mes pilotes, mes modifications.
// Lecture seule : tous les points viennent de calculateAllSeasonScores (voir utils/statsData.js).

const TABS = [
  { key: 'forme', label: 'Ma forme' },
  { key: 'rivaux', label: 'Mes rivaux' },
  { key: 'pronos', label: 'Mes pronos' },
]

function StatsSkeleton() {
  return (
    <div className="px-5 pt-5 pb-4 space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between mb-2">
        <div className="skeleton h-9 w-32 rounded-xl" />
        <div className="skeleton h-11 w-32 rounded-xl" />
      </div>
      <div className="skeleton h-8 w-40 rounded" />
      <div className="skeleton h-4 w-56 rounded" />
      <div className="skeleton h-11 w-full rounded-xl mt-4" />
      <div className="skeleton h-[330px] w-full rounded-lg" />
      <div className="skeleton h-[200px] w-full rounded-lg" />
    </div>
  )
}

export default function Stats({ currentPlayerId, activeLeagueName, activeLeagueId, leagueOptions, onSwitchLeague, setActiveTab }) {
  const { user } = useAuth()
  const leagueConstraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: players, loading: playersLoading, error: playersError } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races, loading: racesLoading, error: racesError } = useCollection(user ? 'races' : null)
  const { data: predictions, error: predictionsError } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties, error: penaltiesError } = useCollection(user ? 'penalties' : null, leagueConstraint)

  const [tab, setTab] = useState('forme')

  const loading = playersLoading || racesLoading
  const hasReadError = !!(playersError || racesError || predictionsError || penaltiesError)

  const data = useMemo(
    () => computeStatsData({ players, races, predictions, penalties, profiles, meId: currentPlayerId }),
    [players, races, predictions, penalties, profiles, currentPlayerId],
  )

  if (loading) return <StatsSkeleton />

  if (!data || !data.me) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-5">
        <span className="text-5xl mb-4">📊</span>
        <p className="font-black text-xl mb-2">Aucune statistique</p>
        <p className="text-muted text-sm">Les stats apparaîtront après la première course</p>
      </div>
    )
  }

  const { me, completed, upcoming } = data
  const remaining = upcoming.length

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-3">
        <HeaderBadges
          leagueName={activeLeagueName}
          leagueId={activeLeagueId}
          leagueOptions={leagueOptions}
          onSwitchLeague={onSwitchLeague}
          onManageLeagues={() => setActiveTab?.('leagues')}
          player={{ avatar: me.avatar, color: me.color, displayName: me.name, points: me.total }}
          onOpenProfile={() => setActiveTab?.('monprofil')}
        />
        <h1 className="text-2xl font-black tracking-tight mb-1">Statistiques</h1>
        <p className="text-sm text-muted">
          {completed.length} course{completed.length > 1 ? 's' : ''} disputée{completed.length > 1 ? 's' : ''}
          {' '}· {remaining} restante{remaining > 1 ? 's' : ''}
        </p>
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

      <StatsTabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="px-5 space-y-4 mt-1">
        {tab === 'forme' && (
          <>
            <FormCard data={data} />
            <SeasonCard data={data} />
          </>
        )}
        {tab === 'rivaux' && (
          <>
            <TitleCard data={data} />
            <GapCard data={data} />
            <DuelCard data={data} />
          </>
        )}
        {tab === 'pronos' && (
          <>
            <ExactCard data={data} />
            <PilotsCard data={data} />
            <ModsCard data={data} />
          </>
        )}
      </div>
    </div>
  )
}
