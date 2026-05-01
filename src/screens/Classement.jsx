import { useMemo } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { calculateAllSeasonScores } from '../utils/scoring'
import Skeleton from '../components/Skeleton'

// Dense ranking: same points → same rank, no gap after ties
function rankWithTies(sorted) {
  const uniqueTotals = [...new Set(sorted.map(p => p.total))].sort((a, b) => b - a)
  return sorted.map(player => ({
    ...player,
    rank: uniqueTotals.indexOf(player.total) + 1,
  }))
}

function rankBg(rank) {
  if (rank === 1) return 'bg-gold text-bg'
  if (rank === 2) return 'bg-silver text-bg'
  if (rank === 3) return 'bg-bronze text-bg'
  return 'bg-surfaceHigh text-muted'
}

const STEP_STYLE = {
  1: { bg: 'bg-gold/10 border-gold/30',     textPts: '#FFD700' },
  2: { bg: 'bg-silver/10 border-silver/30', textPts: '#C0C0C0' },
  3: { bg: 'bg-bronze/10 border-bronze/30', textPts: '#CD7F32' },
}

// Height for one player item (avatar + name + pts + internal gap)
const ITEM_H   = 62
const ITEM_GAP = 6
const STEP_PAD = 20   // vertical padding inside the step
const STEP_GAP = 44   // guaranteed visual gap between consecutive ranks

function contentHeight(playerCount) {
  return playerCount * ITEM_H + Math.max(0, playerCount - 1) * ITEM_GAP + STEP_PAD
}

