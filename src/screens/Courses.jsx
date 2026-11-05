import { useState, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useRaceTiming } from '../hooks/useRaceTiming'
import { useCollection, where } from '../hooks/useFirestore'
import { calculateRaceScore, calculateAllSeasonScores } from '../utils/scoring'
import { getPlayerIdentity } from '../utils/profiles'
import { withRoundNumbers, formatRaceLocalTimeWithTz } from '../utils/races'
import { getPenaltyAmount } from '../utils/penalties'
import { getDriverPhoto } from '../utils/drivers'
import PredictionSheet from '../components/PredictionSheet'
import Skeleton from '../components/Skeleton'
import HeaderBadges from '../components/HeaderBadges'
import CircuitTrack from '../components/CircuitTrack'

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short'
  })
}

// "Dimanche 8 novembre"
function formatLongDate(dateStr) {
  const text = new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Player's three picks for an upcoming race (photo + name per podium step).
function PredictionPreview({ prediction, drivers, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {POSITIONS.map(pos => {
        const driverName = prediction?.[pos]
        const photoUrl   = getDriverPhoto(drivers, driverName)
        return (
          <div key={pos} className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-[11px] font-bold text-muted">
              {photoUrl
                ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                : <span>{driverName?.[0] ?? '?'}</span>
              }
            </div>
            <span className={`text-[11px] font-bold ${POS_COLOR[pos]}`}>{driverName}</span>
          </div>
        )
      })}
    </div>
  )
}

// "+ Prono" call-to-action for an upcoming race the player hasn't predicted,
// which turns into "Verrouillé" on its own once the GP start is crossed.
// Own component so only this marker re-renders at T, not the whole list.
function NoPronoMark({ race }) {
  const { started } = useRaceTiming(race)
  return started
    ? <span className="text-muted font-bold text-xs">Verrouillé</span>
    : <span className="text-accent font-bold text-xs animate-pulse">+ Prono</span>
}

function detailIcon(detail) {
  if (detail === 'exact') return '✅'
  if (detail === 'podium') return '🔄'
  return '❌'
}

export default function Courses({ currentPlayerId, addToast, activeLeagueName, activeLeagueId, leagueOptions, onSwitchLeague, setActiveTab: setAppTab }) {
  const { user } = useAuth()
  const leagueConstraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: races, loading: racesLoading } = useCollection(user ? 'races' : null)
  const { data: predictions, loading: predsLoading } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: players } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: firestoreDrivers } = useCollection(user ? 'drivers' : null)

  const [selectedRace, setSelectedRace] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filter, setFilter] = useState('upcoming')
  // Id of the unfolded completed race (one at a time), null when all are folded.
  const [expandedId, setExpandedId] = useState(null)

  const loading = racesLoading || predsLoading

  const sortedRaces = useMemo(() =>
    withRoundNumbers([...races].sort((a, b) => a.id - b.id)),
    [races]
  )

  const filteredRaces = useMemo(() => {
    if (filter === 'upcoming') return sortedRaces.filter(r => r.status === 'upcoming')
    // Completed tab: most recent first, so the last GP is at the top.
    if (filter === 'completed') {
      return sortedRaces
        .filter(r => r.status === 'completed' || r.status === 'cancelled')
        .reverse()
    }
    return sortedRaces
  }, [sortedRaces, filter])

  // First race of the "À venir" list = the next GP, shown as a larger card.
  const nextRaceId = filter === 'upcoming' ? (filteredRaces[0]?.id ?? null) : null

  // The latest finished GP is unfolded when the Terminées tab is opened.
  const latestCompletedId = useMemo(
    () => [...sortedRaces].reverse().find(r => r.status === 'completed')?.id ?? null,
    [sortedRaces]
  )

  const getMyPrediction = (raceId) =>
    predictions.find(p => p.playerId === currentPlayerId && p.raceId === raceId)

  const getMyPenalties = (raceId) =>
    penalties.filter(p => p.playerId === currentPlayerId && p.raceId === raceId)

  // Returns { net, details, prediction, penTotal } or null
  const getMyScoreData = (race) => {
    const pred = getMyPrediction(race.id)
    if (!pred || !race.result) return null
    const { total, bonus, details, perfectPodium } = calculateRaceScore(pred.prediction, race.result)
    const pens = getMyPenalties(race.id)
    const penTotal = pens.reduce((s, p) => s + getPenaltyAmount(p), 0)
    return { net: total - penTotal, details, prediction: pred.prediction, penTotal, perfectPodium }
  }

  const openRaceSheet = (race) => {
    setSelectedRace(race)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSelectedRace(null)
  }

  // Sorted so the index-based fallback color/avatar (only used when a
  // player hasn't set up their own profile yet) stays stable and consistent
  // with the same player's fallback identity on Stats/PredictionSheet.
  const playerIds = useMemo(() => [...players].map(p => p.id).sort(), [players])
  const currentPlayerDoc = players.find(p => p.id === currentPlayerId)
  const currentIdentity = getPlayerIdentity(profiles, currentPlayerDoc, Math.max(0, playerIds.indexOf(currentPlayerId)))
  const playerColor = currentIdentity.color
  const playerAvatar = currentIdentity.avatar
  const playerDisplayName = currentIdentity.displayName

  const currentPlayerTotal = useMemo(() => {
    if (!players.length) return 0
    return calculateAllSeasonScores(players, sortedRaces, predictions, penalties)
      .find(p => p.id === currentPlayerId)?.total ?? 0
  }, [players, sortedRaces, predictions, penalties, currentPlayerId])

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <HeaderBadges
          leagueName={activeLeagueName}
          leagueId={activeLeagueId}
          leagueOptions={leagueOptions}
          onSwitchLeague={onSwitchLeague}
          onManageLeagues={() => setAppTab?.('leagues')}
          player={{
            avatar: playerAvatar,
            color: playerColor,
            displayName: playerDisplayName,
            points: currentPlayerTotal,
          }}
          onOpenProfile={() => setAppTab?.('monprofil')}
        />
        <h1 className="text-2xl font-black tracking-tight mb-4">Courses 2026</h1>
        <div className="flex gap-2 bg-surfaceHigh rounded-xl p-1">
          {[
            { id: 'upcoming',  label: 'À venir'   },
            { id: 'completed', label: 'Terminées' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id)
                setExpandedId(f.id === 'completed' ? latestCompletedId : null)
              }}
              aria-pressed={filter === f.id}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-all ${
                filter === f.id ? 'bg-accent text-white' : 'text-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Race list */}
      <div className="px-5 space-y-3">
        {loading ? (
          <Skeleton rows={8} height="h-20" />
        ) : (
          filteredRaces.map(race => {
            const isCompleted = race.status === 'completed'
            const isCancelled = race.status === 'cancelled'
            const myPred = getMyPrediction(race.id)
            const myScoreData = isCompleted ? getMyScoreData(race) : null
            // Completed races fold/unfold in place (one at a time); the other
            // cards (upcoming, cancelled) still open the sheet directly.
            const expandable = isCompleted
            const isOpen = expandable && expandedId === race.id
            // The hour only matters before the race; folded finished cards stay
            // minimal (the sheet still shows it).
            const timeLabel = isCompleted ? null : formatRaceLocalTimeWithTz(race)

            if (race.id === nextRaceId) {
              return (
                <div key={race.id} className="space-y-3">
                  <div className="card overflow-hidden">
                    <div className="flex items-center justify-between bg-surfaceHigh px-4 min-h-[40px]">
                      <span className="text-[11px] font-bold tracking-widest uppercase">Prochain GP</span>
                      {myPred
                        ? <span className="text-green-400 font-bold text-xs">✓ Soumis</span>
                        : <NoPronoMark race={race} />}
                    </div>
                    <button
                      onClick={() => openRaceSheet(race)}
                      className="w-full p-4 text-left grid grid-cols-[minmax(0,1fr)_108px] gap-3 items-center active:opacity-90"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[13px] font-black shrink-0">
                            {race.round}
                          </div>
                          <span className="w-8 h-8 flex items-center justify-center text-[26px] leading-none shrink-0">{race.flag}</span>
                          <div className="min-w-0">
                            <p className="text-lg font-bold leading-tight">GP {race.name}</p>
                            <p className="text-xs text-muted">{race.city}</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted">
                          <p className="text-white/75">{formatLongDate(race.date)}</p>
                          {timeLabel && <p>Course à {timeLabel}</p>}
                        </div>
                        {myPred && (
                          <PredictionPreview prediction={myPred.prediction} drivers={firestoreDrivers} className="mt-3 flex-wrap" />
                        )}
                      </div>
                      <CircuitTrack race={race} />
                    </button>
                  </div>
                  {filteredRaces.length > 1 && (
                    <p className="text-[11px] font-bold tracking-widest uppercase text-muted pt-2">Ensuite</p>
                  )}
                </div>
              )
            }

            return (
              <div key={race.id} className="card">
                <button
                  onClick={() => (expandable ? setExpandedId(isOpen ? null : race.id) : openRaceSheet(race))}
                  aria-expanded={expandable ? isOpen : undefined}
                  className="w-full min-h-[72px] p-4 text-left transition-all active:scale-[0.99]"
                >
                  {/* ── Top row ── */}
                  <div className="flex items-center gap-3">
                    {/* Race number — display round, decoupled from the technical id */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      isCancelled
                        ? 'bg-red-500/20 text-red-400'
                        : isCompleted
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-white/10 text-white'
                    }`}>
                      {race.round}
                    </div>

                    {/* Flag stays top-aligned so a long name can wrap beside it */}
                    <span className="text-xl leading-none self-start mt-0.5 shrink-0">{race.flag}</span>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight">GP {race.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {race.city} · {formatDate(race.date)}
                        {timeLabel && (
                          <> · <span className="text-white/70">{timeLabel}</span></>
                        )}
                      </p>
                    </div>

                    {/* Right: score or prono status */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {isCancelled ? (
                        <span className="text-[11px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                          Annulé
                        </span>
                      ) : isCompleted ? (
                        myScoreData !== null ? (
                          <>
                            <span className="font-black text-base leading-tight" style={{ color: playerColor }}>
                              {myScoreData.net} pts
                            </span>
                            {myScoreData.penTotal > 0 && (
                              <span className="text-[11px] text-accent font-bold">-{myScoreData.penTotal} pén.</span>
                            )}
                          </>
                        ) : myPred ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <span className="text-xs text-muted">Pas de prono</span>
                        )
                      ) : (
                        myPred ? (
                          <span className="text-green-400 font-bold text-xs">✓ Soumis</span>
                        ) : (
                          <NoPronoMark race={race} />
                        )
                      )}
                    </div>

                    {expandable && (
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>

                  {/* ── Upcoming: prediction preview ── */}
                  {!isCompleted && myPred && (
                    <PredictionPreview prediction={myPred.prediction} drivers={firestoreDrivers} className="mt-2" />
                  )}
                </button>

                {/* ── Completed, unfolded: real podium + my picks ── */}
                {isOpen && (
                  <div className="px-4 pb-4">
                    {race.result && (
                      <div className="border-t border-border/40 pt-3">
                        {myScoreData && (
                          <div className="flex justify-between text-[11px] text-muted pb-1.5">
                            <span>Résultat</span>
                            <span>Ton prono</span>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {POSITIONS.map((pos, i) => {
                            const real     = race.result[pos]
                            const detail   = myScoreData?.details?.[pos]
                            const myPick   = myScoreData?.prediction?.[pos]
                            const photoUrl = getDriverPhoto(firestoreDrivers, real)
                            return (
                              <div key={pos} className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black text-bg shrink-0 ${
                                  i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                                }`}>
                                  {i + 1}
                                </div>
                                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-[11px] font-bold text-muted">
                                  {photoUrl
                                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                    : <span>{real?.[0] ?? '?'}</span>
                                  }
                                </div>
                                <span className="text-sm font-bold flex-1">{real}</span>
                                {detail !== undefined && (
                                  <>
                                    <span className="text-xs text-muted">{myPick}</span>
                                    <span className="text-sm leading-none">{detailIcon(detail)}</span>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {!myPred && (
                          <p className="text-xs text-muted pt-2">Tu n'avais pas de pronostic pour ce GP.</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => openRaceSheet(race)}
                      className="btn-primary w-full mt-3 text-sm"
                    >
                      Voir la feuille complète →
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <PredictionSheet
        isOpen={sheetOpen}
        race={selectedRace}
        races={races}
        onClose={closeSheet}
        currentPlayerId={currentPlayerId}
        activeLeagueId={activeLeagueId}
        addToast={addToast}
        players={players}
        profiles={profiles}
        predictions={predictions}
        penalties={penalties}
        drivers={firestoreDrivers}
      />
    </div>
  )
}
