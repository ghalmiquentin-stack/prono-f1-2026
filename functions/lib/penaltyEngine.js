/**
 * LOT 2b — pénalités RÉELLES calculées côté serveur (horloge serveur).
 *
 * Modèle (regles-de-gestion.md §4) : la bascule est le début de la séance
 * "Qualifying" (races.qualifyingStartAt, lot 1). Avant : tout est gratuit.
 * Après : un premier pronostic = pénalité 'late' (postQualifsPenalty), une
 * modification du podium = pénalité 'change' (modificationPenalty). Une
 * pénalité supprimée par l'admin n'est JAMAIS recréée.
 *
 * Deux points d'entrée, qui partagent les mêmes règles :
 *   1. handleActiveWrite   — déclenché par chaque écriture de predictions/{id}
 *                            (voir index.js, predictionPenaltyApplier).
 *   2. runCatchUp          — passage planifié toutes les 15 min qui rattrape un
 *                            événement manqué (le lot 0 en a perdu 1 sur 16).
 *
 * Réutilise decide() de predictionShadow.js SANS le modifier : le cœur de
 * décision est strictement celui qui a été observé en production.
 *
 * ── Journal ─────────────────────────────────────────────────────────────
 * Collection `penaltyJournal`, distincte de `predictionJournal` (fonction
 * d'observation, inchangée et encore déployée). Les deux fonctions voient les
 * mêmes événements ; avec une collection commune, l'id `${predictionId}_${event.id}`
 * serait pris par la première arrivée et l'autre croirait à un rejeu — la
 * fonction active ne poserait alors JAMAIS sa pénalité. Séparation = aucun
 * conflit d'identifiants.
 *
 * ── Atomicité et idempotence ─────────────────────────────────────────────
 * La pénalité ET l'entrée de journal sont écrites dans UN SEUL lot atomique
 * (create sur les deux). L'entrée de journal est le marqueur de traitement :
 *   - elle existe déjà (rejeu) => rien n'est (re)créé, même si l'admin a
 *     supprimé la pénalité entre-temps ;
 *   - le lot échoue (erreur transitoire) => aucune des deux n'est écrite,
 *     l'erreur est relancée et le retry rejoue tout ;
 *   - la pénalité existe sans l'entrée de journal (cas anormal) => seule
 *     l'entrée est créée, la pénalité n'est jamais recréée.
 *
 * ── Cohabitation événement / rattrapage ──────────────────────────────────
 * Le rattrapage ne regarde que les pronostics dont la dernière écriture a plus
 * de SETTLE_MS (un événement normal est traité en quelques secondes). Si un
 * événement est rejoué par le retry APRÈS qu'un rattrapage a déjà tenu compte
 * de cette écriture, la fonction active le détecte (entrée de journal
 * 'catchup' d'eventTime >= event.time) et ne pose pas de seconde pénalité
 * ('covered-by-catchup').
 *
 * ── Erreurs ───────────────────────────────────────────────────────────────
 * PERMANENTES (événement/pronostic inexploitable) : logger.error, NON relancées.
 * TRANSITOIRES (lecture/écriture Firestore) : logger.error puis relancées.
 */

const { decide, deepEqual, PermanentError } = require('./predictionShadow')

const JOURNAL_COLLECTION = 'penaltyJournal'
const PENALTIES_COLLECTION = 'penalties'

const SETTLE_MS = 10 * 60 * 1000 // rattrapage : écriture vieille d'au moins 10 min
const LOOKBACK_MS = 72 * 60 * 60 * 1000 // ... et de moins de 72 h
const MISSED_TOLERANCE_MS = 120 * 1000 // dernière entrée plus ancienne que updatedAt - 120 s => manqué
const MAX_PREDICTIONS_PER_PASS = 300
// event.time (microsecondes) et updatedAt (millisecondes) peuvent différer de
// 1 ms à l'arrondi. Sans danger : le rattrapage n'examine que des écritures
// vieilles d'au moins SETTLE_MS, donc aucun vrai événement distinct ne peut
// tomber dans cette fenêtre d'une seconde.
const COVER_TOLERANCE_MS = 1000

// Timestamp Firestore | Date | nombre -> millisecondes (NaN si inexploitable).
function toMillis(v) {
  if (v == null) return NaN
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  return NaN
}

