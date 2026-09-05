import { useState, useMemo, useEffect, useRef } from 'react'
import { useDocument, upsertDoc } from '../hooks/useFirestore'
import { calculateRaceScore, detailPoints } from '../utils/scoring'
import { getPlayerIdentity } from '../utils/profiles'
import { getModificationCount } from '../utils/predictions'
import { summarizePenalties, getPenaltyAmount } from '../utils/penalties'
import { formatRaceLocalTime } from '../utils/races'
import { TEAMS, getTeamColor, getDriverTeam } from '../data/drivers'
import { getDriverPhoto } from '../utils/drivers'
import BottomSheet from './BottomSheet'
import Countdown from './Countdown'

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }
const POS_BG    = { P1: 'bg-gold',   P2: 'bg-silver',   P3: 'bg-bronze'   }

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

const toTitle = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null

// Shared race-prediction modal — used from both Courses (clicking a race
// card) and Accueil (clicking "Pronostiquer" on the next GP). Owns all
// input/save logic itself so both entry points stay in sync (in
// particular the leagueId stamped on new/modified predictions).
export default function PredictionSheet({
  isOpen, race, races, onClose,
  currentPlayerId, activeLeagueId, addToast,
  players, profiles, predictions, penalties, drivers,
}) {
  const [draftPrediction, setDraftPrediction] = useState({ P1: null, P2: null, P3: null })
  const [activePosition, setActivePosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('pronostics')

  // League rules — read here (not passed down) so the modal stays correct
  // regardless of which screen opens it.
  const { data: league } = useDocument(activeLeagueId ? 'leagues' : null, activeLeagueId)
  const modPenaltyEnabled = !!league?.rules?.modificationPenalty?.enabled
  const modPenaltyAmount = league?.rules?.modificationPenalty?.amount ?? 0

  // Reactive view of the selected race (stays fresh after Firebase writes)
  const currentRace = useMemo(
    () => race ? (races.find(r => r.id === race.id) ?? race) : null,
    [races, race]
  )

  // Real roster of the active league (players prop is already scoped by the
  // caller via leagueConstraint), sorted deterministically so per-player
  // colors/avatars stay stable across renders — not a fixed list of
  // hardcoded player IDs from the original single-league era.
  const playerIds = useMemo(() => [...players].map(p => p.id).sort(), [players])

  // History document for the selected race
  const { data: raceHistory } = useDocument(
    race ? 'races_history' : null,
    race ? String(race.id) : ''
  )

  const getMyPrediction = (raceId) =>
    predictions.find(p => p.playerId === currentPlayerId && p.raceId === raceId)

  // Re-initialize the draft/tab every time the sheet transitions to open —
  // mirrors the previous openRaceSheet() click handler, which always ran
  // fresh regardless of whether the same race was reopened.
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && race) {
      const existing = getMyPrediction(race.id)
      setDraftPrediction(existing?.prediction ?? { P1: null, P2: null, P3: null })
      setActiveTab(race.status === 'upcoming' ? 'pronostics' : 'result')
    }
    prevOpenRef.current = isOpen
  }, [isOpen, race])

  // Safety net: the "Résultat" tab button only renders while the race is
  // completed — if activeTab is somehow left on 'result' when it stops being
  // completed (e.g. an admin reset while the sheet was already open), fall
  // back to Pronostics instead of showing content with no matching tab.
  useEffect(() => {
    if (currentRace && currentRace.status !== 'completed' && activeTab === 'result') {
      setActiveTab('pronostics')
    }
  }, [currentRace?.status, activeTab])


  const handleClose = () => {
    setActivePosition(null)
    setDriverPickerOpen(false)
    onClose?.()
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
    if (!canSave || !race || saving) return
    setSaving(true)
    try {
      const existing = getMyPrediction(race.id)

      // No-op save: final podium is identical to what was already stored —
      // don't write anything (no prediction doc churn, no penalty), and
      // leave the sheet open since nothing actually changed.
      if (existing && POSITIONS.every(pos => draftPrediction[pos] === existing.prediction?.[pos])) {
        addToast('Aucune modification effectuée', 'info')
        return
      }

      if (!existing) {
        // First save — store initialPrediction for future modification tracking
        await upsertDoc('predictions', `${currentPlayerId}_${race.id}`, {
          playerId: currentPlayerId,
          raceId: race.id,
          leagueId: activeLeagueId,
          prediction: draftPrediction,
          initialPrediction: draftPrediction,
          modificationCount: 0,
          submittedAt: new Date(),
          manualUnlockOverride: false,
        })
        addToast('Pronostic enregistré !', 'success')
      } else {
        // Modification — no cap: every save after the first just bumps the
        // counter. Penalty (if any) stays informational/dynamic, driven by
        // the league's own modificationPenalty rule.
        // `_id` is a client-only artifact injected by useCollection/useDocument
        // ({ _id: d.id, ...d.data() }) — never a real Firestore field. Strip it
        // before spreading `existing`, otherwise it leaks into the write and
        // gets rejected by predictions.update's field whitelist for regular
        // players (their prediction doc simply doesn't have `_id` yet, so
        // introducing it counts as a newly affected key outside hasOnly([...])).
        const { _id, ...existingFields } = existing
        await upsertDoc('predictions', `${currentPlayerId}_${race.id}`, {
          ...existingFields,
          leagueId: activeLeagueId,
          prediction: draftPrediction,
          modificationCount: getModificationCount(existing) + 1,
          modifiedAt: new Date(),
        })
        addToast(
          modPenaltyEnabled
            ? `Pronostic modifié — pénalité -${modPenaltyAmount} pts appliquée`
            : 'Pronostic modifié',
          'warning'
        )

        // Best-effort informational penalty record — the prediction itself
        // is already saved at this point, so a failure here (Firestore
        // rules, transient error, etc.) must never block closing the sheet
        // or show the user an error toast.
        try {
          await upsertDoc('penalties', `pen_change_${currentPlayerId}_${race.id}_${Date.now()}`, {
            playerId: currentPlayerId, raceId: race.id, type: 'change', leagueId: activeLeagueId,
            amount: modPenaltyAmount, createdAt: new Date(),
          })
        } catch (penErr) {
          console.error(penErr)
        }
      }
      handleClose()
    } catch (err) {
      addToast('Erreur lors de la sauvegarde', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* ── Race detail sheet ── */}
      <BottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title={race ? `GP ${race.name} ${race.flag}` : ''}
        fullHeight
      >
        {race && currentRace && (
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
                  {formatRaceLocalTime(currentRace) && (
                    <p className="text-xs text-accent font-bold mt-0.5">{formatRaceLocalTime(currentRace)}</p>
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

            {currentRace.status === 'cancelled' ? (
              /* ── Grand Prix annulé ── pas d'onglets, pas de podium/pronostics */
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="text-4xl">🚫</span>
                <p className="font-bold text-base">Ce Grand Prix a été annulé.</p>
                <p className="text-xs text-muted">Aucun pronostic ni résultat ne sera comptabilisé pour cette course.</p>
              </div>
            ) : (
              <>
            {/* Tab bar — "Résultat" only makes sense once the race is completed */}
            <div className="flex gap-0 border-b border-border shrink-0">
              {[
                { id: 'pronostics', label: 'Pronostics' },
                ...(currentRace.status === 'completed' ? [{ id: 'result', label: 'Résultat' }] : []),
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
                  {playerIds.map((pid, index) => {
                    const playerData = players.find(p => p.id === pid)
                    const identity = getPlayerIdentity(profiles, playerData, index)
                    const pidColor  = String(identity.color)
                    const pidAvatar = String(identity.avatar)
                    const pidName   = String(identity.displayName)
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
                    const penTotal = pens.reduce((s, p) => s + getPenaltyAmount(p), 0)
                    const net = total - penTotal
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
                            const driverName = pred.prediction[pos]
                            const photoUrl   = getDriverPhoto(drivers, driverName)
                            const detail     = details[pos]
                            const isModified = getModificationCount(pred) > 0 && pred.prediction[pos] !== pred.initialPrediction?.[pos]
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
                                <div className="w-11 h-11 rounded-full overflow-hidden mx-auto mb-1 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                                  {photoUrl
                                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                    : <span>{driverName?.[0] ?? '?'}</span>
                                  }
                                </div>
                                <div className="text-xs font-bold truncate">{driverName}</div>
                                {isModified && (
                                  <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded mt-0.5" style={{ color: '#E8002D', backgroundColor: '#E8002D22' }}>Modifié</span>
                                )}
                                <div className={`text-[9px] font-bold mt-1 ${
                                  detail === 'exact'  ? 'text-green-400'  :
                                  detail === 'podium' ? 'text-yellow-400' : 'text-muted'
                                }`}>
                                  {detailPoints(detail) > 0 ? `+${detailPoints(detail)}` : '0'}
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
                // Real, current penalties for this prediction (modifications +
                // late submission) — not modificationCount or a theoretical
                // count × amount, so an admin deletion is reflected
                // immediately and stays consistent between the count and
                // the points shown.
                const { changeCount, lateCount, changeTotal, lateTotal, total: penaltyTotal } =
                  summarizePenalties(penalties, currentPlayerId, currentRace.id)
                return (
                  <div className="space-y-5">
                    <div>
                      <p className="section-title">Votre pronostic podium</p>
                      {existingPred && (
                        modPenaltyEnabled ? (
                          <div className="mb-3 flex items-center gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <span className="text-sm">⚠️</span>
                            <p className="text-xs text-yellow-400 font-bold">
                              {changeCount > 0 && lateCount > 0
                                ? <>Déjà {changeCount} modification{changeCount > 1 ? 's' : ''} (-{changeTotal} pts) + pénalité tardive (-{lateTotal} pts) · -{penaltyTotal} pts au total.{' '}Une nouvelle modification ajoutera -{modPenaltyAmount} pts.</>
                                : lateCount > 0
                                ? <>Une pénalité tardive de -{penaltyTotal} pts a déjà été appliquée.{' '}Une nouvelle modification ajoutera -{modPenaltyAmount} pts.</>
                                : changeCount > 0
                                ? <>Déjà {changeCount} modification{changeCount > 1 ? 's' : ''} · -{penaltyTotal} pts.{' '}Une nouvelle modification ajoutera -{modPenaltyAmount} pts.</>
                                : <>Chaque modification vous coûtera -{modPenaltyAmount} pts.</>
                              }
                            </p>
                          </div>
                        ) : (
                          <div className="mb-3 flex items-center gap-2 p-2.5 bg-surfaceHigh/50 border border-border rounded-lg">
                            <span className="text-sm">ℹ️</span>
                            <p className="text-xs text-muted font-bold">
                              Vous pouvez modifier votre podium autant de fois que vous le souhaitez avant le départ de la course.
                            </p>
                          </div>
                        )
                      )}
                      <div className="space-y-3">
                        {POSITIONS.map((pos, i) => {
                          const driver = draftPrediction[pos]
                          const teamColor = driver ? getTeamColor(driver) : null
                          const photoUrl  = driver ? getDriverPhoto(drivers, driver) : null
                          return (
                            <button
                              key={pos}
                              onClick={() => { setActivePosition(pos); setDriverPickerOpen(true) }}
                              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                                driver ? '' : 'border-dashed border-border'
                              }`}
                              style={driver ? { borderColor: teamColor + '80', backgroundColor: teamColor + '15' } : {}}
                            >
                              <div className={`position-badge text-bg font-black text-sm shrink-0 ${POS_BG[pos]}`}>{i + 1}</div>
                              {driver ? (
                                <>
                                  <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                                    {photoUrl
                                      ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                      : <span>{driver?.[0] ?? '?'}</span>
                                    }
                                  </div>
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
                          const photoUrl   = getDriverPhoto(drivers, driverName)
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

                  {/* Qualifications — strictly read-only here: fetching/
                      writing this data requires super-admin (races/{id} write
                      rule), so the trigger lives in ReglagesSuperAdmin.jsx,
                      not this player-facing modal. */}
                  <div>
                    <p className="section-title mb-2">
                      Qualifications {currentRace.qualifying?.year ?? new Date().getFullYear()}
                    </p>
                    {currentRace.qualifying ? (
                      <div className="space-y-2">
                        {POSITIONS.map((pos, i) => {
                          const entry      = currentRace.qualifying[pos]
                          const driverName = entry?.name
                          const photoUrl   = getDriverPhoto(drivers, driverName)
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
                              {entry?.lap_duration && (
                                <span className="text-xs font-bold text-white">{entry.lap_duration}</span>
                              )}
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(driverName) }} />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted p-3">Qualifications pas encore disponibles</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── ONGLET HISTORIQUE ── */}
              {activeTab === 'history' && (
                <div className="space-y-5">
                  {/* Previous-season edition — label built from the stored
                      `year` field, never a hardcoded year in the JSX */}
                  {currentRace.firstEdition ? (
                    <div className="flex items-center gap-2 p-3 bg-surfaceHigh rounded-lg">
                      <span className="text-sm">🆕</span>
                      <span className="text-sm text-muted">Première édition — pas de données {new Date().getFullYear() - 1}</span>
                    </div>
                  ) : raceHistory ? (
                    <div className="space-y-4">
                      {/* Podium */}
                      {raceHistory.podium && (
                        <div>
                          <p className="section-title">GP {currentRace.name} {raceHistory.year}</p>
                          <div className="space-y-2">
                            {POSITIONS.map((pos, i) => {
                              const entry = raceHistory.podium[pos]
                              const photoUrl = getDriverPhoto(drivers, entry?.name)
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
                      {/* Pole */}
                      {raceHistory.pole && (
                        <div>
                          <p className="section-title">Pole Position {raceHistory.year}</p>
                          <div className="flex items-center gap-3 p-3 card-elevated rounded-lg">
                            <span className="text-xl">🏁</span>
                            <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                              {(() => {
                                const photoUrl = getDriverPhoto(drivers, raceHistory.pole.name)
                                return photoUrl
                                  ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                                  : <span>{raceHistory.pole.name?.[0] ?? '?'}</span>
                              })()}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold leading-tight">{raceHistory.pole.name}</p>
                              <p className="text-[10px] text-muted">{raceHistory.pole.team}</p>
                            </div>
                            {raceHistory.pole.lap_duration && (
                              <span className="text-xs font-bold text-white">
                                {raceHistory.pole.lap_duration}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted p-3">Données historiques non disponibles</p>
                  )}
                </div>
              )}
            </div>
              </>
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
          {/* Already-picked reminder */}
          {POSITIONS.filter(p => p !== activePosition && draftPrediction[p]).map(pos => (
            <div key={pos} className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className={POS_COLOR[pos]}>{pos}:</span>
              <span>{draftPrediction[pos]}</span>
              <span>(déjà sélectionné)</span>
            </div>
          ))}

          {drivers.length > 0 ? (
            /* ── Compact list from Firebase ── */
            groupDriversByTeam(drivers).map(team => (
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
                          className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
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
    </>
  )
}
