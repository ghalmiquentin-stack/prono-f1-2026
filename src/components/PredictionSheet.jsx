import { useState, useMemo, useEffect, useRef } from 'react'
import { LockOpen, Lock, Ban, AlertTriangle } from 'lucide-react'
import { useDocument, upsertDoc } from '../hooks/useFirestore'
import { calculateRaceScore, detailPoints } from '../utils/scoring'
import { getPlayerIdentity } from '../utils/profiles'
import { getModificationCount } from '../utils/predictions'
import { useRaceTiming } from '../hooks/useRaceTiming'
import { useQualifyingSwitch } from '../hooks/useQualifyingSwitch'
import { usePenaltyConfirm } from '../hooks/usePenaltyConfirm'
import { useNowEvery } from '../hooks/useNowEvery'
import { getPenaltyAmount } from '../utils/penalties'
import {
  getPenaltyRule, getPenaltyContext, buildPenaltyConfirm,
} from '../utils/qualifyingPenalty'
import { withRoundNumbers } from '../utils/races'
import { rankOf } from '../utils/sheetStats'
import BottomSheet from './BottomSheet'
import ConfirmModal from './ConfirmModal'
import RaceHeader from './sheet/RaceHeader'
import { PodiumCard } from './sheet/PodiumSlots'
import HistoryBlock from './sheet/HistoryBlock'
import QualifyingBlock from './sheet/QualifyingBlock'
import PlayersTable from './sheet/PlayersTable'
import DriverPicker from './sheet/DriverPicker'