const isRaceIdOk = (raceId) =>
  (typeof raceId === 'number' && Number.isFinite(raceId))
  || (typeof raceId === 'string' && raceId !== '' && !raceId.includes('/'))

// Identifiant déterministe d'une pénalité automatique : `key` est l'id de
// l'événement (voie événement) ou `catchup-<updatedAt ms>` (voie rattrapage).
const penaltyIdFor = (type, predictionId, key) => `pen_auto_${type}_${predictionId}_${key}`

const appliedDecision = (penalty) => (penalty.type === 'late' ? 'applied-late' : 'applied-change')

/**
 * Écrit la pénalité (si due) et l'entrée de journal en UN lot atomique.
 *
 * deps.commit({ penalty: {id, doc}|null, journal: {id, doc} })
 *   -> 'created' | 'already-exists' (erreur gRPC 6) ; toute autre erreur est levée.
 * deps.readJournal(id) -> object|null ; deps.createJournalOnly(id, doc) -> boolean
 *
 * @returns {Promise<'created'|'replay'|'journal-only'>}
 */
async function commitAtomically(deps, { journalId, journalDoc, penaltyId, penaltyDoc }) {
  const result = await deps.commit({
    penalty: penaltyId ? { id: penaltyId, doc: penaltyDoc } : null,
    journal: { id: journalId, doc: journalDoc },
  })
  if (result === 'created') return 'created'

  // Un des deux documents existe déjà : rejeu, ou pénalité orpheline.
  if (await deps.readJournal(journalId)) return 'replay'
  // Pénalité présente sans journal : on ne la recrée JAMAIS, on note seulement
  // le traitement pour qu'un rejeu ne retente rien.
  await deps.createJournalOnly(journalId, { ...journalDoc, penaltyPreexisting: true })
  return 'journal-only'
}

/**
 * Voie événement : traite une écriture de pronostic.
 *
 * deps = {
 *   readRace, readLeague, readJournal, listJournal(predictionId)->Promise<Array>,
 *   commit, createJournalOnly, toTimestamp, serverTimestamp, logger
 * }
 * event = { id, time, predictionId, before: object|null, after: object|null }
 */
async function handleActiveWrite(deps, event) {
  const { readRace, readLeague, readJournal, listJournal, toTimestamp, serverTimestamp, logger } = deps
  const { id: eventId, time, predictionId, before, after } = event

  try {
    if (!before && !after) throw new PermanentError('événement sans données avant/après')
    if (typeof eventId !== 'string' || !eventId) throw new PermanentError('event.id manquant')
    if (typeof predictionId !== 'string' || !predictionId) throw new PermanentError('predictionId manquant')
    const eventMs = Date.parse(time)
    if (Number.isNaN(eventMs)) throw new PermanentError(`event.time illisible : ${JSON.stringify(time)}`)

    const eventType = !before ? 'create' : !after ? 'delete' : 'update'
    const subject = after ?? before
    const { raceId } = subject
    const playerId = subject.playerId ?? null
    const leagueId = subject.leagueId ?? null
    if (!isRaceIdOk(raceId)) throw new PermanentError(`pronostic sans raceId exploitable : ${JSON.stringify(raceId)}`)

    const journalId = `${predictionId}_${eventId}`

    // Rejeu : l'entrée de journal fait foi. Rien n'est recréé, même si
    // l'admin a supprimé la pénalité entre-temps.
    if (await readJournal(journalId)) {
      logger.info(`[penaltyEngine] ${predictionId} event=${eventId} : déjà traité (rejeu), rien recréé.`)
      return { decision: 'replay', journalId, status: 'replay', penaltyId: null }
    }

    const podiumChanged = !deepEqual(before?.prediction, after?.prediction)
    const race = await readRace(raceId)
    const qMs = toMillis(race?.qualifyingStartAt)
    const needsLeague = !Number.isNaN(qMs) && eventMs >= qMs
      && (eventType === 'create' || (eventType === 'update' && podiumChanged))
    const league = needsLeague && leagueId ? await readLeague(leagueId) : null

    let { decision, penalty } = decide({ eventType, podiumChanged, eventMs, race, league })

    // Un rattrapage a-t-il déjà tenu compte de cette écriture ? (événement
    // rejoué tardivement par le retry, après un passage du rattrapage.)
    if (penalty) {
      const entries = await listJournal(predictionId)
      if (entries.some((e) => e.source === 'catchup' && toMillis(e.eventTime) >= eventMs - COVER_TOLERANCE_MS)) {
        decision = 'covered-by-catchup'
        penalty = null
      }
    }

    const eventTime = toTimestamp(new Date(eventMs))
    const penaltyId = penalty ? penaltyIdFor(penalty.type, predictionId, eventId) : null
    const penaltyDoc = penalty
      ? {
          playerId, raceId, leagueId, type: penalty.type, amount: penalty.amount,
          source: 'auto', eventTime, predictionId, createdAt: serverTimestamp(),
        }
      : null

    const journalDoc = {
      predictionId, raceId, playerId, leagueId, eventType,
      eventTime, eventTimeRaw: time,
      source: 'event',
      podiumChanged,
      podiumAfter: after?.prediction ?? null,
      modificationCountAfter: after && typeof after.modificationCount === 'number' ? after.modificationCount : null,
      qualifyingStartAtUsed: race?.qualifyingStartAt ?? null,
      qualifyingStartSourceUsed: race?.qualifyingStartSource ?? null,
      decision: penalty ? appliedDecision(penalty) : decision,
      penaltyId,
    }

    const status = await commitAtomically(deps, { journalId, journalDoc, penaltyId, penaltyDoc })
    if (status !== 'created') {
      logger.info(`[penaltyEngine] ${predictionId} event=${eventId} : ${status} (aucune pénalité recréée).`)
    }
    return { decision: journalDoc.decision, journalId, status, penaltyId }
  } catch (err) {
    if (err instanceof PermanentError) {
      logger.error(`[penaltyEngine] Erreur PERMANENTE pour predictionId=${predictionId} event=${eventId} : ${err.message} — non relancée (un rejeu ne la réparerait pas).`)
      return { decision: 'permanent-error', journalId: null, status: 'permanent-error', penaltyId: null }
    }
    logger.error(`[penaltyEngine] Échec pour predictionId=${predictionId} event=${eventId} : ${err.message}`, { stack: err.stack })
    throw err // transitoire : relance, le retry rejoue l'événement
  }
}

