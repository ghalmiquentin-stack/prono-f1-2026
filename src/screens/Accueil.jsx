import { useMemo, useState } from 'react'
import { Pencil, Clock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, useDocument, where } from '../hooks/useFirestore'
import { calculateAllSeasonScores } from '../utils/scoring'
import { getTeamColor } from '../data/drivers'
import { getProfile } from '../utils/profiles'
import { hasRaceStarted, formatRaceLocalTime } from '../utils/races'
import { getModificationCount } from '../utils/predictions'
import { summarizePenalties } from '../utils/penalties'
import { getDriverPhoto } from '../utils/drivers'
import Countdown from '../components/Countdown'
import ActiveLeagueBadge from '../components/ActiveLeagueBadge'
import PlayerBadge from '../components/PlayerBadge'
import PredictionSheet from '../components/PredictionSheet'
import Skeleton, { SkeletonCard } from '../components/Skeleton'

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

// Format a UTC date string as "HH:MM" — no explicit timeZone, so this
// resolves to whichever timezone the viewer's own browser is set to.
function formatLocalTime(isoString) {
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Viewer's own timezone abbreviation (CET, EST, JST…) — same no-timeZone-
// option principle as formatLocalTime.
function getLocalTzAbbr(isoString) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
  }).formatToParts(new Date(isoString))
  return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
}

