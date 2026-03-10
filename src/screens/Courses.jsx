import { useState, useMemo } from 'react'
import { useCollection, upsertDoc } from '../hooks/useFirestore'
import { calculateRaceScore } from '../utils/scoring'
import BottomSheet from '../components/BottomSheet'
import { TEAMS, getTeamColor, getDriverTeam } from '../data/drivers'
import Skeleton from '../components/Skeleton'
import Countdown from '../components/Countdown'

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

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }
const POS_BG    = { P1: 'bg-gold',   P2: 'bg-silver',   P3: 'bg-bronze'   }

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

export default function Courses({ currentPlayerId, addToast }) {
  const { data: races, loading: racesLoading } = useCollection('races')
  const { data: predictions, loading: predsLoading } = useCollection('predictions')
  const { data: penalties } = useCollection('penalties')
  const { data: players } = useCollection('players')

  const [selectedRace, setSelectedRace] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftPrediction, setDraftPrediction] = useState({ P1: null, P2: null, P3: null })
  const [activePosition, setActivePosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')

  const loading = racesLoading || predsLoading

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  const filteredRaces = useMemo(() => {
    if (filter === 'upcoming') return sortedRaces.filter(r => r.status === 'upcoming')
    if (filter === 'completed') return sortedRaces.filter(r => r.status === 'completed')
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
    const penTotal = pens.reduce((s, p) => s + (p.type === 'late' ? 10 : 5), 0)
    return { net: Math.max(0, total - penTotal), details, prediction: pred.prediction, penTotal, perfectPodium }
  }

  const openRaceSheet = (race) => {
    setSelectedRace(race)
    const existing = getMyPrediction(race.id)
    setDraftPrediction(existing?.prediction ?? { P1: null, P2: null, P3: null })
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSelectedRace(null)
    setActivePosition(null)
    setDriverPickerOpen(false)
  }

  const selectDriver = (driver) => {
    if (!activePosition) return
    const newPred = { ...draftPrediction }
    for (const pos of POSITIONS) {
      if (newPred[pos] === driver && pos !== activePosition) newPred[pos] = null
    }
    newPred[activePosition] = driver
    setDraftPrediction(newPred)
    setDriverPickerOpen(false)
    setActivePosition(null)
  }

  const clearPosition = (pos) =>
    setDraftPrediction(prev => ({ ...prev, [pos]: null }))

  const canSave = draftPrediction.P1 && draftPrediction.P2 && draftPrediction.P3

  const savePrediction = async () => {
    if (!canSave || !selectedRace || saving) return
    setSaving(true)
    try {
      const existing = getMyPrediction(selectedRace.id)
      await upsertDoc('predictions', `${currentPlayerId}_${selectedRace.id}`, {
        playerId: currentPlayerId,
        raceId: selectedRace.id,
        prediction: draftPrediction,
        submittedAt: new Date(),
        locked: false,
      })
      if (existing && (
        existing.prediction?.P1 !== draftPrediction.P1 ||
        existing.prediction?.P2 !== draftPrediction.P2 ||
        existing.prediction?.P3 !== draftPrediction.P3
      )) {
        await upsertDoc('penalties', `pen_change_${currentPlayerId}_${selectedRace.id}_${Date.now()}`, {
          playerId: currentPlayerId, raceId: selectedRace.id, type: 'change',
        })
        addToast('Pronostic modifié — pénalité -5 pts appliquée', 'warning')
      } else {
        addToast('Pronostic enregistré !', 'success')
      }
      closeSheet()
    } catch (err) {
      addToast('Erreur lors de la sauvegarde', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const playerColor = PLAYER_COLORS[currentPlayerId] ?? '#fff'

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-2xl font-black tracking-tight mb-4">Courses 2026</h1>
        <div className="flex gap-2 bg-surfaceHigh rounded-xl p-1">
          {[
            { id: 'all',       label: 'Toutes'    },
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
                  {/* Race number */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    isCompleted
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-accent/20 text-accent'
                  }`}>
                    {race.id}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl leading-none">{race.flag}</span>
                      <span className="font-bold text-sm truncate">GP {race.name}</span>
                      {isCompleted && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold shrink-0">
                          ✓ Terminé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {race.city} · {formatDate(race.date)}
                      {race.raceTime && (
                        <> · <span className="text-white/70">{race.raceTime}</span></>
                      )}
                    </p>
                  </div>

                  {/* Right: score or prono status */}
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {isCompleted ? (
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
                      const real   = race.result[pos]
                      const detail = myScoreData?.details?.[pos]
                      const myPick = myScoreData?.prediction?.[pos]
                      return (
                        <div key={pos} className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-bg shrink-0 ${
                            i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                          }`}>
                            {i + 1}
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
                  <div className="mt-2 flex items-center gap-2">
                    {POSITIONS.map(pos => (
                      <span key={pos} className={`text-[10px] font-bold ${POS_COLOR[pos]}`}>
                        {myPred.prediction?.[pos]}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* ── Race detail sheet ── */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={closeSheet}
        title={selectedRace ? `GP ${selectedRace.name} ${selectedRace.flag}` : ''}
        fullHeight
      >
        {selectedRace && (
          <div className="p-5 pb-10">
            {/* Race info */}
            <div className="flex items-start gap-3 mb-5 pb-4 border-b border-border">
              <div className="flex-1">
                <p className="text-xs text-muted">{selectedRace.city} · {selectedRace.circuit}</p>
                <p className="text-sm font-bold">
                  {new Date(selectedRace.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
                {selectedRace.raceTime && (
                  <p className="text-xs text-accent font-bold mt-0.5">
                    {selectedRace.raceTime}
                  </p>
                )}
              </div>
              {selectedRace.status === 'upcoming' && (
                <div>
                  <Countdown
                    targetDate={`${selectedRace.date}T${selectedRace.raceTimeUTC ?? '12:00'}:00Z`}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Completed race */}
            {selectedRace.status === 'completed' && selectedRace.result ? (
              <div className="space-y-5">
                <div>
                  <p className="section-title">Résultat officiel</p>
                  <div className="space-y-2">
                    {POSITIONS.map((pos, i) => (
                      <div key={pos} className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                        <div className={`position-badge text-bg font-black text-sm ${POS_BG[pos]}`}>
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold leading-tight">{selectedRace.result[pos]}</p>
                          <p className="text-[10px] text-muted">{getDriverTeam(selectedRace.result[pos])?.name}</p>
                        </div>
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getTeamColor(selectedRace.result[pos]) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="section-title">Pronostics des joueurs</p>
                  <div className="space-y-3">
                    {(['william', 'quentin', 'alex', 'romain']).map(pid => {
                      const playerData = players.find(p => p.id === pid)
                      const pidColor = String(playerData?.color ?? PLAYER_COLORS[pid] ?? '#fff')
                      const pidAvatar = String(playerData?.avatar ?? PLAYER_AVATARS[pid] ?? '🏎️')
                      const pidName = String(playerData?.displayName ?? pid)
                      const pred = predictions.find(p => p.playerId === pid && p.raceId === selectedRace.id)
                      const pens = penalties.filter(p => p.playerId === pid && p.raceId === selectedRace.id)
                      if (!pred) return (
                        <div key={pid} className="card p-3 flex items-center gap-3 opacity-50">
                          <span>{pidAvatar}</span>
                          <span className="font-bold text-sm flex-1">{pidName}</span>
                          <span className="text-xs text-muted">Pas de prono</span>
                        </div>
                      )
                      const { total, details, perfectPodium } = calculateRaceScore(pred.prediction, selectedRace.result)
                      const penTotal = pens.reduce((s, p) => s + (p.type === 'late' ? 10 : 5), 0)
                      const net = Math.max(0, total - penTotal)
                      return (
                        <div key={pid} className="card p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span>{pidAvatar}</span>
                            <span className="font-bold text-sm flex-1">{pidName}</span>
                            {perfectPodium && <span className="text-xs text-gold">⭐ Parfait</span>}
                            {penTotal > 0 && <span className="text-xs text-accent font-bold">-{penTotal} pén.</span>}
                            <span className="font-black text-base" style={{ color: pidColor }}>
                              {net} pts
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {POSITIONS.map(pos => {
                              const detail = details[pos]
                              return (
                                <div
                                  key={pos}
                                  className={`rounded-lg p-2 text-center border ${
                                    detail === 'exact'  ? 'border-green-500  bg-green-500/10'  :
                                    detail === 'podium' ? 'border-yellow-500 bg-yellow-500/10' :
                                    'border-border bg-surfaceHigh/50'
                                  }`}
                                >
                                  <div className={`text-[9px] font-bold mb-1 ${POS_COLOR[pos]}`}>{pos}</div>
                                  <div className="text-xs font-bold truncate">{pred.prediction[pos]}</div>
                                  <div className={`text-[9px] font-bold mt-1 ${
                                    detail === 'exact'  ? 'text-green-400'  :
                                    detail === 'podium' ? 'text-yellow-400' : 'text-muted'
                                  }`}>
                                    {detail === 'exact' ? '+10' : detail === 'podium' ? '+3' : '0'}
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
              </div>
            ) : (
              /* Upcoming: prediction form */
              <div className="space-y-5">
                <div>
                  <p className="section-title">Votre pronostic podium</p>
                  <div className="space-y-3">
                    {POSITIONS.map((pos, i) => {
                      const driver = draftPrediction[pos]
                      const teamColor = driver ? getTeamColor(driver) : null
                      return (
                        <button
                          key={pos}
                          onClick={() => { setActivePosition(pos); setDriverPickerOpen(true) }}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                            driver ? '' : 'border-dashed border-border'
                          }`}
                          style={driver ? { borderColor: teamColor + '80', backgroundColor: teamColor + '15' } : {}}
                        >
                          <div className={`position-badge text-bg font-black text-sm shrink-0 ${POS_BG[pos]}`}>
                            {i + 1}
                          </div>
                          {driver ? (
                            <>
                              <div className="flex-1 text-left">
                                <p className="font-bold text-sm">{driver}</p>
                                <p className="text-xs text-muted">{getDriverTeam(driver)?.name}</p>
                              </div>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                              <span
                                className="text-muted text-sm"
                                onClick={e => { e.stopPropagation(); clearPosition(pos) }}
                              >✕</span>
                            </>
                          ) : (
                            <span className="text-muted text-sm flex-1 text-left">
                              {pos === 'P1' ? 'Choisir le vainqueur' : pos === 'P2' ? 'Choisir le 2e' : 'Choisir le 3e'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="card-elevated rounded-xl p-4 space-y-1.5">
                  <p className="section-title">Barème de points</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Position exacte</span>
                    <span className="text-green-400 font-bold">+10 pts</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Sur le podium (mauvaise pos.)</span>
                    <span className="text-yellow-400 font-bold">+3 pts</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Podium parfait (bonus)</span>
                    <span className="text-gold font-bold">+5 pts</span>
                  </div>
                </div>

                <button
                  onClick={savePrediction}
                  disabled={!canSave || saving}
                  className={`w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all active:scale-95 ${
                    canSave && !saving ? 'bg-accent text-white shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Enregistrement...' : canSave ? 'Valider mon pronostic' : 'Complétez le podium'}
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Driver picker sheet */}
      <BottomSheet
        isOpen={driverPickerOpen}
        onClose={() => { setDriverPickerOpen(false); setActivePosition(null) }}
        title={`Choisir ${activePosition === 'P1' ? 'P1 – Vainqueur' : activePosition === 'P2' ? 'P2 – 2e place' : 'P3 – 3e place'}`}
        fullHeight
      >
        <div className="p-4 pb-10">
          {POSITIONS.filter(p => p !== activePosition && draftPrediction[p]).map(pos => (
            <div key={pos} className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className={POS_COLOR[pos]}>{pos}:</span>
              <span>{draftPrediction[pos]}</span>
              <span>(déjà sélectionné)</span>
            </div>
          ))}
          {[...TEAMS].map(team => (
            <div key={team.name} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                <span className="text-xs font-bold text-muted uppercase tracking-wide">{team.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {team.drivers.map(driver => {
                  const isSelected = Object.values(draftPrediction).includes(driver)
                  const isCurrent = draftPrediction[activePosition] === driver
                  return (
                    <button
                      key={driver}
                      onClick={() => selectDriver(driver)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        isCurrent  ? 'border-accent bg-accent/20' :
                        isSelected ? 'border-muted/30 bg-surfaceHigh/30 opacity-50' :
                        'border-border bg-surfaceHigh'
                      }`}
                    >
                      <p className="font-bold text-sm">{driver}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                        <p className="text-xs text-muted">{team.name}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