/**
 * Voie rattrapage : examine UN pronostic récent d'une course 'upcoming' et
 * détecte un événement manqué (dernière entrée de journal plus ancienne que
 * updatedAt - 120 s). Compare le podium courant à podiumAfter de la dernière
 * entrée ; l'heure de décision est updatedAt (horloge serveur, posée par
 * serverTimestamp). Comparaison impossible (aucune entrée, ou entrée sans
 * podiumAfter) => entrée 'needs-review' SANS pénalité : jamais de supposition.
 *
 * @returns {Promise<string>} issue : 'skipped-*' | 'up-to-date' | 'replay' | <statut du lot>
 */
async function catchUpOne(deps, nowMs, { id: predictionId, data }) {
  const { readRace, readLeague, readJournal, listJournal, toTimestamp, serverTimestamp, logger } = deps

  const updatedAtMs = toMillis(data.updatedAt)
  if (Number.isNaN(updatedAtMs)) return 'skipped-no-updatedAt'
  if (nowMs - updatedAtMs < SETTLE_MS) return 'skipped-too-recent'
  if (!isRaceIdOk(data.raceId)) throw new PermanentError(`pronostic sans raceId exploitable : ${JSON.stringify(data.raceId)}`)

  const entries = (await listJournal(predictionId)).filter((e) => !Number.isNaN(toMillis(e.eventTime)))
  entries.sort((a, b) => toMillis(a.eventTime) - toMillis(b.eventTime))
  const last = entries[entries.length - 1] ?? null
  if (last && toMillis(last.eventTime) >= updatedAtMs - MISSED_TOLERANCE_MS) return 'up-to-date'

  const key = `catchup-${updatedAtMs}`
  const journalId = `${predictionId}_${key}`
  if (await readJournal(journalId)) return 'replay'

  const { raceId } = data
  const playerId = data.playerId ?? null
  const leagueId = data.leagueId ?? null
  const eventTime = toTimestamp(new Date(updatedAtMs))
  const base = {
    predictionId, raceId, playerId, leagueId, eventType: 'update',
    eventTime, eventTimeRaw: new Date(updatedAtMs).toISOString(),
    source: 'catchup',
    podiumAfter: data.prediction ?? null,
    modificationCountAfter: typeof data.modificationCount === 'number' ? data.modificationCount : null,
    previousEntryId: last?.id ?? null,
  }

  // Comparaison impossible : on ne devine jamais.
  if (!last || last.podiumAfter == null) {
    logger.warn(`[penaltyEngine] rattrapage ${predictionId} : ${last ? 'dernière entrée sans podiumAfter' : 'aucune entrée de journal'} — needs-review, aucune pénalité.`)
    return commitAtomically(deps, {
      journalId,
      journalDoc: { ...base, podiumChanged: null, qualifyingStartAtUsed: null, qualifyingStartSourceUsed: null, decision: 'needs-review', penaltyId: null },
      penaltyId: null, penaltyDoc: null,
    })
  }

  const podiumChanged = !deepEqual(data.prediction, last.podiumAfter)
  const race = await readRace(raceId)
  const qMs = toMillis(race?.qualifyingStartAt)
  const needsLeague = !Number.isNaN(qMs) && updatedAtMs >= qMs && podiumChanged
  const league = needsLeague && leagueId ? await readLeague(leagueId) : null
  const { decision, penalty } = decide({ eventType: 'update', podiumChanged, eventMs: updatedAtMs, race, league })

  const penaltyId = penalty ? penaltyIdFor(penalty.type, predictionId, key) : null
  const penaltyDoc = penalty
    ? {
        playerId, raceId, leagueId, type: penalty.type, amount: penalty.amount,
        source: 'auto', eventTime, predictionId, createdAt: serverTimestamp(),
      }
    : null
  const status = await commitAtomically(deps, {
    journalId,
    journalDoc: {
      ...base, podiumChanged,
      qualifyingStartAtUsed: race?.qualifyingStartAt ?? null,
      qualifyingStartSourceUsed: race?.qualifyingStartSource ?? null,
      decision: penalty ? appliedDecision(penalty) : decision,
      penaltyId,
    },
    penaltyId, penaltyDoc,
  })
  if (penalty) logger.warn(`[penaltyEngine] rattrapage ${predictionId} : événement manqué, pénalité ${penalty.type} ${penalty.amount} pts (${status}).`)
  return status
}