const POSITIONS = ['P1', 'P2', 'P3']

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

  // League rules — read here (not passed down) so the modal stays correct
  // regardless of which screen opens it.
  const { data: league } = useDocument(activeLeagueId ? 'leagues' : null, activeLeagueId)
  // Active modification penalty with a strictly positive numeric amount (null
  // otherwise): the pre-qualifying notice below never shows "-0 pts".
  const modPenaltyRule = getPenaltyRule(league, true)

  // Reactive view of the selected race (stays fresh after Firebase writes)
  const currentRace = useMemo(
    () => race ? (races.find(r => r.id === race.id) ?? race) : null,
    [races, race]
  )

  // Display round number (position in the id-sorted calendar), shown in the header.
  const round = useMemo(() => {
    if (!race) return null
    return withRoundNumbers([...races].sort((a, b) => a.id - b.id)).find(r => r.id === race.id)?.round ?? race.round ?? null
  }, [races, race])

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

  // Display/input lock only — the server (firestore.rules) is the real gate.
  // Read-only once the GP has started, unless the admin granted this player's
  // existing prediction a manual unlock. Flips by itself at T (hook timer).
  const { started: raceStarted } = useRaceTiming(currentRace)
  const myPred = currentRace ? getMyPrediction(currentRace.id) : null
  const locked = raceStarted && myPred?.manualUnlockOverride !== true

  // The driver picker may be open when the start is crossed: close it.
  useEffect(() => {
    if (locked) { setDriverPickerOpen(false); setActivePosition(null) }
  }, [locked])

  // True from 30 s before races/{id}.qualifyingStartAt; flips by itself (hook
  // timer) so the penalty banner can appear while the sheet is already open.
  const { switched: qualifyingSwitched } = useQualifyingSwitch(currentRace)

  // Display clock for the "Départ dans" boxes only (no decision depends on it).
  const now = useNowEvery(30000)

  // Re-initialize the draft every time the sheet transitions to open —
  // mirrors the previous openRaceSheet() click handler, which always ran
  // fresh regardless of whether the same race was reopened.
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && race) {
      const existing = getMyPrediction(race.id)
      setDraftPrediction(existing?.prediction ?? { P1: null, P2: null, P3: null })
    }
    prevOpenRef.current = isOpen
  }, [isOpen, race])

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

  // Touching the already-chosen driver again removes it (no ✕ on the portraits).
  const choosePicked = (driver) => {
    if (!activePosition) return
    if (draftPrediction[activePosition] === driver) {
      clearPosition(activePosition)
      setDriverPickerOpen(false)
      setActivePosition(null)
      return
    }
    selectDriver(driver)
  }

  const openPicker = (pos) => {
    if (locked) return
    setActivePosition(pos)
    setDriverPickerOpen(true)
  }

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
        // counter. Any penalty is decided and written server-side.
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

        // Penalties are no longer written from the client: the server computes
        // them from its own clock (cloud function, switch at the start of the
        // Qualifying session). The client therefore claims nothing about a
        // penalty here.
        addToast('Pronostic modifié', 'warning')
      }
      handleClose()
    } catch (err) {
      addToast('Erreur lors de la sauvegarde', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // "Valider" goes through here: the penalty context is recomputed at click
  // time (Date.now(), never frozen when the sheet opens). No penalty -> save
  // exactly as before; otherwise a confirmation first. Cancelling writes
  // nothing and keeps the sheet and the draft as they are.
  const penaltyConfirm = usePenaltyConfirm({
    getContext: () => getPenaltyContext({
      race: currentRace,
      league,
      existingPrediction: race ? getMyPrediction(race.id) : null,
      draft: draftPrediction,
      nowMs: Date.now(),
    }),
    save: savePrediction,
  })

  // A pending confirmation must not outlive the sheet or the lock.
  useEffect(() => {
    if (locked || !isOpen) penaltyConfirm.reset()
  }, [locked, isOpen])

  // ── Display-only derivations ───────────────────────────────────────────────
  const mode = !currentRace ? 'upcoming'
    : currentRace.status === 'cancelled' ? 'cancelled'
    : currentRace.status === 'completed' ? 'completed'
    : 'upcoming'

  // From 30 s before qualifyingStartAt, when the matching league rule is
  // active, the warning below replaces the pre-qualifying notice.
  const switchRule = mode === 'upcoming' && !locked && qualifyingSwitched
    ? getPenaltyRule(league, !!myPred)
    : null

  // Last podium of this player (most recent earlier race with a prediction)
  // and previous edition podium: reminders only, never used for scoring.
  const lastPodium = useMemo(() => {
    if (!race) return []
    const earlier = predictions
      .filter(p => p.playerId === currentPlayerId && p.raceId !== race.id && p.raceId < race.id && p.prediction)
      .sort((a, b) => b.raceId - a.raceId)[0]
    return earlier ? POSITIONS.map(pos => earlier.prediction[pos]).filter(Boolean) : []
  }, [predictions, currentPlayerId, race])

  const previousPodium = useMemo(() => {
    if (!raceHistory?.podium || currentRace?.firstEdition) return []
    return POSITIONS.map(pos => raceHistory.podium[pos]?.name).filter(Boolean)
  }, [raceHistory, currentRace])

  // Completed race: one row per player, best score first, players without a
  // prediction last. Same scoring as before (calculateRaceScore + penalties).
  const rows = useMemo(() => {
    if (mode !== 'completed' || !currentRace?.result) return []
    const list = playerIds.map((pid, index) => {
      const playerData = players.find(p => p.id === pid)
      const identity = getPlayerIdentity(profiles, playerData, index)
      const base = {
        id: pid,
        color: String(identity.color),
        avatar: String(identity.avatar),
        name: String(identity.displayName),
      }
      const pred = predictions.find(p => p.playerId === pid && p.raceId === currentRace.id)
      if (!pred) return { ...base, none: true, net: null }
      const { raw, bonus, total, details, perfectPodium } = calculateRaceScore(pred.prediction, currentRace.result)
      const pen = penalties
        .filter(p => p.playerId === pid && p.raceId === currentRace.id)
        .reduce((s, p) => s + getPenaltyAmount(p), 0)
      return {
        ...base,
        pred,
        picks: POSITIONS.map(pos => pred.prediction[pos]),
        st: POSITIONS.map(pos => details[pos]),
        pts: POSITIONS.map(pos => detailPoints(details[pos])),
        raw, bonus, gross: total, pen, net: total - pen, perfect: perfectPodium,
      }
    })
    return list.sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || a.name.localeCompare(b.name, 'fr'))
  }, [mode, currentRace, playerIds, players, profiles, predictions, penalties])

  const me = rows.find(r => r.id === currentPlayerId)
  const headerResult = me ? {
    none: !!me.none,
    net: me.net, raw: me.raw, bonus: me.bonus ?? 0, pen: me.pen ?? 0, perfect: !!me.perfect,
    rank: me.none ? null : rankOf(rows, me.net),
    tied: !me.none && rows.filter(r => r.net === me.net).length > 1,
    total: rows.length,
    color: me.color,
  } : { none: true }

  const hasDraft = POSITIONS.some(p => draftPrediction[p])

  // ── Fixed footer (upcoming races only) ─────────────────────────────────────
  const footer = mode === 'upcoming' && currentRace ? (
    <div className="px-5 pt-2 pb-2">
      {locked ? (
        <div className="w-full py-2 rounded-xl bg-surfaceHigh text-muted flex flex-col items-center justify-center min-h-[52px]">
          <span className="flex items-center gap-2 font-black text-base text-white/80"><Lock size={16} />Pronostics verrouillés</span>
          <span className="text-[11px] leading-tight">Le Grand Prix a commencé</span>
        </div>
      ) : (
        <button
          onClick={penaltyConfirm.request}
          disabled={!canSave || saving}
          className={`w-full py-3 rounded-xl font-black text-lg tracking-wide transition-all active:scale-95 ${
            canSave && !saving ? 'bg-accent text-white shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
          }`}
        >
          {saving
            ? 'Enregistrement...'
            : canSave
              ? (switchRule ? `Valider mon pronostic · -${switchRule.amount} pts` : 'Valider mon pronostic')
              : 'Complétez le podium'}
        </button>
      )}
    </div>
  ) : null

  return (
    <>
      {/* ── Race detail sheet ── */}
      <BottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        bare
        fullHeight
        footer={footer}
      >
        {race && currentRace && (
          <div>
            <RaceHeader
              race={currentRace}
              round={round}
              mode={mode}
              started={raceStarted}
              now={now}
              result={headerResult}
            />

            {/* ── GP annulé ── */}
            {mode === 'cancelled' && (
              <div className="px-5 pt-5">
                <div className="card px-5 py-8 flex flex-col items-center text-center gap-3">
                  <span className="w-14 h-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center"><Ban size={26} className="text-accent" /></span>
                  <p className="text-lg font-black leading-tight">Ce Grand Prix a été annulé</p>
                  <p className="text-sm text-muted leading-snug">Aucun pronostic ni résultat ne sera comptabilisé pour cette course.</p>
                </div>
              </div>
            )}

            {/* ── Course à venir : mon podium ── */}
            {mode === 'upcoming' && (
              <>
                <div className="px-5 pt-3">
                  <div className="flex items-baseline justify-between !mb-2">
                    <p className="section-title !mb-2">Ton podium</p>
                    {locked ? (
                      <p className="flex items-center gap-1 text-[11px] text-muted mb-2"><Lock size={11} />{hasDraft ? 'Pronostic verrouillé' : 'Aucun pronostic'}</p>
                    ) : hasDraft ? (
                      <p className="text-[11px] text-muted mb-2">Touche un pilote pour le changer</p>
                    ) : null}
                  </div>
                  <PodiumCard values={draftPrediction} drivers={drivers} onTapPos={locked ? undefined : openPicker} />

                  {switchRule && (
                    <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs leading-snug">
                      <AlertTriangle size={14} className="text-accent shrink-0 mt-[1px]" />
                      {switchRule.kind === 'late' ? (
                        <span>Qualifs passées : un premier pronostic coûte <b className="text-accent">-{switchRule.amount} pts</b></span>
                      ) : (
                        <span>
                          Qualifs passées : <b className="text-accent">-{switchRule.amount} pts</b> à chaque validation<br />
                          <span className="text-muted">d'un podium modifié, que tu changes 1 ou 3 pilotes</span>
                        </span>
                      )}
                    </div>
                  )}
                  {!switchRule && !locked && myPred && modPenaltyRule && (
                    <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                      <LockOpen size={14} className="text-green-400 shrink-0" />
                      Modifiable gratuitement jusqu'aux qualifs
                    </p>
                  )}
                </div>

                <HistoryBlock history={raceHistory} firstEdition={currentRace.firstEdition} drivers={drivers} />
              </>
            )}

            {/* ── Course terminée : podium officiel, joueurs, qualifs, historique ── */}
            {mode === 'completed' && (
              <>
                <div className="px-5 pt-3">
                  <p className="section-title !mb-2">Podium officiel</p>
                  {currentRace.result ? (
                    <PodiumCard values={currentRace.result} drivers={drivers} />
                  ) : (
                    <p className="text-sm text-muted rounded-xl border border-dashed border-border px-3 py-6 text-center">Résultat officiel à venir</p>
                  )}
                </div>

                {currentRace.result && (
                  <>
                    <div className="mt-3 border-t border-border" />
                    <PlayersTable
                      rows={rows}
                      meId={currentPlayerId}
                      drivers={drivers}
                      penalties={penalties}
                      raceId={currentRace.id}
                    />
                  </>
                )}

                <QualifyingBlock qualifying={currentRace.qualifying} drivers={drivers} />
                <HistoryBlock history={raceHistory} firstEdition={currentRace.firstEdition} drivers={drivers} />
                <div className="h-4" />
              </>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Driver picker sheet */}
      <DriverPicker
        isOpen={driverPickerOpen}
        onClose={() => { setDriverPickerOpen(false); setActivePosition(null) }}
        position={activePosition}
        draft={draftPrediction}
        drivers={drivers}
        races={races}
        onChoose={choosePicked}
        lastPodium={lastPodium}
        previousPodium={previousPodium}
        previousYear={raceHistory?.year}
        raceFlag={currentRace?.flag}
      />

      {/* Penalty confirmation — fixed z-50, above the BottomSheets (z-40) */}
      <ConfirmModal
        isOpen={!!penaltyConfirm.pending}
        danger
        {...buildPenaltyConfirm(penaltyConfirm.pending)}
        onConfirm={penaltyConfirm.confirm}
        onCancel={penaltyConfirm.cancel}
      />
    </>
  )
}