// No explicit timeZone on either part — resolves to the viewer's own browser
// timezone rather than a fixed France/Dubai pair.
function formatPredTime(ts) {
  if (!ts) return null
  const date = ts?.toDate?.() ?? new Date(ts)
  const datePart = date.toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${datePart} à ${h}h${m}`
}

export default function Accueil({ currentPlayerId, setActiveTab, activeLeagueName, activeLeagueId, addToast }) {
  const { user } = useAuth()
  const [predictionSheetOpen, setPredictionSheetOpen] = useState(false)
  const [selectedRace, setSelectedRace] = useState(null)
  const leagueConstraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: players, loading: playersLoading } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races, loading: racesLoading } = useCollection(user ? 'races' : null)
  const { data: predictions } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: drivers } = useCollection(user ? 'drivers' : null)
  const { data: activeLeague } = useDocument(user ? 'leagues' : null, activeLeagueId)

  const loading = playersLoading || racesLoading

  // Current player: direct Firestore lookup, identity resolved via profiles/{authUid}
  const currentPlayerData = useMemo(
    () => players.find(p => p.id === currentPlayerId),
    [players, currentPlayerId]
  )
  const currentIdentity = useMemo(
    () => getProfile(profiles, currentPlayerData),
    [profiles, currentPlayerData]
  )
  const playerDisplayName = String(
    currentIdentity?.displayName ??
    (currentPlayerId ? currentPlayerId.charAt(0).toUpperCase() + currentPlayerId.slice(1) : '—')
  )
  const playerColor = String(currentIdentity?.color ?? PLAYER_COLORS_FALLBACK[currentPlayerId] ?? '#6B6B8A')
  const playerAvatar = String(currentIdentity?.avatar ?? PLAYER_AVATARS_FALLBACK[currentPlayerId] ?? '🏎️')

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

  // Races still to come — excludes cancelled GPs, which will never be run
  // and shouldn't inflate the "restantes" count.
  const remainingRacesCount = useMemo(() =>
    sortedRaces.filter(r => r.status === 'upcoming').length,
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

  // Players ranked by points scored on the last race specifically (not the
  // cumulative season total) — reuses the per-race breakdown already
  // computed by calculateAllSeasonScores (standings[].raceScores), so the
  // "Dernière course" card stays consistent with Classement/Stats instead
  // of recomputing scores a different way.
  const lastRaceRanking = useMemo(() => {
    if (!lastRace) return []
    return standings
      .map(player => ({
        ...player,
        raceScore: player.raceScores.find(rs => rs.raceId === lastRace.id) ?? null,
      }))
      .sort((a, b) => (b.raceScore?.net ?? -Infinity) - (a.raceScore?.net ?? -Infinity))
  }, [standings, lastRace])

  const myPrediction = useMemo(() => {
    if (!nextRace) return null
    return predictions.find(p => p.playerId === currentPlayerId && p.raceId === nextRace.id)
  }, [nextRace, predictions, currentPlayerId])

  // Race start time: use raceTimeUTC from data, fallback to 12:00 UTC
  const raceUtcTime = nextRace
    ? `${nextRace.date}T${nextRace.raceTimeUTC ?? '12:00'}:00Z`
    : null

  const localTime = useMemo(() => {
    if (!raceUtcTime) return null
    return {
      time: formatLocalTime(raceUtcTime),
      tzAbbr: getLocalTzAbbr(raceUtcTime),
    }
  }, [raceUtcTime])

  const isLocked = useMemo(() => {
    if (!raceUtcTime) return false
    const diff = new Date(raceUtcTime).getTime() - Date.now()
    return diff >= 0 && diff < 60 * 60 * 1000
  }, [raceUtcTime])

  // "Hide predictions before race" league rule — lifts automatically once
  // the GP has actually started, same trigger as the countdown/auto-lock.
  const hidePredictionsActive = !!activeLeague?.rules?.hidePredictionsBeforeRace?.enabled
    && !!nextRace && !hasRaceStarted(nextRace)

  // Full prediction card for one player — unchanged from before; only used
  // as-is when hiding is off, or for the current player's own card.
  const renderPredictionCard = (player, { mine = false } = {}) => {
    const identity = getProfile(profiles, player)
    const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
    const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
    const displayName = String(identity?.displayName ?? player.id)
    const pred = predictions.find(p => p.playerId === player.id && p.raceId === nextRace.id)
    const modCount = getModificationCount(pred)
    // Edit button: only ever for the current player's own card, and only
    // while the race hasn't started — unless the admin granted an
    // exceptional manual unlock for this specific prediction.
    const canEdit = mine && (!hasRaceStarted(nextRace) || pred?.manualUnlockOverride === true)

    if (!pred) return (
      <div key={player.id} className="card p-3 flex items-center gap-3">
        <span className="text-xl leading-none">{avatar}</span>
        <span className="font-bold text-sm flex-1" style={{ color }}>
          {displayName}
          {mine && <span className="text-xs text-muted font-normal ml-1">(vous)</span>}
        </span>
        <span className="text-xs text-muted">⏳ En attente de prono...</span>
      </div>
    )

    // Real, current penalties for this prediction (modifications + late
    // submission) — not modificationCount or a theoretical count × configured
    // amount, so an admin deletion is reflected immediately and the
    // displayed label stays consistent with the displayed points.
    const penaltySummary = summarizePenalties(penalties, player.id, nextRace.id)

    return (
      <div key={player.id} className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl leading-none">{avatar}</span>
          <span className="font-bold text-sm flex-1" style={{ color }}>
            {displayName}
            {mine && <span className="text-xs text-muted font-normal ml-1">(vous)</span>}
          </span>
          {penaltySummary.label && (
            <span className="text-xs text-red-400 font-bold text-right">
              {penaltySummary.label}
            </span>
          )}
          {canEdit && (
            <button
              onClick={() => openRaceSheet(nextRace)}
              className="p-1 rounded-lg text-muted hover:text-white transition-colors"
              aria-label="Modifier mon pronostic"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(pos => {
            const driverName = pred.prediction?.[pos]
            const photoUrl   = getDriverPhoto(drivers, driverName)
            const teamColor  = getTeamColor(driverName)
            const isModified = modCount > 0 && pred.prediction?.[pos] !== pred.initialPrediction?.[pos]
            return (
              <div key={pos} className="rounded-lg overflow-hidden border border-border bg-surfaceHigh/50">
                <div className="h-1" style={{ backgroundColor: teamColor ?? '#6B6B8A' }} />
                <div className="p-2 flex flex-col items-center gap-1">
                  <div className={`text-[9px] font-bold ${POS_COLOR[pos]}`}>{pos}</div>
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted shrink-0">
                    {photoUrl
                      ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                      : <span>{driverName?.[0] ?? '?'}</span>
                    }
                  </div>
                  <div className="text-[10px] font-bold truncate w-full text-center leading-tight">{driverName}</div>
                  {isModified && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ color: '#E8002D', backgroundColor: '#E8002D22' }}>Modifié</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {pred.submittedAt && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock size={12} />
              Soumis le {formatPredTime(pred.submittedAt)}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Opens the shared race detail modal (same one used from Courses) for a
  // given race — defaults to its "Résultat" tab when the race is completed.
  const openRaceSheet = (race) => {
    setSelectedRace(race)
    setPredictionSheetOpen(true)
  }

  // Helper: get player data (color, avatar, displayName) from profiles/{authUid} with fallbacks
  const getPlayerData = (pid) => {
    const fb = players.find(p => p.id === pid)
    const identity = getProfile(profiles, fb)
    return {
      color: String(identity?.color ?? PLAYER_COLORS_FALLBACK[pid] ?? '#6B6B8A'),
      avatar: String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[pid] ?? '🏎️'),
      displayName: String(identity?.displayName ?? (pid.charAt(0).toUpperCase() + pid.slice(1))),
    }
  }

  return (
    <div className="pb-4">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4">
        {/* Row 1: league badge + player badge */}
        <div className="flex items-center justify-between gap-3 mb-2">
          {activeLeagueName ? <ActiveLeagueBadge name={activeLeagueName} /> : <span />}
          <PlayerBadge
            avatar={playerAvatar}
            color={playerColor}
            displayName={playerDisplayName}
            points={currentPlayerStanding?.total ?? 0}
            onClick={() => setActiveTab('monprofil')}
          />
        </div>
        {/* Row 2: main title */}
        <h1 className="text-2xl font-black tracking-tight">
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

            {/* Local start time — viewer's own timezone, same instant as the countdown */}
            {localTime && (
              <div className="flex justify-center mt-3 text-xs">
                <span className="text-muted flex items-center gap-1.5">
                  <Clock size={12} />
                  <span className="text-white font-bold">{localTime.time}</span>
                  <span className="text-[10px] text-muted">{localTime.tzAbbr}</span>
                </span>
              </div>
            )}

            {/* Prediction status */}
            <div className="mt-4 pt-4 border-t border-border">
              {myPrediction ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-400 font-semibold">Pronostic soumis</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-sm text-accent font-semibold">Pas encore de pronostic</span>
                  </div>
                  <button
                    onClick={() => openRaceSheet(nextRace)}
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
                const identity = getProfile(profiles, player)
                const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? 'bg-surfaceHigh' : ''} ${player.active === false ? 'opacity-60' : ''}`}
                  >
                    <span className="w-6 text-center text-base leading-none">
                      {rankEmoji(player.rank)}
                    </span>
                    <span className="text-xl leading-none">{avatar}</span>
                    <span className={`flex-1 font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                      {String(identity?.displayName ?? player.id)}
                      {isCurrent && <span className="text-xs text-muted ml-1">(vous)</span>}
                      {player.active === false && (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-muted/20 text-muted px-1.5 py-0.5 rounded-full">
                          Parti
                        </span>
                      )}
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
                · {remainingRacesCount} restante{remainingRacesCount > 1 ? 's' : ''}
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
                {(() => {
                  const me = standings.find(p => p.id === currentPlayerId)
                  return me ? renderPredictionCard(me, { mine: true }) : null
                })()}
                <div className="pt-2 mt-1 border-t border-border">
                  <p className="text-[10px] text-muted uppercase tracking-wide font-bold mb-2">Les autres joueurs</p>
                </div>
                {standings.filter(p => p.id !== currentPlayerId).map(player => {
                  if (!hidePredictionsActive) return renderPredictionCard(player)

                  const identity = getProfile(profiles, player)
                  const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                  const displayName = String(identity?.displayName ?? player.id)
                  const hasSubmitted = predictions.some(p => p.playerId === player.id && p.raceId === nextRace.id)
                  return (
                    <div key={player.id} className="card p-3 flex items-center gap-3">
                      <span className="text-xl leading-none">{avatar}</span>
                      <span className="font-bold text-sm flex-1">{displayName}</span>
                      {hasSubmitted ? (
                        <span className="text-xs text-green-400 font-bold">🔒 Verrouillé</span>
                      ) : (
                        <span className="text-xs text-muted font-bold">⏳ En attente</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* ── 4. Dernière course ── résultat officiel + points de chacun */}
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
                  {formatRaceLocalTime(lastRace) && (
                    <> · <span className="text-white/70">{formatRaceLocalTime(lastRace)}</span></>
                  )}
                </p>
              </div>
            </div>

            {/* Podium officiel — version compacte, avec petite photo */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {POSITIONS.map((pos, i) => {
                const driverName = lastRace.result[pos]
                const photoUrl   = getDriverPhoto(drivers, driverName)
                return (
                  <div key={pos} className="flex flex-col items-center gap-1 p-2 card-elevated rounded-lg">
                    <span className={`text-xs font-bold uppercase tracking-wide ${POS_COLOR[pos]}`}>
                      {rankEmoji(i + 1)} {pos}
                    </span>
                    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                      {photoUrl
                        ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                        : <span>{driverName?.[0] ?? '?'}</span>
                      }
                    </div>
                    <span className="text-sm font-bold text-center leading-tight truncate w-full">
                      {driverName}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Points marqués par chaque joueur de la ligue sur ce GP précis */}
            <div className="mt-4 pt-4 border-t border-border space-y-1.5">
              <p className="text-[10px] text-muted uppercase tracking-wide font-bold mb-1">Points marqués sur ce GP</p>
              {lastRaceRanking.map(player => {
                const isCurrent = player.id === currentPlayerId
                const identity = getProfile(profiles, player)
                const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                const displayName = String(identity?.displayName ?? player.id)
                const rs = player.raceScore
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 p-2 rounded-lg ${isCurrent ? 'bg-surfaceHigh' : ''}`}
                  >
                    <span className="text-xl leading-none">{avatar}</span>
                    <span className={`flex-1 font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                      {displayName}
                      {isCurrent && <span className="text-xs text-muted ml-1">(vous)</span>}
                    </span>
                    {rs?.net != null ? (
                      <div className="flex items-center gap-2 shrink-0">
                        {rs.penalty > 0 && (
                          <span className="text-xs text-accent font-bold">-{rs.penalty} pén.</span>
                        )}
                        <span className="font-black text-sm" style={{ color }}>{rs.net} pts</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted shrink-0">Pas de prono</span>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => openRaceSheet(lastRace)}
              className="btn-primary w-full mt-4 text-sm"
            >
              Voir le podium et les pronostics →
            </button>
          </div>
        ) : null}
      </div>

      <PredictionSheet
        isOpen={predictionSheetOpen}
        race={selectedRace}
        races={races}
        onClose={() => { setPredictionSheetOpen(false); setSelectedRace(null) }}
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
