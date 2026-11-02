/**
 * LOT 4 — retrait automatique des pénalités injectées par un horaire provisoire.
 *
 * Tant que races/{id}.qualifyingStartAt est provisoire (qualifyingStartSource
 * 'scheduled'), le serveur pénalise d'après l'horaire programmé. L'heure réelle
 * n'est posée qu'environ 90 minutes après le début programmé (étape B de
 * qualifyingStart.js : source 'actual', et qualifyingScheduledStartAt conserve
 * l'horaire d'origine). Si la séance a démarré PLUS TARD que prévu, toute
 * pénalité automatique dont l'eventTime est antérieur à l'heure réelle est
 * injuste : ce module la retire, par SUPPRESSION (comme le ferait un admin),
 * avec trace dans penaltyJournal.
 *
 * Exécuté par penaltyCatchUp, APRÈS la logique de rattrapage existante, dans
 * un bloc isolé (voir index.js). N'écrit que dans : penalties (delete),
 * penaltyJournal (set merge) et races/{id} (update ciblé du marqueur).
 *
 * ── Ce qui fait foi ─────────────────────────────────────────────────────
 * Les pénalités automatiques n'ont QUE source === 'auto'. Les autres (sans
 * source : anciennes ou manuelles) ne sont jamais touchées. Une pénalité dont
 * l'eventTime est illisible est CONSERVÉE (jamais supprimée par supposition).
 * Aucune pénalité n'est jamais AJOUTÉE rétroactivement : si l'heure réelle n'est
 * pas plus tardive que l'horaire programmé de plus de 2 s (écart nul ou
 * inférieur, ou heure réelle antérieure), il n'y a rien à retirer : la course
 * reçoit quand même le marqueur (compteur 0, penaltyRetractionNote
 * 'aucun-retard'), pour ne plus être réexaminée à chaque passage.
 *
 * ── Lien pénalité <-> journal ───────────────────────────────────────────
 * id de la pénalité : `pen_auto_${type}_${predictionId}_${key}`
 * id du journal     : `${predictionId}_${key}`   (key = id d'événement ou
 *                                                 `catchup-<ms>`)
 * L'entrée de journal est le marqueur « événement déjà traité » : elle n'est
 * JAMAIS supprimée, seulement enrichie (retractedAt, retractReason,
 * qualifyingStartAtActual). Un rejeu de l'événement, ou le rattrapage, la voit
 * et ne recrée donc rien. Si elle manque (cas anormal), elle est créée avec le
 * même id : le marqueur existe alors aussi.
 *
 * ── Idempotence et reprise ──────────────────────────────────────────────
 * Chaque pénalité est retirée dans UN lot atomique (delete + journal). Une
 * pénalité retirée n'apparaît plus à la lecture suivante : une reprise après
 * échec ne supprime jamais deux fois. Le marqueur
 * races/{id}.penaltyRetractionDoneAt n'est posé que si TOUT a réussi (et que
 * le plafond par passage n'a pas été atteint).
 *
 * ── Index ─────────────────────────────────────────────────────────────────
 * Aucun index composite : égalité sur un seul champ (qualifyingStartSource,
 * raceId), puis filtrage en mémoire.
 */

const JOURNAL_COLLECTION = 'penaltyJournal'
const PENALTIES_COLLECTION = 'penalties'
const RACES_COLLECTION = 'races'

const RETRACT_REASON = 'qualification-started-later'
const NO_DELAY_NOTE = 'aucun-retard'
// L'écart minimal entre heure réelle et horaire programmé pour agir : en deçà,
// c'est du bruit de mesure (Mexique : +131 ms).
const MIN_DELAY_MS = 2000
// Une course terminée reste examinée 7 jours après son départ.
const COMPLETED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
// Plafond de pénalités retirées par passage (2 écritures chacune, un lot par
// pénalité). Très au-dessus du besoin réel (quelques dizaines au pire), il
// borne seulement un cas anormal ; la suite est reprise au passage suivant.
const MAX_RETRACTIONS_PER_PASS = 200

// Timestamp Firestore | Date | nombre -> millisecondes (NaN si inexploitable).
function toMillis(v) {
  if (v == null) return NaN
  try {
    if (typeof v.toMillis === 'function') return v.toMillis()
  } catch {
    return NaN
  }
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  return NaN
}

// `${predictionId}_${key}` déduit de l'id d'une pénalité automatique, ou null
// si l'id n'a pas la forme attendue.
function journalIdForPenalty(penaltyId, penaltyData) {
  const m = /^pen_auto_(?:late|change)_(.+)$/.exec(String(penaltyId))
  if (!m) return null
  const predictionId = penaltyData?.predictionId
  if (typeof predictionId === 'string' && predictionId && !m[1].startsWith(`${predictionId}_`)) return null
  return m[1]
}

