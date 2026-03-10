import { useMemo, useState } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { calculatePlayerSeasonScore } from '../utils/scoring'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import Skeleton from '../components/Skeleton'

const PLAYER_COLORS = {
  william: '#3B82F6',
  quentin: '#22C55E',
  alex: '#F97316',
  romain: '#A855F7',
}

const PLAYER_AVATARS = {
  william: '🏎️',
  quentin: '🏁',
  alex: '🔥',
  romain: '⚡',
}

const PLAYERS_ORDER = ['william', 'quentin', 'alex', 'romain']

// Team colors for 2026 grid
const DRIVER_TEAMS = {
  Russell:    { team: 'Mercedes',     color: '#00D2BE' },
  Antonelli:  { team: 'Mercedes',     color: '#00D2BE' },
  Hamilton:   { team: 'Ferrari',      color: '#E8002D' },
  Leclerc:    { team: 'Ferrari',      color: '#E8002D' },
  Norris:     { team: 'McLaren',      color: '#FF8000' },
  Piastri:    { team: 'McLaren',      color: '#FF8000' },
  Verstappen: { team: 'Red Bull',     color: '#3671C6' },
  Pérez:      { team: 'Red Bull',     color: '#3671C6' },
  Alonso:     { team: 'Aston Martin', color: '#358C75' },
  Stroll:     { team: 'Aston Martin', color: '#358C75' },
  Sainz:      { team: 'Williams',     color: '#64C4FF' },
  Albon:      { team: 'Williams',     color: '#64C4FF' },
  Gasly:      { team: 'Alpine',       color: '#FF69B4' },
  Ocon:       { team: 'Alpine',       color: '#FF69B4' },
  Hülkenberg: { team: 'Haas',         color: '#B6BABD' },
  Bearman:    { team: 'Haas',         color: '#B6BABD' },
  Tsunoda:    { team: 'Racing Bulls', color: '#6692FF' },
  Lawson:     { team: 'Racing Bulls', color: '#6692FF' },
  Zhou:       { team: 'Kick Sauber',  color: '#52E252' },
  Bottas:     { team: 'Kick Sauber',  color: '#52E252' },
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-border rounded-lg p-3 shadow-xl">
        <p className="text-xs text-muted mb-2 font-bold">{label}</p>
        {payload.map(entry => (
          <p key={entry.dataKey} className="text-sm font-bold" style={{ color: entry.color }}>
            {entry.name}: {Math.round(entry.value)} pts
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Stats({ currentPlayerId }) {
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

  const playerStats = useMemo(() => {
    if (!players.length) return []
    return PLAYERS_ORDER.map(pid => {
      const player = players.find(p => p.id === pid)
      if (!player) return null
      const preds = predictions.filter(p => p.playerId === pid)
      const pens = penalties.filter(p => p.playerId === pid)
      const { total, raceScores, streakBonus } = calculatePlayerSeasonScore(preds, sortedRaces, pens)

      const racesPlayed = raceScores.filter(rs => rs.net !== null).length
      const avgScore = racesPlayed > 0 ? +(total / racesPlayed).toFixed(1) : 0
      const perfectPodiums = raceScores.filter(rs => rs.perfectPodium).length
      const bestScore = raceScores.reduce((best, rs) => Math.max(best, rs.net ?? 0), 0)
      const totalPenalties = pens.reduce((s, p) => s + (p.type === 'late' ? 10 : 5), 0)
      const exactHits = raceScores.reduce((s, rs) =>
        s + Object.values(rs.details ?? {}).filter(d => d === 'exact').length, 0)
      const podiumHits = raceScores.reduce((s, rs) =>
        s + Object.values(rs.details ?? {}).filter(d => d === 'podium').length, 0)

      let cumulative = 0
      const cumulativeScores = raceScores.map(rs => {
        cumulative += rs.net ?? 0
        return { raceId: rs.raceId, name: rs.raceName, cumulative }
      })

      return {
        ...player,
        total, raceScores, streakBonus,
        racesPlayed, avgScore, perfectPodiums, bestScore,
        totalPenalties, exactHits, podiumHits, cumulativeScores,
      }
    }).filter(Boolean)
  }, [players, races, predictions, penalties, sortedRaces])

  // Cumulative chart data — real Y values + horizontal pixel offsets for ties
  const cumulativeChartData = useMemo(() => {
    return completedRaces.map(race => {
      // Collect real values
      const raw = {}
      PLAYERS_ORDER.forEach(pid => {
        const player = playerStats.find(p => p.id === pid)
        const cs = player?.cumulativeScores?.find(c => c.raceId === race.id)
        raw[pid] = cs?.cumulative ?? 0
      })

      // Group by value to detect ties
      const groups = {}
      PLAYERS_ORDER.forEach(pid => {
        const v = raw[pid]
        if (!groups[v]) groups[v] = []
        groups[v].push(pid)
      })

      // Real Y values + per-player horizontal pixel offset stored in entry
      const entry = { name: `GP ${race.name}` }
      PLAYERS_ORDER.forEach(pid => {
        entry[pid] = raw[pid]
        const group = groups[raw[pid]]
        if (group.length > 1) {
          const i = group.indexOf(pid)
          const center = (group.length - 1) / 2
          entry[`${pid}_xOffset`] = (i - center) * 9 // px
        } else {
          entry[`${pid}_xOffset`] = 0
        }
      })
      return entry
    })
  }, [completedRaces, playerStats])

  // Race scores bar chart data
  const raceScoresChartData = useMemo(() => {
    return completedRaces.map(race => {
      const entry = { name: `GP ${race.name}` }
      PLAYERS_ORDER.forEach(pid => {
        const player = playerStats.find(p => p.id === pid)
        const rs = player?.raceScores?.find(r => r.raceId === race.id)
        entry[pid] = rs?.net ?? 0
      })
      return entry
    })
  }, [completedRaces, playerStats])

  // Driver prediction stats — per-player prediction counts for tooltip
  const driverPredictionStats = useMemo(() => {
    const driverCounts = {}
    const driverHits = {}
    // { driver: { pid: count } }
    const driverPredictorCounts = {}

    completedRaces.forEach(race => {
      if (!race.result) return
      PLAYERS_ORDER.forEach(pid => {
        const pred = predictions.find(p => p.playerId === pid && p.raceId === race.id)
        if (!pred) return
        ;['P1', 'P2', 'P3'].forEach(pos => {
          const driver = pred.prediction?.[pos]
          if (!driver) return
          driverCounts[driver] = (driverCounts[driver] ?? 0) + 1
          if (!driverPredictorCounts[driver]) driverPredictorCounts[driver] = {}
          driverPredictorCounts[driver][pid] = (driverPredictorCounts[driver][pid] ?? 0) + 1
          if (pred.prediction[pos] === race.result[pos]) {
            driverHits[driver] = (driverHits[driver] ?? 0) + 1
          }
        })
      })
    })

    return Object.entries(driverCounts)
      .map(([driver, count]) => {
        const teamInfo = DRIVER_TEAMS[driver] ?? { team: '', color: '#6B6B8A' }
        return {
          driver,
          count,
          hits: driverHits[driver] ?? 0,
          accuracy: count > 0 ? Math.round(((driverHits[driver] ?? 0) / count) * 100) : 0,
          team: teamInfo.team,
          teamColor: teamInfo.color,
          predictorCounts: driverPredictorCounts[driver] ?? {},
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [completedRaces, predictions])

  const maxDriverCount = driverPredictionStats[0]?.count || 1
  const [activeDriver, setActiveDriver] = useState(null)

  if (loading) {
    return (
      <div className="px-5 pt-5 space-y-4">
        <Skeleton rows={3} height="h-40" />
      </div>
    )
  }

  if (completedRaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-5">
        <span className="text-5xl mb-4">📊</span>
        <p className="font-black text-xl mb-2">Aucune statistique</p>
        <p className="text-muted text-sm">Les stats apparaîtront après la première course</p>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted">{completedRaces.length} course{completedRaces.length > 1 ? 's' : ''} analysée{completedRaces.length > 1 ? 's' : ''}</p>
      </div>

      {/* Player cards */}
      <div className="px-5 mb-6">
        <p className="section-title">Résumé des joueurs</p>
        <div className="grid grid-cols-2 gap-3">
          {playerStats.sort((a, b) => b.total - a.total).map((player, idx) => {
            const isCurrent = player.id === currentPlayerId
            const color = String(player.color ?? PLAYER_COLORS[player.id])
            const avatar = String(player.avatar ?? PLAYER_AVATARS[player.id])
            return (
              <div
                key={player.id}
                className={`card p-4 ${isCurrent ? 'ring-1' : ''}`}
                style={isCurrent ? { '--tw-ring-color': color, borderColor: color + '30' } : {}}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span>{avatar}</span>
                  <span className="font-black text-sm flex-1">{player.displayName}</span>
                  {idx === 0 && <span className="text-xs">👑</span>}
                </div>
                <p className="font-black text-2xl" style={{ color }}>{player.total}</p>
                <p className="text-xs text-muted">pts totaux</p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Moy./course</span>
                    <span className="font-bold">{player.avgScore}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Exact</span>
                    <span className="font-bold text-green-400">{player.exactHits}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Podium ≠ pos</span>
                    <span className="font-bold text-yellow-400">{player.podiumHits}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">⭐ Parfait</span>
                    <span className="font-bold text-gold">{player.perfectPodiums}</span>
                  </div>
                  {player.totalPenalties > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Pénalités</span>
                      <span className="font-bold text-accent">-{player.totalPenalties}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cumulative score line chart */}
      {cumulativeChartData.length > 0 && (
        <div className="px-5 mb-6">
          <p className="section-title">Évolution du classement</p>
          <div className="card p-4" style={{ backgroundColor: '#15151E' }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={cumulativeChartData}
                margin={{ top: 5, right: 5, left: -20, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2E2E42" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#6B6B8A', fontSize: 10 }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#6B6B8A', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                {PLAYERS_ORDER.map(pid => {
                  const player = playerStats.find(p => p.id === pid)
                  const color = String(player?.color ?? PLAYER_COLORS[pid])
                  const name = String(player?.displayName ?? pid.charAt(0).toUpperCase() + pid.slice(1))
                  return (
                    <Line
                      key={pid}
                      type="monotone"
                      dataKey={pid}
                      name={name}
                      stroke={color}
                      strokeWidth={2}
                      dot={(dotProps) => {
                        const xOff = dotProps.payload[`${pid}_xOffset`] ?? 0
                        return (
                          <circle
                            key={dotProps.key}
                            cx={dotProps.cx + xOff}
                            cy={dotProps.cy}
                            r={4}
                            fill={color}
                          />
                        )
                      }}
                      activeDot={(dotProps) => {
                        const xOff = dotProps.payload[`${pid}_xOffset`] ?? 0
                        return (
                          <circle
                            key={dotProps.key}
                            cx={dotProps.cx + xOff}
                            cy={dotProps.cy}
                            r={6}
                            fill={color}
                          />
                        )
                      }}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-race scores bar chart — pure CSS, no Recharts */}
      {raceScoresChartData.length > 0 && (() => {
        const BAR_H = 120 // px, max bar height
        const maxVal = Math.max(1, ...raceScoresChartData.flatMap(entry =>
          PLAYERS_ORDER.map(pid => entry[pid] ?? 0)
        ))
        return (
          <div className="px-5 mb-6">
            <p className="section-title">Scores par course</p>
            <div className="card p-4">
              {/* Legend */}
              <div className="flex gap-3 mb-3 flex-wrap">
                {PLAYERS_ORDER.map(pid => {
                  const player = playerStats.find(p => p.id === pid)
                  const color = String(player?.color ?? PLAYER_COLORS[pid])
                  const name = String(player?.displayName ?? pid)
                  return (
                    <div key={pid} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-muted">{name}</span>
                    </div>
                  )
                })}
              </div>
              {/* Groups */}
              <div className="flex gap-3">
                {raceScoresChartData.map(entry => (
                  <div key={entry.name} className="flex-1 min-w-0 flex flex-col items-center">
                    {/* Bars */}
                    <div className="flex items-end gap-0.5" style={{ height: BAR_H }}>
                      {PLAYERS_ORDER.map(pid => {
                        const player = playerStats.find(p => p.id === pid)
                        const color = String(player?.color ?? PLAYER_COLORS[pid])
                        const val = entry[pid] ?? 0
                        const barH = val > 0 ? Math.max(3, Math.round((val / maxVal) * BAR_H)) : 0
                        return (
                          <div key={pid} className="flex flex-col items-center justify-end" style={{ height: BAR_H }}>
                            {val > 0 && (
                              <span className="text-[8px] font-black mb-0.5 leading-none" style={{ color }}>
                                {val}
                              </span>
                            )}
                            <div
                              style={{
                                width: 10,
                                height: barH,
                                backgroundColor: color,
                                borderRadius: '2px 2px 0 0',
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {/* GP label */}
                    <p className="text-[9px] text-muted mt-1.5 text-center w-full truncate leading-tight">
                      {entry.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Driver prediction stats */}
      {driverPredictionStats.length > 0 && (
        <div className="px-5 mb-6">
          <p className="section-title">Pilotes les plus pronostiqués</p>
          <div className="card p-4 space-y-3">
            {driverPredictionStats.map(({ driver, count, accuracy, team, teamColor, predictorCounts }) => (
              <div key={driver} className="relative">
                {/* Row */}
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onMouseEnter={() => setActiveDriver(driver)}
                  onMouseLeave={() => setActiveDriver(null)}
                  onClick={() => setActiveDriver(d => d === driver ? null : driver)}
                >
                  {/* Driver + team */}
                  <div className="w-[90px] shrink-0">
                    <p className="font-bold text-sm leading-tight">{driver}</p>
                    {team && <p className="text-[9px] text-muted leading-tight">{team}</p>}
                  </div>
                  {/* Bar */}
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / maxDriverCount) * 100}%`, backgroundColor: teamColor }}
                    />
                  </div>
                  {/* Count + accuracy */}
                  <span className="text-xs text-muted w-5 text-right shrink-0">{count}x</span>
                  <span className={`text-xs font-bold w-9 text-right shrink-0 ${
                    accuracy > 50 ? 'text-green-400' : accuracy > 25 ? 'text-yellow-400' : 'text-muted'
                  }`}>
                    {accuracy}%
                  </span>
                </div>

                {/* Tooltip popover */}
                {activeDriver === driver && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg p-3 shadow-xl">
                    <p className="text-[10px] text-muted font-bold uppercase tracking-wide mb-2">Pronostiqué par</p>
                    <div className="space-y-1.5">
                      {PLAYERS_ORDER.filter(pid => predictorCounts[pid]).map(pid => {
                        const p = playerStats.find(ps => ps.id === pid)
                        const avatar = String(p?.avatar ?? PLAYER_AVATARS[pid])
                        const name = String(p?.displayName ?? pid)
                        const times = predictorCounts[pid]
                        return (
                          <div key={pid} className="flex items-center gap-2 text-sm">
                            <span className="text-base leading-none">{avatar}</span>
                            <span className="font-bold flex-1">{name}</span>
                            <span className="text-muted text-xs">{times} fois</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring system */}
      <div className="px-5 mb-6">
        <p className="section-title">Système de points</p>
        <div className="card p-4 space-y-3">
          {[
            { label: 'Position exacte',               pts: '+10', color: 'text-green-400' },
            { label: 'Sur le podium (mauvaise pos.)',  pts: '+3',  color: 'text-yellow-400' },
            { label: '⭐ Podium parfait (bonus)',      pts: '+5',  color: 'text-gold' },
            { label: 'Série de 3 courses',            pts: '+10', color: 'text-blue-400' },
            { label: 'Soumission tardive',            pts: '-10', color: 'text-accent' },
            { label: 'Modification de pronostic',     pts: '-5',  color: 'text-accent' },
          ].map(({ label, pts, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-muted">{label}</span>
              <span className={`font-black text-sm ${color}`}>{pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
