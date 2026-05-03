import { useMemo } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { calculateAllSeasonScores } from '../utils/scoring'
import { getTeamColor, getDriverTeam } from '../data/drivers'
import Countdown from '../components/Countdown'
import Skeleton, { SkeletonCard } from '../components/Skeleton'

const PLAYERS_ORDER = ['william', 'quentin', 'alex', 'romain']

const PLAYER_COLORS_FALLBACK = {
  william: '#3B82F6',
  quentin: '#22C55E',
  alex: '#F97316',
  romain: '#A855F7',
}

const PLAYER_AVATARS_FALLBACK = {
  william: '🏎️',
  quentin: '🏁',
  alex: '🔥',
  romain: '⚡',
}

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }
const POS_BG    = { P1: 'bg-gold',   P2: 'bg-silver',   P3: 'bg-bronze'   }

// Dense ranking: two 🥈 → next is 🥉 (no gap)
function rankWithTies(sorted) {
  const uniqueTotals = [...new Set(sorted.map(p => p.total))].sort((a, b) => b - a)
  return sorted.map(player => ({
    ...player,
    rank: uniqueTotals.indexOf(player.total) + 1,
  }))
}

function rankEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

// Format a UTC date string in a given IANA timezone as "HH:MM"
function formatTimeInTz(isoString, tz) {
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get timezone abbreviation (CET, CEST, GST…)
function getTzAbbr(isoString, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(new Date(isoString))
  return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
}

function getDriverPhoto(drivers, displayName) {
  if (!displayName || !drivers?.length) return null
  return drivers.find(d => d.last_name?.toLowerCase() === displayName.toLowerCase())?.headshot_url ?? null
}

export default function Accueil({ currentPlayerId, setActiveTab }) {
  const { data: players, loading: playersLoading } = useCollection('players')
  const { data: races, loading: racesLoading } = useCollection('races')
  const { data: predictions } = useCollection('predictions')
  const { data: penalties } = useCollection('penalties')
  const { data: drivers } = useCollection('drivers')

  const loading = playersLoading || racesLoading

  // Current player: direct Firestore lookup, with fallback to defaults
  const currentPlayerData = useMemo(
    () => players.find(p => p.id === currentPlayerId),
    [players, currentPlayerId]
  )
  const playerDisplayName = String(
    currentPlayerData?.displayName ??
    (currentPlayerId ? currentPlayerId.charAt(0).toUpperCase() + currentPlayerId.slice(1) : '—')
  )
  const playerColor = String(currentPlayerData?.color ?? PLAYER_COLORS_FALLBACK[currentPlayerId] ?? '#6B6B8A')
  const playerAvatar = String(currentPlayerData?.avatar ?? PLAYER_AVATARS_FALLBACK[currentPlayerId] ?? '🏎️')

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  const nextRace = useMemo(() =>
    sortedRaces.find(r => r.status === 'upcoming'),
    [sortedRaces]
  )

  const completedRaces = useMemo(() =>
    sortedRaces.filter(r => r.status === 'completed'),
    [sortedRaces]
  )

  const lastRace = useMemo(() =>
    completedRaces[completedRaces.length - 1] ?? null,
    [completedRaces]
  )

  const standings = useMemo(() => {
    if (!players.length || !races.length) return []
    const raw = calculateAllSeasonScores(players, sortedRaces, predictions, penalties)
      .sort((a, b) => b.total - a.total)
    return rankWithTies(raw)
  }, [players, races, predictions, penalties, sortedRaces])

  const currentPlayerStanding = useMemo(() =>
    standings.find(p => p.id === currentPlayerId),
    [standings, currentPlayerId]
  )

  const myPrediction = useMemo(() => {
    if (!nextRace) return null
    return predictions.find(p => p.playerId === currentPlayerId && p.raceId === nextRace.id)
  }, [nextRace, predictions, currentPlayerId])

  // Race start time: use raceTimeUTC from data, fallback to 12:00 UTC
  const raceUtcTime = nextRace
    ? `${nextRace.date}T${nextRace.raceTimeUTC ?? '12:00'}:00Z`
    : null

  const localTimes = useMemo(() => {
    if (!raceUtcTime) return null
    return {
      paris: formatTimeInTz(raceUtcTime, 'Europe/Paris'),
      parisTz: getTzAbbr(raceUtcTime, 'Europe/Paris'),
      dubai: formatTimeInTz(raceUtcTime, 'Asia/Dubai'),
      dubaiTz: getTzAbbr(raceUtcTime, 'Asia/Dubai'),
    }
  }, [raceUtcTime])

  const isLocked = useMemo(() => {
    if (!raceUtcTime) return false
    const diff = new Date(raceUtcTime).getTime() - Date.now()
    return diff >= 0 && diff < 60 * 60 * 1000
  }, [raceUtcTime])

  // Helper: get player data (color, avatar, displayName) from Firebase with fallbacks
  const getPlayerData = (pid) => {
    const fb = players.find(p => p.id === pid)
    return {
      color: String(fb?.color ?? PLAYER_COLORS_FALLBACK[pid] ?? '#6B6B8A'),
      avatar: String(fb?.avatar ?? PLAYER_AVATARS_FALLBACK[pid] ?? '🏎️'),
      displayName: String(fb?.displayName ?? (pid.charAt(0).toUpperCase() + pid.slice(1))),
    }
  }

  return (
    <div className="pb-4">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4">
        {/* Row 1: welcome line + player badge */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted font-medium">
            Bienvenue <span className="text-white font-bold">{playerDisplayName}</span>
          </p>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
            style={{ borderColor: playerColor, backgroundColor: `${playerColor}18` }}
          >
            <span className="text-base leading-none">{playerAvatar}</span>
            <div className="flex flex-col items-end leading-none">
              <span className="text-xs font-black" style={{ color: playerColor }}>
                {playerDisplayName}
              </span>
              <span className="text-[10px] text-muted font-bold mt-0.5">
                {currentPlayerStanding?.total ?? 0} pts
              </span>
            </div>
          </div>
        </div>
        {/* Row 2: main title */}
        <h1 className="text-2xl font-black tracking-tight text-center">
          Prono F1 Saison 2026
        </h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Empty state */}
        {!loading && races.length === 0 && (
          <div className="card p-5 border-accent/40">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🌱</span>
              <div>
                <p className="font-bold text-sm mb-1">Aucune donnée trouvée</p>
                <p className="text-xs text-muted leading-relaxed">
                  La base de données est vide. Rendez-vous dans{' '}
                  <strong className="text-white">⚙️ Administration</strong> et cliquez sur{' '}
                  <strong className="text-accent">Initialiser les données</strong>{' '}
                  (mot de passe : <span className="font-mono text-accent">f1paris2026</span>).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 1. Prochain GP ── */}
        {loading ? (
          <SkeletonCard />
        ) : nextRace ? (
          <div className="card p-5">
            <span className="text-accent font-bold text-xs uppercase tracking-widest">Prochain GP</span>
            <div className="flex items-center gap-3 mt-3 mb-4">
              <span className="text-4xl">{nextRace.flag}</span>
              <div>
                <h2 className="text-xl font-black leading-tight">GP {nextRace.name}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {new Date(nextRace.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </p>
              </div>
            </div>

            {/* Full countdown J / HH / MM / SEC */}
            <Countdown targetDate={raceUtcTime} />

            {/* Timezone lines */}
            {localTimes && (
              <div className="flex justify-center gap-8 mt-3 text-xs">
                <span className="text-muted">
                  🇫🇷 <span className="text-white font-bold">{localTimes.paris}</span>{' '}
                  <span className="text-[10px] text-muted">{localTimes.parisTz}</span>
                </span>
                <span className="text-muted">
                  🇦🇪 <span className="text-white font-bold">{localTimes.dubai}</span>{' '}
                  <span className="text-[10px] text-muted">{localTimes.dubaiTz}</span>
                </span>
              </div>
            )}

            {/* Prediction status */}
            <div className="mt-4 pt-4 border-t border-border">
              {myPrediction ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-400 font-semibold">Pronostic soumis</span>
                  <span className="text-muted text-xs ml-auto font-mono">
                    {myPrediction.prediction?.P1} · {myPrediction.prediction?.P2} · {myPrediction.prediction?.P3}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-sm text-accent font-semibold">Pas encore de pronostic</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('courses')}
                    className="text-xs bg-accent text-white font-bold px-3 py-1.5 rounded-lg"
                  >
                    Pronostiquer →
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-5 text-center">
            <span className="text-4xl">🏁</span>
            <p className="font-bold mt-2">Saison terminée !</p>
          </div>
        )}

        {/* ── 2. Classement général ── */}
        {loading ? (
          <SkeletonCard />
        ) : standings.length > 0 ? (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">Classement général</span>
              <button onClick={() => setActiveTab('classement')} className="text-xs text-accent font-bold">
                Voir tout →
              </button>
            </div>
            <div className="space-y-2">
              {standings.map(player => {
                const isCurrent = player.id === currentPlayerId
                const color = String(player.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                const avatar = String(player.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? 'bg-surfaceHigh' : ''}`}
                  >
                    <span className="w-6 text-center text-base leading-none">
                      {rankEmoji(player.rank)}
                    </span>
                    <span className="text-xl leading-none">{avatar}</span>
                    <span className={`flex-1 font-bold text-sm ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                      {String(player.displayName ?? player.id)}
                      {isCurrent && <span className="text-xs text-muted ml-1">(vous)</span>}
                    </span>
                    <span className="font-black text-sm" style={{ color }}>
                      {player.total} pts
                    </span>
                  </div>
                )
              })}
            </div>
            {completedRaces.length > 0 && (
              <p className="text-xs text-muted mt-3 text-center">
                {completedRaces.length} course{completedRaces.length > 1 ? 's' : ''} disputée{completedRaces.length > 1 ? 's' : ''}{' '}
                · {sortedRaces.length - completedRaces.length} restante{sortedRaces.length - completedRaces.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : null}

        {/* ── 3. Pronostics du prochain GP ── */}
        {nextRace && (
          loading ? (
            <SkeletonCard />
          ) : (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="section-title">Pronostics — GP {nextRace.name} 🏁</span>
                {isLocked && (
                  <span className="text-xs text-red-400 font-bold">🔒 Verrouillés</span>
                )}
              </div>
              <div className="space-y-3">
                {standings.map(player => {
                  const color = String(player.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                  const avatar = String(player.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                  const displayName = String(player.displayName ?? player.id)
                  const pred = predictions.find(p => p.playerId === player.id && p.raceId === nextRace.id)
                  const pens = penalties.filter(p => p.playerId === player.id && p.raceId === nextRace.id)
                  const penTotal = pens.reduce((s, p) => s + (p.type === 'late' ? 10 : 5), 0)

                  if (!pred) return (
                    <div key={player.id} className="card p-3 flex items-center gap-3">
                      <span className="text-xl leading-none">{avatar}</span>
                      <span className="font-bold text-sm flex-1" style={{ color }}>{displayName}</span>
                      <span className="text-xs text-muted">⏳ En attente de prono...</span>
                    </div>
                  )

                  return (
                    <div key={player.id} className="card p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl leading-none">{avatar}</span>
                        <span className="font-bold text-sm flex-1" style={{ color }}>{displayName}</span>
                        {penTotal > 0 && (
                          <span className="text-xs text-red-400 font-bold">-{penTotal} pén.</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {POSITIONS.map(pos => {
                          const driverName = pred.prediction?.[pos]
                          const photoUrl = getDriverPhoto(drivers, driverName)
                          const teamColor = getTeamColor(driverName)
                          return (
                            <div key={pos} className="rounded-lg overflow-hidden border border-border bg-surfaceHigh/50">
                              <div className="h-1" style={{ backgroundColor: teamColor ?? '#6B6B8A' }} />
                              <div className="p-2 flex flex-col items-center gap-1">
                                <div className={`text-[9px] font-bold ${POS_COLOR[pos]}`}>{pos}</div>
                                <div className="w-9 h-9 rounded-full overflow-hidden bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted shrink-0">
                                  {photoUrl
                                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                    : <span>{driverName?.[0] ?? '?'}</span>
                                  }
                                </div>
                                <div className="text-[10px] font-bold truncate w-full text-center leading-tight">{driverName}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* ── 4. Dernière course ── résultat officiel */}
        {loading ? (
          <SkeletonCard />
        ) : lastRace?.result ? (
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">{lastRace.flag}</span>
              <div className="flex-1">
                <span className="text-accent font-bold text-xs uppercase tracking-widest">Dernière course</span>
                <h3 className="font-black text-base leading-tight">GP {lastRace.name}</h3>
                <p className="text-xs text-muted">
                  {new Date(lastRace.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                  {lastRace.raceTime && (
                    <> · <span className="text-white/70">{lastRace.raceTime}</span></>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {POSITIONS.map((pos, i) => {
                const driverName = lastRace.result[pos]
                const photoUrl   = getDriverPhoto(drivers, driverName)
                return (
                  <div key={pos} className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                    <div className={`position-badge text-bg font-black text-sm ${POS_BG[pos]}`}>
                      {i + 1}
                    </div>
                    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                      {photoUrl
                        ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                        : <span>{driverName?.[0] ?? '?'}</span>
                      }
                    </div>
                    <div className="flex-1">
                      <p className="font-bold leading-tight">{driverName}</p>
                      <p className="text-[10px] text-muted">{getDriverTeam(driverName)?.name}</p>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getTeamColor(driverName) }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