export default function Classement({ currentPlayerId }) {
  const { data: players, loading: playersLoading } = useCollection('players')
  const { data: races, loading: racesLoading } = useCollection('races')
  const { data: predictions } = useCollection('predictions')
  const { data: penalties } = useCollection('penalties')

  const loading = playersLoading || racesLoading

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  const completedRaces = useMemo(() =>
    sortedRaces.filter(r => r.status === 'completed'),
    [sortedRaces]
  )

  // Build standings — all display values from Firestore (no hardcoded fallback maps)
  const standings = useMemo(() => {
    if (!players.length) return []
    const raw = calculateAllSeasonScores(players, sortedRaces, predictions, penalties)
      .map(player => {
        const { total, raceScores, streakBonus } = player
        const racesPlayed    = raceScores.filter(rs => rs.net !== null).length
        const avgScore       = racesPlayed > 0 ? (total / racesPlayed).toFixed(1) : '0.0'
        const perfectPodiums = raceScores.filter(rs => rs.perfectPodium).length
        const bestScore      = raceScores.reduce((best, rs) => Math.max(best, rs.net ?? 0), 0)
        return {
          ...player,
          color:       String(player.color       ?? '#6B6B8A'),
          avatar:      String(player.avatar      ?? '🏎️'),
          displayName: String(player.displayName ?? player.id),
          total, raceScores, streakBonus,
          racesPlayed, avgScore, perfectPodiums, bestScore,
        }
      })
      .sort((a, b) => b.total - a.total)
    return rankWithTies(raw)
  }, [players, races, predictions, penalties, sortedRaces])

  // Podium groups (rank 1 / 2 / 3 only)
  const podiumGroups = useMemo(() => {
    const groups = {}
    for (const p of standings) {
      if (p.rank <= 3) {
        if (!groups[p.rank]) groups[p.rank] = []
        groups[p.rank].push(p)
      }
    }
    return groups  // { 1: [...], 2: [...], 3: [...] }
  }, [standings])

  // Compute step heights so rank-1 > rank-2 + GAP > rank-3 + GAP
  const stepHeights = useMemo(() => {
    const h3 = Math.max(contentHeight(podiumGroups[3]?.length ?? 0), ITEM_H + STEP_PAD)
    const h2 = Math.max(contentHeight(podiumGroups[2]?.length ?? 0), h3 + STEP_GAP)
    const h1 = Math.max(contentHeight(podiumGroups[1]?.length ?? 0), h2 + STEP_GAP)
    return { 1: h1, 2: h2, 3: h3 }
  }, [podiumGroups])

  const leaderTotal = standings[0]?.total ?? 0

  if (loading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={4} height="h-24" />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight mb-1">Classement</h1>
        <p className="text-sm text-muted">
          {completedRaces.length} course{completedRaces.length !== 1 ? 's' : ''} disputée{completedRaces.length !== 1 ? 's' : ''}
          {' '}· {sortedRaces.length - completedRaces.length} restante{sortedRaces.length - completedRaces.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Podium visuel ── */}
      {Object.keys(podiumGroups).length >= 2 && (
        <div className="px-5 mb-5">
          {/* Visual F1 order: rank-2 left | rank-1 centre | rank-3 right */}
          <div className="flex items-end justify-center gap-2">
            {[2, 1, 3].map(rank => {
              const group = podiumGroups[rank]
              const style = STEP_STYLE[rank]
              const h     = stepHeights[rank]

              if (!group) {
                // Empty placeholder to maintain 3-column layout
                return <div key={rank} className="flex-1" style={{ height: h }} />
              }

              return (
                <div
                  key={rank}
                  className={`flex-1 flex flex-col items-center justify-center rounded-t-xl border ${style.bg} px-1 py-2`}
                  style={{ height: h }}
                >
                  {/* Players on this step */}
                  {group.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex flex-col items-center ${i > 0 ? 'mt-1.5 pt-1.5 border-t border-white/10 w-full' : ''}`}
                    >
                      <span className="text-xl leading-none mb-0.5">{p.avatar}</span>
                      <span
                        className="text-[11px] font-bold leading-tight text-center w-full px-1"
                        style={{ color: p.color }}
                      >
                        {p.displayName}
                      </span>
                      <span
                        className="text-xs font-black leading-tight whitespace-nowrap"
                        style={{ color: style.textPts }}
                      >
                        {p.total} pts
                      </span>
                    </div>
                  ))}

                  {rank === 1 && (
                    <span className="text-gold text-sm leading-none mt-1">👑</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Full standings cards ── */}
      <div className="px-5 space-y-3">
        {standings.map(player => {
          const isCurrent = player.id === currentPlayerId
          const pct = leaderTotal > 0 ? (player.total / leaderTotal) * 100 : 0
          const gap = player.total < leaderTotal ? leaderTotal - player.total : 0

          return (
            <div
              key={player.id}
              className={`card p-4 transition-all ${isCurrent ? 'ring-2 ring-opacity-50' : ''}`}
              style={isCurrent ? { '--tw-ring-color': player.color, borderColor: player.color + '30' } : {}}
            >
              {/* Row 1: rank badge + avatar + name + score */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${rankBg(player.rank)}`}>
                  {player.rank}
                </div>
                <span className="text-xl leading-none">{player.avatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-base truncate">
                    {player.displayName}
                    {isCurrent && <span className="text-xs text-muted font-normal ml-1">(vous)</span>}
                  </p>
                  {gap > 0 ? (
                    <p className="text-xs text-muted">-{gap} pts du leader</p>
                  ) : (
                    <p className="text-xs text-gold">En tête 🏆</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-xl leading-tight" style={{ color: player.color }}>
                    {player.total}
                  </p>
                  <p className="text-xs text-muted">pts</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-border rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: player.color }}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Courses',    value: player.racesPlayed    },
                  { label: 'Moy.',       value: player.avgScore        },
                  { label: 'Best',       value: player.bestScore       },
                  { label: '⭐ Parfait', value: player.perfectPodiums  },
                ].map(stat => (
                  <div key={stat.label} className="text-center">
                    <p className="font-black text-sm">{stat.value}</p>
                    <p className="text-[9px] text-muted uppercase tracking-wide">{stat.label}</p>
                  </div>
                ))}
              </div>

              {player.streakBonus > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <span className="text-xs text-muted">Bonus série</span>
                  <span className="text-xs text-gold font-bold">+{player.streakBonus} pts</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Détail par course ── */}
      {completedRaces.length > 0 && (
        <div className="px-5 mt-6">
          <p className="section-title mb-4">Détail par course</p>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-3 text-muted text-xs font-bold w-20">Course</th>
                  {standings.map(p => (
                    <th key={p.id} className="text-center py-2 px-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-base leading-none">{p.avatar}</span>
                        <span className="text-[9px] font-bold" style={{ color: p.color }}>
                          {p.displayName}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedRaces.map(race => (
                  <tr key={race.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{race.flag}</span>
                        <span className="text-xs text-muted truncate max-w-[60px]">{race.name}</span>
                      </div>
                    </td>
                    {standings.map(player => {
                      const rs = player.raceScores?.find(r => r.raceId === race.id)
                      return (
                        <td key={player.id} className="text-center py-2 px-1">
                          {rs?.net !== null && rs?.net !== undefined ? (
                            <span className="font-bold text-sm" style={{ color: player.color }}>
                              {rs.net}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="py-2 pr-3 font-black text-xs uppercase text-muted">Total</td>
                  {standings.map(player => (
                    <td key={player.id} className="text-center py-2 px-1">
                      <span className="font-black text-sm" style={{ color: player.color }}>
                        {player.total}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