/**
 * Cette course doit-elle être examinée ?
 * `noDelay` : l'heure réelle n'est pas plus tardive que l'horaire programmé de
 * plus de MIN_DELAY_MS — rien à retirer, seul le marqueur sera posé.
 * @returns {{ eligible: true, noDelay: boolean, qMs: number, sMs: number } | { eligible: false, reason: string, level?: string }}
 */
function evaluateRace(race, nowMs) {
  if (race?.qualifyingStartSource !== 'actual') return { eligible: false, reason: 'source-not-actual' }
  if (race.penaltyRetractionDoneAt != null) return { eligible: false, reason: 'already-done' }

  if (race.status === 'completed') {
    const startMs = toMillis(race.raceStartAt)
    if (Number.isNaN(startMs) || nowMs - startMs > COMPLETED_WINDOW_MS) return { eligible: false, reason: 'completed-too-old' }
  } else if (race.status !== 'upcoming') {
    return { eligible: false, reason: 'status' }
  }

  const qMs = toMillis(race.qualifyingStartAt)
  const sMs = toMillis(race.qualifyingScheduledStartAt)
  if (Number.isNaN(qMs) || Number.isNaN(sMs)) return { eligible: false, reason: 'invalid-times', level: 'warn' }
  return { eligible: true, noDelay: qMs - sMs <= MIN_DELAY_MS, qMs, sMs }
}

/**
 * Retire UNE pénalité : delete + enrichissement (ou création) de l'entrée de
 * journal, en un seul lot atomique.
 */
async function retractOne(deps, race, penalty) {
  const journalId = journalIdForPenalty(penalty.id, penalty.data) ?? `retract_${penalty.id}`
  const existing = await deps.readJournal(journalId)
  const patch = {
    retractedAt: deps.serverTimestamp(),
    retractReason: RETRACT_REASON,
    qualifyingStartAtActual: race.data.qualifyingStartAt,
  }
  const journalDoc = existing
    ? patch
    : {
        predictionId: penalty.data.predictionId ?? null,
        raceId: penalty.data.raceId ?? race.data.id,
        playerId: penalty.data.playerId ?? null,
        leagueId: penalty.data.leagueId ?? null,
        eventTime: penalty.data.eventTime ?? null,
        source: 'retraction',
        decision: 'retracted-without-journal',
        penaltyId: penalty.id,
        ...patch,
      }
  await deps.commitRetraction({ penaltyId: penalty.id, journalId, journalDoc })
  return { journalId, journalCreated: !existing }
}

/**
 * Passage de retrait.
 *
 * deps = {
 *   listActualRaces()->Promise<Array<{id, data}>>,
 *   listPenaltiesByRace(raceId)->Promise<Array<{id, data}>>,
 *   readJournal(id)->Promise<object|null>,
 *   commitRetraction({penaltyId, journalId, journalDoc})->Promise<void>   (lot atomique)
 *   countRetracted(raceId)->Promise<number>,
 *   markDone(raceDocId, count, note?)->Promise<void>,
 *   serverTimestamp, logger
 * }
 *
 * Une erreur sur une course est journalisée (error, avec l'id de la course)
 * et n'empêche ni les autres courses ni la reprise au passage suivant.
 */