/**
 * Passage planifié du rattrapage.
 *
 * deps = {
 *   listUpcomingRaceIds()->Promise<Set<string>>,
 *   listRecentPredictions(sinceMs)->Promise<Array<{id, data}>>,   (updatedAt >= since)
 *   + les dépendances de catchUpOne
 * }
 *
 * Une erreur PERMANENTE sur un pronostic est journalisée (error) sans arrêter
 * les autres ; une erreur TRANSITOIRE aussi, mais le passage est relancé en
 * erreur à la fin (visible dans la supervision) — le passage suivant, 15 min
 * plus tard, retente de toute façon.
 */
async function runCatchUp(deps, nowMs = Date.now()) {
  const { logger } = deps
  const summary = { examined: 0, byOutcome: {}, transientErrors: 0, permanentErrors: 0 }

  const upcoming = await deps.listUpcomingRaceIds()
  if (upcoming.size === 0) {
    logger.info('[penaltyEngine] Rattrapage : aucune course upcoming.')
    return summary
  }
  const recent = await deps.listRecentPredictions(nowMs - LOOKBACK_MS)
  const candidates = recent
    .filter((p) => upcoming.has(String(p.data.raceId)))
    .sort((a, b) => toMillis(a.data.updatedAt) - toMillis(b.data.updatedAt))
  if (candidates.length > MAX_PREDICTIONS_PER_PASS) {
    logger.warn(`[penaltyEngine] Rattrapage : ${candidates.length} pronostics, plafonné à ${MAX_PREDICTIONS_PER_PASS} pour ce passage.`)
  }

  for (const pred of candidates.slice(0, MAX_PREDICTIONS_PER_PASS)) {
    summary.examined += 1
    try {
      const outcome = await catchUpOne(deps, nowMs, pred)
      summary.byOutcome[outcome] = (summary.byOutcome[outcome] || 0) + 1
    } catch (err) {
      if (err instanceof PermanentError) {
        summary.permanentErrors += 1
        logger.error(`[penaltyEngine] Rattrapage, erreur PERMANENTE pour predictionId=${pred.id} : ${err.message} — ignoré.`)
      } else {
        summary.transientErrors += 1
        logger.error(`[penaltyEngine] Rattrapage, échec pour predictionId=${pred.id} : ${err.message}`, { stack: err.stack })
      }
    }
  }

  logger.info(`[penaltyEngine] Rattrapage terminé : ${JSON.stringify(summary)}`)
  if (summary.transientErrors > 0) {
    throw new Error(`rattrapage : ${summary.transientErrors} erreur(s) transitoire(s), voir les logs error`)
  }
  return summary
}

