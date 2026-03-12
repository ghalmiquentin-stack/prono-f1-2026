import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCollection, useDocument, upsertDoc } from '../hooks/useFirestore'
import { calculateRaceScore } from '../utils/scoring'
import BottomSheet from '../components/BottomSheet'
import { TEAMS, getTeamColor, getDriverTeam } from '../data/drivers'
import Skeleton from '../components/Skeleton'
import Countdown from '../components/Countdown'

function getDriverPhoto(drivers, displayName) {
  if (!displayName || !drivers?.length) return null
  return drivers.find(d => d.last_name?.toLowerCase() === displayName.toLowerCase())?.headshot_url ?? null
}

// Group Firebase drivers by team, sorted by team name
function groupDriversByTeam(drivers) {
  const map = {}
  for (const d of drivers) {
    const team = d.team_name ?? 'Unknown'
    if (!map[team]) map[team] = { name: team, colour: d.team_colour ?? '#6B6B8A', drivers: [] }
    map[team].drivers.push(d)
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

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
  const { data: firestoreDrivers } = useCollection('drivers')

  const [selectedRace, setSelectedRace] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftPrediction, setDraftPrediction] = useState({ P1: null, P2: null, P3: null })
  const [activePosition, setActivePosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('pronostics')
  const [qualLoading, setQualLoading] = useState(false)
  const [qualError, setQualError]   = useState(null)
  const [qualRefreshing, setQualRefreshing] = useState(false)

  // Reactive view of the selected race (stays fresh after Firebase writes)
  const currentRace = useMemo(
    () => selectedRace ? (races.find(r => r.id === selectedRace.id) ?? selectedRace) : null,
    [races, selectedRace]
  )

  // History document for the selected race
  const { data: raceHistory } = useDocument(
    'races_history',
    selectedRace ? String(selectedRace.id) : ''
  )

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
    setActiveTab(race.status === 'completed' ? 'result' : 'pronostics')
    setQualError(null)
    setSheetOpen(true)
  }

  const toTitle = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null

  const fetchQualifying = useCallback(async (race, isRefresh = false) => {
    const meetingKey = race.meeting_key_2026
    if (!meetingKey) return
    isRefresh ? setQualRefreshing(true) : setQualLoading(true)
    setQualError(null)
    try {
      const sessRes = await fetch(
        `https://api.openf1.org/v1/sessions?meeting_key=${meetingKey}&session_name=Qualifying`
      )
      const sessions = await sessRes.json()
      const qualSession = sessions?.[0]
      if (!qualSession) throw new Error('Session qualifications introuvable')

      const gridRes = await fetch(
        `https://api.openf1.org/v1/starting_grid?session_key=${qualSession.session_key}&position<=3`
      )
      const grid = await gridRes.json()
      grid.sort((a, b) => a.position - b.position)

      const resolve = num =>
        firestoreDrivers.find(d => d.driver_number === num)?.display_name ?? toTitle(String(num))

      const qualifying = {
        P1: resolve(grid.find(g => g.position === 1)?.driver_number),
        P2: resolve(grid.find(g => g.position === 2)?.driver_number),
        P3: resolve(grid.find(g => g.position === 3)?.driver_number),
        fetchedAt: new Date().toISOString(),
      }
      await upsertDoc('races', String(race.id), { qualifying_2026: qualifying })
    } catch (err) {
      setQualError(err.message)
    } finally {
      setQualLoading(false)
      setQualRefreshing(false)
    }
  }, [firestoreDrivers])

  // Auto-fetch qualifying when opening Résultat tab (case 3)
  useEffect(() => {
    if (activeTab !== 'result' || !currentRace) return
    if (!currentRace.qualifying_locked && !currentRace.qualifying_2026 && currentRace.meeting_key_2026) {
      fetchQualifying(currentRace)
    }
  }, [activeTab, currentRace?.id])

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

      if (!existing) {
        // First save — store initialPrediction for future modification tracking
        await upsertDoc('predictions', `${currentPlayerId}_${selectedRace.id}`, {
          playerId: currentPlayerId,
          raceId: selectedRace.id,
          prediction: draftPrediction,
          initialPrediction: draftPrediction,
          hasChanged: false,
          submittedAt: new Date(),
          locked: false,
        })
        addToast('Pronostic enregistré !', 'success')
      } else if (existing.hasChanged) {
        // Already used modification allowance — blocked (UI should prevent this)
        addToast('Modification impossible : vous avez déjà modifié ce pronostic', 'error')
        setSaving(false)
        return
      } else {
        // Modification: validate exactly 1 new driver not in initialPrediction
        const ipDrivers = Object.values(existing.initialPrediction ?? existing.prediction ?? {})
        const dpDrivers = Object.values(draftPrediction)
        const newDrivers = dpDrivers.filter(d => !ipDrivers.includes(d))

        if (newDrivers.length !== 1) {
          addToast(
            newDrivers.length === 0
              ? 'Vous devez remplacer au moins 1 pilote par un nouveau (pas dans votre prono initial)'
              : 'Vous ne pouvez remplacer qu\'un seul pilote à la fois',
            'error'
          )
          setSaving(false)
          return
        }

        await upsertDoc('predictions', `${currentPlayerId}_${selectedRace.id}`, {
          ...existing,
          prediction: draftPrediction,
          hasChanged: true,
          modifiedAt: new Date(),
        })
        await upsertDoc('penalties', `pen_change_${currentPlayerId}_${selectedRace.id}_${Date.now()}`, {
          playerId: currentPlayerId, raceId: selectedRace.id, type: 'change',
        })
        addToast('Pronostic modifié — pénalité -5 pts appliquée', 'warning')
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
        {selectedRace && currentRace && (
          <div className="flex flex-col h-full">
            {/* Race info */}
            <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-muted">{currentRace.city} · {currentRace.circuit}</p>
                  <p className="text-sm font-bold">
                    {new Date(currentRace.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </p>
                  {currentRace.raceTime && (
                    <p className="text-xs text-accent font-bold mt-0.5">{currentRace.raceTime}</p>
                  )}
                </div>
                {currentRace.status === 'upcoming' && (
                  <Countdown
                    targetDate={`${currentRace.date}T${currentRace.raceTimeUTC ?? '12:00'}:00Z`}
                    compact
                  />
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-0 border-b border-border shrink-0">
              {[
                { id: 'pronostics', label: 'Pronostics' },
                { id: 'result',    label: 'Résultat'   },
                { id: 'history',   label: 'Historique' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'border-accent text-white'
                      : 'border-transparent text-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-5">

              {/* ── ONGLET PRONOSTICS ── */}
              {activeTab === 'pronostics' && currentRace.status === 'completed' && currentRace.result && (
                <div className="space-y-3">
                  <p className="section-title">Pronostics des joueurs</p>
                  {(['william', 'quentin', 'alex', 'romain']).map(pid => {
                    const playerData = players.find(p => p.id === pid)
                    const pidColor  = String(playerData?.color  ?? PLAYER_COLORS[pid]  ?? '#fff')
                    const pidAvatar = String(playerData?.avatar ?? PLAYER_AVATARS[pid] ?? '🏎️')
                    const pidName   = String(playerData?.displayName ?? pid)
                    const pred = predictions.find(p => p.playerId === pid && p.raceId === currentRace.id)
                    const pens = penalties.filter(p => p.playerId === pid && p.raceId === currentRace.id)
                    if (!pred) return (
                      <div key={pid} className="card p-3 flex items-center gap-3 opacity-50">
                        <span>{pidAvatar}</span>
                        <span className="font-bold text-sm flex-1">{pidName}</span>
                        <span className="text-xs text-muted">Pas de prono</span>
                      </div>
                    )
                    const { total, details, perfectPodium } = calculateRaceScore(pred.prediction, currentRace.result)
                    const penTotal = pens.reduce((s, p) => s + (p.type === 'late' ? 10 : 5), 0)
                    const net = Math.max(0, total - penTotal)
                    return (
                      <div key={pid} className="card p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{pidAvatar}</span>
                          <span className="font-bold text-sm flex-1">{pidName}</span>
                          {perfectPodium && <span className="text-xs text-gold">⭐ Parfait</span>}
                          {penTotal > 0 && <span className="text-xs text-accent font-bold">-{penTotal} pén.</span>}
                          <span className="font-black text-base" style={{ color: pidColor }}>{net} pts</span>
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
              )}

              {activeTab === 'pronostics' && currentRace.status !== 'completed' && (() => {
                const existingPred = getMyPrediction(currentRace.id)
                const isLocked = existingPred?.hasChanged === true
                if (isLocked) return (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <span className="text-lg">🔒</span>
                      <div>
                        <p className="text-xs font-black text-yellow-400">Modification unique utilisée</p>
                        <p className="text-xs text-muted mt-0.5">Ce pronostic ne peut plus être modifié</p>
                      </div>
                    </div>
                    <div>
                      <p className="section-title">Votre pronostic (final)</p>
                      <div className="space-y-3">
                        {POSITIONS.map((pos, i) => {
                          const driver = existingPred.prediction[pos]
                          const teamColor = driver ? getTeamColor(driver) : null
                          return (
                            <div
                              key={pos}
                              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 opacity-80"
                              style={driver ? { borderColor: teamColor + '60', backgroundColor: teamColor + '10' } : {}}
                            >
                              <div className={`position-badge text-bg font-black text-sm shrink-0 ${POS_BG[pos]}`}>{i + 1}</div>
                              <div className="flex-1 text-left">
                                <p className="font-bold text-sm">{driver}</p>
                                <p className="text-xs text-muted">{getDriverTeam(driver)?.name}</p>
                              </div>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
                return (
                  <div className="space-y-5">
                    <div>
                      <p className="section-title">Votre pronostic podium</p>
                      {existingPred && !existingPred.hasChanged && (
                        <div className="mb-3 flex items-center gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                          <span className="text-sm">⚠️</span>
                          <p className="text-xs text-yellow-400 font-bold">
                            1 modification autorisée · Remplacez exactement 1 pilote par un nouveau (-5 pts)
                          </p>
                        </div>
                      )}
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
                              <div className={`position-badge text-bg font-black text-sm shrink-0 ${POS_BG[pos]}`}>{i + 1}</div>
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
                )
              })()}

              {/* ── ONGLET RÉSULTAT ── */}
              {activeTab === 'result' && (
                <div className="space-y-5">
                  {/* Podium officiel */}
                  {currentRace.status === 'completed' && currentRace.result ? (
                    <div>
                      <p className="section-title">Podium officiel</p>
                      <div className="space-y-2">
                        {POSITIONS.map((pos, i) => {
                          const driverName = currentRace.result[pos]
                          const photoUrl   = getDriverPhoto(firestoreDrivers, driverName)
                          return (
                            <div key={pos} className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                              <div className={`position-badge text-bg font-black text-sm ${POS_BG[pos]}`}>{i + 1}</div>
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
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(driverName) }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-surfaceHigh rounded-lg">
                      <span className="text-muted text-sm">Course pas encore disputée</span>
                    </div>
                  )}

                  {/* Qualifications 2026 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="section-title mb-0">Qualifications 2026</p>
                      {currentRace.qualifying_2026 && !currentRace.qualifying_locked && (
                        <button
                          onClick={() => fetchQualifying(currentRace, true)}
                          disabled={qualRefreshing}
                          className="text-muted text-sm hover:text-white transition-colors disabled:opacity-40"
                          title="Rafraîchir depuis OpenF1"
                        >
                          {qualRefreshing ? '…' : '🔄'}
                        </button>
                      )}
                    </div>

                    {qualLoading ? (
                      <div className="flex items-center gap-2 p-3 bg-surfaceHigh rounded-lg">
                        <span className="text-muted text-sm animate-pulse">Chargement depuis OpenF1…</span>
                      </div>
                    ) : qualError ? (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <p className="text-xs text-red-400">{qualError}</p>
                        {currentRace.meeting_key_2026 && (
                          <button
                            onClick={() => fetchQualifying(currentRace)}
                            className="text-xs text-accent mt-2 font-bold"
                          >
                            Réessayer
                          </button>
                        )}
                      </div>
                    ) : currentRace.qualifying_2026 ? (
                      <div className="space-y-2">
                        {POSITIONS.map((pos, i) => {
                          const driverName = currentRace.qualifying_2026[pos]
                          const photoUrl   = getDriverPhoto(firestoreDrivers, driverName)
                          return (
                            <div key={pos} className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                              <div className={`position-badge text-bg font-black text-sm ${POS_BG[pos]}`}>{i + 1}</div>
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
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(driverName) }} />
                            </div>
                          )
                        })}
                        {currentRace.qualifying_locked && (
                          <p className="text-[10px] text-muted text-right">🔒 Données figées</p>
                        )}
                      </div>
                    ) : !currentRace.meeting_key_2026 ? (
                      <p className="text-sm text-muted p-3">Qualifications pas encore disputées</p>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ── ONGLET HISTORIQUE ── */}
              {activeTab === 'history' && (
                <div className="space-y-5">
                  {/* 2025 edition */}
                  {currentRace.name === 'Espagne (Madrid)' ? (
                    <div className="flex items-center gap-2 p-3 bg-surfaceHigh rounded-lg">
                      <span className="text-sm">🆕</span>
                      <span className="text-sm text-muted">Première édition — pas de données 2025</span>
                    </div>
                  ) : raceHistory ? (
                    <div className="space-y-4">
                      {/* Podium 2025 */}
                      {raceHistory.podium_2025 && (
                        <div>
                          <p className="section-title">GP {currentRace.name} 2025</p>
                          <div className="space-y-2">
                            {POSITIONS.map((pos, i) => {
                              const entry = raceHistory.podium_2025[pos]
                              const photoUrl = getDriverPhoto(firestoreDrivers, entry?.name)
                              return (
                                <div key={pos} className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                                  <div className={`position-badge text-bg font-black text-sm ${POS_BG[pos]}`}>{i + 1}</div>
                                  <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                                    {photoUrl
                                      ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                      : <span>{entry?.name?.[0] ?? '?'}</span>
                                    }
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-bold leading-tight">{entry?.name ?? '—'}</p>
                                    <p className="text-[10px] text-muted">{entry?.team ?? ''}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {/* Pole 2025 */}
                      {raceHistory.pole_2025 && (
                        <div>
                          <p className="section-title">Pole Position 2025</p>
                          <div className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                            <span className="text-xl">🏁</span>
                            <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                              {(() => {
                                const photoUrl = getDriverPhoto(firestoreDrivers, raceHistory.pole_2025.name)
                                return photoUrl
                                  ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                  : <span>{raceHistory.pole_2025.name?.[0] ?? '?'}</span>
                              })()}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold leading-tight">{raceHistory.pole_2025.name}</p>
                              <p className="text-[10px] text-muted">{raceHistory.pole_2025.team}</p>
                            </div>
                            {raceHistory.pole_2025.lap_duration && (
                              <span className="text-xs font-bold text-accent">
                                {raceHistory.pole_2025.lap_duration}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted p-3">Données historiques non disponibles</p>
                  )}

                  {/* Barème */}
                  <div className="card-elevated rounded-xl p-4 space-y-1.5">
                    <p className="section-title">Barème de points</p>
                    <div className="flex justify-between text-xs"><span className="text-muted">Position exacte</span><span className="text-green-400 font-bold">+10 pts</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Sur le podium (mauvaise pos.)</span><span className="text-yellow-400 font-bold">+3 pts</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Podium parfait (bonus)</span><span className="text-gold font-bold">+5 pts</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Pénalité changement tardif</span><span className="text-accent font-bold">-5 pts</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Pénalité soumission tardive</span><span className="text-accent font-bold">-10 pts</span></div>
                  </div>
                </div>
              )}
            </div>
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
          {/* Already-picked reminder */}
          {POSITIONS.filter(p => p !== activePosition && draftPrediction[p]).map(pos => (
            <div key={pos} className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className={POS_COLOR[pos]}>{pos}:</span>
              <span>{draftPrediction[pos]}</span>
              <span>(déjà sélectionné)</span>
            </div>
          ))}

          {firestoreDrivers.length > 0 ? (
            /* ── Compact list from Firebase ── */
            groupDriversByTeam(firestoreDrivers).map(team => (
              <div key={team.name} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.colour }} />
                  <span className="text-xs font-bold text-muted uppercase tracking-wide">{team.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2">
                  {team.drivers.map(driver => {
                    const driverName = driver.display_name ?? driver.name_acronym ?? String(driver._id)
                    const isCurrent  = draftPrediction[activePosition] === driverName
                    const isSelected = !isCurrent && Object.values(draftPrediction).includes(driverName)
                    const initials   = (driver.first_name?.[0] ?? '') + (driver.last_name?.[0] ?? '')
                    return (
                      <button
                        key={driver._id}
                        onClick={() => !isSelected && selectDriver(driverName)}
                        style={isCurrent ? { borderLeftColor: team.colour, backgroundColor: team.colour + '1a' } : {}}
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg mb-1 transition-all active:scale-95 border-l-[3px] ${
                          isCurrent  ? 'border-l-[3px]' :
                          isSelected ? 'opacity-35 cursor-default border-l-transparent' :
                          'border-l-transparent'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: team.colour + '66' }}
                        >
                          {driver.headshot_url ? (
                            <img
                              src={driver.headshot_url}
                              alt=""
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <span>{initials || driver.name_acronym}</span>
                          )}
                        </div>
                        {/* Name */}
                        <span className="text-sm text-white font-medium truncate flex-1 text-left">
                          {driver.last_name ?? driverName}
                        </span>
                        {/* Team dot */}
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.colour }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          ) : (
            /* ── Fallback: hardcoded TEAMS list ── */
            [...TEAMS].map(team => (
              <div key={team.name} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                  <span className="text-xs font-bold text-muted uppercase tracking-wide">{team.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {team.drivers.map(driver => {
                    const isSelected = Object.values(draftPrediction).includes(driver)
                    const isCurrent  = draftPrediction[activePosition] === driver
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
            ))
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