async function runPenaltyRetraction(deps, nowMs = Date.now(), { maxPerPass = MAX_RETRACTIONS_PER_PASS } = {}) {
  const { logger } = deps
  const summary = { races: 0, retracted: 0, kept: 0, markers: 0, noDelayMarkers: 0, errors: 0, skipped: {} }
  let budget = maxPerPass

  const races = await deps.listActualRaces()
  for (const race of races) {
    const label = `id=${race.data?.id ?? race.id}`
    try {
      const verdict = evaluateRace(race.data, nowMs)
      if (!verdict.eligible) {
        summary.skipped[verdict.reason] = (summary.skipped[verdict.reason] || 0) + 1
        if (verdict.level === 'warn') {
          logger.warn(`[penaltyRetraction] course ${label} : heures illisibles, ignorée.`)
        }
        continue
      }
      const raceId = race.data.id
      if (typeof raceId !== 'number' || !Number.isFinite(raceId)) {
        throw new Error(`id de course inexploitable : ${JSON.stringify(raceId)}`)
      }
      summary.races += 1

      // Pas de retard (ou heure réelle antérieure) : rien à retirer et aucune
      // pénalité ajoutée ; le marqueur évite de réexaminer la course.
      if (verdict.noDelay) {
        await deps.markDone(race.id, 0, NO_DELAY_NOTE)
        summary.markers += 1
        summary.noDelayMarkers += 1
        logger.info(`[penaltyRetraction] course ${label} : heure réelle ${new Date(verdict.qMs).toISOString()} vs programmée ${new Date(verdict.sMs).toISOString()} (écart <= ${MIN_DELAY_MS} ms ou négatif), aucun retard : rien à retirer, marqueur posé (compteur 0).`)
        continue
      }

      const penalties = await deps.listPenaltiesByRace(raceId)
      const toRetract = []
      for (const pen of penalties) {
        if (pen.data?.source !== 'auto') continue // anciennes ou manuelles : jamais touchées
        const eMs = toMillis(pen.data.eventTime)
        if (Number.isNaN(eMs)) {
          summary.kept += 1
          logger.warn(`[penaltyRetraction] course ${label} : pénalité ${pen.id} sans eventTime exploitable, conservée.`)
          continue
        }
        if (eMs < verdict.qMs) toRetract.push(pen)
      }
      toRetract.sort((a, b) => toMillis(a.data.eventTime) - toMillis(b.data.eventTime))

      let incomplete = false
      for (const pen of toRetract) {
        if (budget <= 0) {
          incomplete = true
          logger.warn(`[penaltyRetraction] course ${label} : plafond de ${maxPerPass} pénalités atteint pour ce passage, la suite sera reprise au passage suivant.`)
          break
        }
        try {
          const r = await retractOne(deps, race, pen)
          budget -= 1
          summary.retracted += 1
          logger.warn(`[penaltyRetraction] course ${label} : pénalité ${pen.id} retirée (eventTime ${new Date(toMillis(pen.data.eventTime)).toISOString()} < heure réelle ${new Date(verdict.qMs).toISOString()}), journal ${r.journalId}${r.journalCreated ? ' CRÉÉ (absent)' : ''}.`)
        } catch (err) {
          incomplete = true
          summary.errors += 1
          logger.error(`[penaltyRetraction] course ${label} : échec du retrait de ${pen.id} : ${err.message} — marqueur non posé, reprise au passage suivant.`, { stack: err.stack })
          break
        }
      }
      if (incomplete) continue

      const total = await deps.countRetracted(raceId)
      await deps.markDone(race.id, total)
      summary.markers += 1
      logger.info(`[penaltyRetraction] course ${label} : terminé, ${total} pénalité(s) retirée(s) au total, marqueur posé.`)
    } catch (err) {
      summary.errors += 1
      logger.error(`[penaltyRetraction] course ${label} : erreur : ${err.message}`, { stack: err.stack })
    }
  }

  logger.info(`[penaltyRetraction] Passage terminé : ${JSON.stringify(summary)}`)
  return summary
}

/**
 * Dépendances Firestore réelles (seul code de ce fichier qui touche à la base).
 *
 * @param {object} p
 * @param {any} p.db                    admin.firestore()
 * @param {() => any} p.serverTimestamp admin.firestore.FieldValue.serverTimestamp
 * @param {object} p.logger
 */
function makeRetractionDeps({ db, serverTimestamp, logger }) {
  const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  return {
    // Égalité sur un seul champ : aucun index composite.
    listActualRaces: async () => toDocs(await db.collection(RACES_COLLECTION).where('qualifyingStartSource', '==', 'actual').get()),
    listPenaltiesByRace: async (raceId) => toDocs(await db.collection(PENALTIES_COLLECTION).where('raceId', '==', raceId).get()),
    readJournal: async (id) => {
      const snap = await db.collection(JOURNAL_COLLECTION).doc(String(id)).get()
      return snap.exists ? snap.data() : null
    },
    commitRetraction: async ({ penaltyId, journalId, journalDoc }) => {
      const batch = db.batch()
      batch.delete(db.collection(PENALTIES_COLLECTION).doc(penaltyId))
      batch.set(db.collection(JOURNAL_COLLECTION).doc(journalId), journalDoc, { merge: true })
      await batch.commit()
    },
    countRetracted: async (raceId) => {
      const snap = await db.collection(JOURNAL_COLLECTION).where('raceId', '==', raceId).get()
      return snap.docs.filter((d) => d.data().retractReason === RETRACT_REASON).length
    },
    // Mise à jour CIBLÉE (2 champs, +1 note si renseignée) : jamais un set() du
    // document de course.
    markDone: async (raceDocId, count, note) => {
      await db.collection(RACES_COLLECTION).doc(String(raceDocId)).update({
        penaltyRetractionDoneAt: serverTimestamp(),
        penaltyRetractionCount: count,
        ...(note ? { penaltyRetractionNote: note } : {}),
      })
    },
    serverTimestamp,
    logger,
  }
}

/** Adaptateur de la fonction planifiée. */
function runPenaltyRetractionPass(firestoreOpts) {
  return runPenaltyRetraction(makeRetractionDeps(firestoreOpts))
}

module.exports = {
  runPenaltyRetractionPass,
  runPenaltyRetraction,
  evaluateRace,
  retractOne,
  journalIdForPenalty,
  makeRetractionDeps,
  RETRACT_REASON,
  NO_DELAY_NOTE,
  MIN_DELAY_MS,
  COMPLETED_WINDOW_MS,
  MAX_RETRACTIONS_PER_PASS,
}