const ALREADY_EXISTS = 6 // code gRPC Firestore
const isAlreadyExists = (err) => err && (err.code === ALREADY_EXISTS || err.code === 'already-exists')

/**
 * Dépendances Firestore réelles (seul code de ce fichier qui touche à la base).
 *
 * @param {object} p
 * @param {any} p.db                    admin.firestore()
 * @param {any} p.FieldPath             admin.firestore.FieldPath
 * @param {() => any} p.serverTimestamp admin.firestore.FieldValue.serverTimestamp
 * @param {(d: Date) => any} p.toTimestamp
 * @param {object} p.logger
 */
function makeFirestoreDeps({ db, FieldPath, serverTimestamp, toTimestamp, logger }) {
  const readDoc = async (collection, id) => {
    const snap = await db.collection(collection).doc(String(id)).get()
    return snap.exists ? snap.data() : null
  }
  return {
    readRace: (raceId) => readDoc('races', raceId),
    readLeague: (leagueId) => readDoc('leagues', leagueId),
    readJournal: (id) => readDoc(JOURNAL_COLLECTION, id),
    // Entrées d'un pronostic : plage d'identifiants de document
    // [`${id}_`, `${id}\``) — '`' est le caractère qui suit '_' : tous les
    // ids commençant par `${id}_`, sans index composite.
    listJournal: async (predictionId) => {
      const snap = await db.collection(JOURNAL_COLLECTION)
        .where(FieldPath.documentId(), '>=', `${predictionId}_`)
        .where(FieldPath.documentId(), '<', `${predictionId}\``)
        .get()
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    commit: async ({ penalty, journal }) => {
      const batch = db.batch()
      if (penalty) batch.create(db.collection(PENALTIES_COLLECTION).doc(penalty.id), penalty.doc)
      batch.create(db.collection(JOURNAL_COLLECTION).doc(journal.id), journal.doc)
      try {
        await batch.commit()
        return 'created'
      } catch (err) {
        if (isAlreadyExists(err)) return 'already-exists'
        throw err
      }
    },
    createJournalOnly: async (id, doc) => {
      try {
        await db.collection(JOURNAL_COLLECTION).doc(id).create(doc)
        return true
      } catch (err) {
        if (isAlreadyExists(err)) return false
        throw err
      }
    },
    listUpcomingRaceIds: async () => {
      const snap = await db.collection('races').where('status', '==', 'upcoming').get()
      return new Set(snap.docs.map((d) => String(d.data().id)))
    },
    // Filtre d'inégalité sur un seul champ : aucun index composite.
    listRecentPredictions: async (sinceMs) => {
      const snap = await db.collection('predictions').where('updatedAt', '>=', toTimestamp(new Date(sinceMs))).get()
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    },
    toTimestamp,
    serverTimestamp,
    logger,
  }
}

/** Adaptateur du déclencheur onDocumentWritten. */
function applyPredictionWrite({ event, ...firestoreOpts }) {
  const change = event.data
  const before = change?.before?.exists ? change.before.data() : null
  const after = change?.after?.exists ? change.after.data() : null
  return handleActiveWrite(makeFirestoreDeps(firestoreOpts), {
    id: event.id, time: event.time, predictionId: event.params?.predictionId, before, after,
  })
}

/** Adaptateur de la fonction planifiée. */
function runPenaltyCatchUp(firestoreOpts) {
  return runCatchUp(makeFirestoreDeps(firestoreOpts))
}

module.exports = {
  applyPredictionWrite,
  runPenaltyCatchUp,
  handleActiveWrite,
  runCatchUp,
  catchUpOne,
  commitAtomically,
  makeFirestoreDeps,
  penaltyIdFor,
  JOURNAL_COLLECTION,
  PENALTIES_COLLECTION,
  SETTLE_MS,
  LOOKBACK_MS,
  MISSED_TOLERANCE_MS,
  MAX_PREDICTIONS_PER_PASS,
}
