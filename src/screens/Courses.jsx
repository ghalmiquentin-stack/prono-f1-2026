import { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, where } from '../hooks/useFirestore'
import { calculateRaceScore, calculateAllSeasonScores } from '../utils/scoring'
import { getPlayerIdentity } from '../utils/profiles'
import { withRoundNumbers, formatRaceLocalTime } from '../utils/races'
import { getPenaltyAmount } from '../utils/penalties'
import { getDriverPhoto } from '../utils/drivers'
import PredictionSheet from '../components/PredictionSheet'
import Skeleton from '../components/Skeleton'
import ActiveLeagueBadge from '../components/ActiveLeagueBadge'
import PlayerBadge from '../components/PlayerBadge'

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short'
  })
}

function detailIcon(detail) {
  if (detail === 'exact') return '✅'
  if (detail === 'podium') return '🔄'
  return '❌'
}

export default function Courses({ currentPlayerId, addToast, activeLeagueName, activeLeagueId, setActiveTab: setAppTab }) {
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

  const loading = racesLoading || predsLoading

  const sortedRaces = useMemo(() =>
    withRoundNumbers([...races].sort((a, b) => a.id - b.id)),
    [races]
  )

  const filteredRaces = useMemo(() => {
    if (filter === 'upcoming') return sortedRaces.filter(r => r.status === 'upcoming')
    if (filter === 'completed') return sortedRaces.filter(r => r.status === 'completed' || r.status === 'cancelled')
    return sortedRaces
  }, [sortedRaces, filter])

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
        <div className="flex items-center justify-between gap-3 mb-2">
          {activeLeagueName ? <ActiveLeagueBadge name={activeLeagueName} /> : <span />}
          <PlayerBadge
            avatar={playerAvatar}
            color={playerColor}
            displayName={playerDisplayName}
            points={currentPlayerTotal}
            onClick={() => setAppTab?.('monprofil')}
          />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-4">Courses 2026</h1>
        <div className="flex gap-2 bg-surfaceHigh rounded-xl p-1">
          {[
            { id: 'upcoming',  label: 'À venir'   },
            { id: 'completed', label: 'Terminées' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
            const myPens = getMyPenalties(race.id)
            const myScoreData = isCompleted ? getMyScoreData(race) : null
            const raceTarget = `${race.date}T${race.raceTimeUTC ?? '12:00'}:00Z`

            return (
              <button
                key={race.id}
                onClick={() => openRaceSheet(race)}
                className="w-full card p-4 text-left transition-all active:scale-[0.99]"
              >
                {/* ── Top row ── */}
                <div className="flex items-center gap-3">
                  {/* Race number — display round, decoupled from the technical id */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    isCancelled
                      ? 'bg-red-500/20 text-red-400'
                      : isCompleted
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-accent/20 text-accent'
                  }`}>
                    {race.round}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl leading-none">{race.flag}</span>
                      <span className="font-bold text-sm truncate">GP {race.name}</span>
                      {isCancelled ? (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold shrink-0">
                          Annulé
                        </span>
                      ) : isCompleted && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold shrink-0">
                          ✓ Terminé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {race.city} · {formatDate(race.date)}
                      {formatRaceLocalTime(race) && (
                        <> · <span className="text-white/70">{formatRaceLocalTime(race)}</span></>
                      )}
                    </p>
                  </div>

                  {/* Right: score or prono status */}
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {isCancelled ? (
                      <span className="text-xs text-muted">—</span>
                    ) : isCompleted ? (
                      myScoreData !== null ? (
                        <>
                          <span className="font-black text-base leading-tight" style={{ color: playerColor }}>
                            {myScoreData.net} pts
                          </span>
                          {myScoreData.penTotal > 0 && (
                            <span className="text-[10px] text-accent font-bold">-{myScoreData.penTotal} pén.</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )
                    ) : (
                      myPred ? (
                        <span className="text-green-400 font-bold text-xs">✓ Soumis</span>
                      ) : (
                        <span className="text-accent font-bold text-xs animate-pulse">+ Prono</span>
                      )
                    )}
                  </div>
                </div>

                {/* ── Completed: podium + prediction indicators ── */}
                {isCompleted && race.result && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                    {POSITIONS.map((pos, i) => {
                      const real     = race.result[pos]
                      const detail   = myScoreData?.details?.[pos]
                      const myPick   = myScoreData?.prediction?.[pos]
                      const photoUrl = getDriverPhoto(firestoreDrivers, real)
                      return (
                        <div key={pos} className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-bg shrink-0 ${
                            i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                          }`}>
                            {i + 1}
                          </div>
                          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-[9px] font-bold text-muted">
                            {photoUrl
                              ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                              : <span>{real?.[0] ?? '?'}</span>
                            }
                          </div>
                          <span className="text-sm font-bold flex-1">{real}</span>
                          {detail !== undefined ? (
                            <>
                              <span className="text-xs text-muted">{myPick}</span>
                              <span className="text-sm leading-none">{detailIcon(detail)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted/50">pas de prono</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Upcoming: prediction preview ── */}
                {!isCompleted && myPred && (
                  <div className="mt-2 flex items-center gap-3">
                    {POSITIONS.map(pos => {
                      const driverName = myPred.prediction?.[pos]
                      const photoUrl   = getDriverPhoto(firestoreDrivers, driverName)
                      return (
                        <div key={pos} className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-[8px] font-bold text-muted">
                            {photoUrl
                              ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                              : <span>{driverName?.[0] ?? '?'}</span>
                            }
                          </div>
                          <span className={`text-[10px] font-bold ${POS_COLOR[pos]}`}>{driverName}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </button>
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
