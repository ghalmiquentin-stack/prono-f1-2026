/**
 * LOT 2 (mode observation) — journal des écritures de pronostics et
 * pénalité "fantôme".
 *
 * Déclenchée par chaque écriture de predictions/{predictionId} (voir
 * functions/index.js, predictionShadowObserver), cette logique :
 *   - consigne l'événement dans `predictionJournal` ;
 *   - calcule la pénalité qui AURAIT dû s'appliquer et la consigne dans
 *     `penaltyShadow`.
 * Elle ne change AUCUN score : elle n'écrit JAMAIS dans predictions,
 * penalties ni races (aucune boucle de déclenchement possible), seulement
 * dans ces deux collections à part. L'admin continue d'arbitrer à la main.
 *
 * Modèle observé (regles-de-gestion.md §4) : la bascule est le début de la
 * séance "Qualifying" (races.qualifyingStartAt, rempli par le lot 1). Avant :
 * tout est gratuit. Après : un premier pronostic = pénalité 'late'
 * (postQualifsPenalty), une modification du podium = pénalité 'change'
 * (modificationPenalty).
 *
 * L'heure retenue est TOUJOURS event.time (horloge serveur Firestore,
 * vérifiée au lot 0) — jamais submittedAt/modifiedAt, écrits par l'appareil
 * du joueur et donc falsifiables.
 *
 * Idempotence : journal et pénalité fantôme ont un id déterministe
 * `${predictionId}_${event.id}`, écrits par create() (jamais d'écrasement).
 * Un rejeu du même événement (retry, livraison multiple) ne produit donc
 * aucun doublon. La pénalité fantôme est écrite AVANT le journal : le journal
 * fait office de marqueur de fin ; s'il existe, la pénalité due existe aussi.
 *
 * Erreurs, deux familles (toutes deux journalisées par logger.error avec le
 * predictionId et l'event.id, jamais d'avalement silencieux) :
 *   - PERMANENTES (événement sans données, event.id/event.time inexploitables,
 *     pronostic sans raceId exploitable) : un rejeu ne peut pas les réparer
 *     et bouclerait jusqu'à la limite du retry. Journalisées puis NON
 *     relancées (retour { decision: 'permanent-error' }, rien d'écrit).
 *   - TRANSITOIRES (lecture/écriture Firestore, tout le reste) : relancées
 *     pour que le retry rejoue l'événement.
 *
 * Valeurs de shadowDecision :
 *   'no-basis'            races/{raceId}.qualifyingStartAt absent (ou course absente)
 *   'free'                eventTime < qualifyingStartAt
 *   'delete-journal-only' suppression après la bascule : journal seulement
 *   'not-a-modification'  mise à jour après la bascule sans changement du podium
 *   'no-league-rules'     ligue ou réglage (activation/montant) introuvable
 *   'disabled'            réglage de la ligue désactivé
 *   'would-apply-late'    pénalité tardive due (écrite dans penaltyShadow)
 *   'would-apply-change'  pénalité de modification due (écrite dans penaltyShadow)
 */

const JOURNAL_COLLECTION = 'predictionJournal'
const SHADOW_COLLECTION = 'penaltyShadow'

// Erreur que rejouer l'événement ne peut pas réparer : journalisée, jamais relancée.
class PermanentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentError'
  }
}

// Comparaison profonde de valeurs JSON simples (objets, tableaux, primitives).
// Insensible à l'ordre des clés. null et undefined sont équivalents (un champ
// absent n'est pas une différence de podium).
function deepEqual(a, b) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

// Timestamp Firestore | Date | nombre -> millisecondes (NaN si inexploitable).
function toMillis(v) {
  if (v == null) return NaN
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  return NaN
}

/**
 * Cœur de la décision, pur : ne fait aucune entrée/sortie.
 *
 * @param {object} p
 * @param {'create'|'update'|'delete'} p.eventType
 * @param {boolean} p.podiumChanged
 * @param {number} p.eventMs                 event.time en millisecondes
 * @param {object|null} p.race               données de races/{raceId} (ou null)
 * @param {object|null} p.league             données de leagues/{leagueId} (ou null)
 * @returns {{ decision: string, penalty: {type: 'late'|'change', amount: number} | null }}
 */
function decide({ eventType, podiumChanged, eventMs, race, league }) {
  const qMs = toMillis(race?.qualifyingStartAt)
  if (Number.isNaN(qMs)) return { decision: 'no-basis', penalty: null }
  if (eventMs < qMs) return { decision: 'free', penalty: null }

  // eventTime >= qualifyingStartAt : la pénalité aurait dû s'appliquer.
  let type
  if (eventType === 'delete') return { decision: 'delete-journal-only', penalty: null }
  if (eventType === 'create') type = 'late'
  else if (podiumChanged) type = 'change'
  else return { decision: 'not-a-modification', penalty: null }

  const ruleKey = type === 'late' ? 'postQualifsPenalty' : 'modificationPenalty'
  const rule = league?.rules?.[ruleKey]
  if (!rule || typeof rule.enabled !== 'boolean') return { decision: 'no-league-rules', penalty: null }
  if (rule.enabled !== true) return { decision: 'disabled', penalty: null }
  if (typeof rule.amount !== 'number' || Number.isNaN(rule.amount)) return { decision: 'no-league-rules', penalty: null }

  return {
    decision: type === 'late' ? 'would-apply-late' : 'would-apply-change',
    penalty: { type, amount: rule.amount },
  }
}

/**
 * Traite un événement d'écriture de pronostic.
 *
 * deps = {
 *   readRace(raceId)->Promise<object|null>, readLeague(leagueId)->Promise<object|null>,
 *   writeShadow(id, doc)->Promise<boolean>, writeJournal(id, doc)->Promise<boolean>,
 *     (true = créé, false = existait déjà ; toute autre erreur est levée),
 *   toTimestamp(Date)->any, logger
 * }
 * event = { id, time, predictionId, before: object|null, after: object|null }
 *
 * @returns {Promise<{journalId, journalCreated, shadowId|null, shadowCreated|null, decision}>}
 */
async function handlePredictionWrite(deps, event) {
  const { readRace, readLeague, writeShadow, writeJournal, toTimestamp, logger } = deps
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
    const playerId = subject.playerId ?? null // Firestore refuse undefined
    const leagueId = subject.leagueId ?? null
    const raceIdOk = (typeof raceId === 'number' && Number.isFinite(raceId))
      || (typeof raceId === 'string' && raceId !== '' && !raceId.includes('/'))
    if (!raceIdOk) throw new PermanentError(`pronostic sans raceId exploitable : ${JSON.stringify(raceId)}`)
    const podiumChanged = !deepEqual(before?.prediction, after?.prediction)

    const race = await readRace(raceId)
    // La ligue n'est lue que si une pénalité est envisageable (après la
    // bascule, hors suppression/mise à jour sans changement) : décision en
    // deux temps pour ne pas lire inutilement.
    const needsLeague = (() => {
      const qMs = toMillis(race?.qualifyingStartAt)
      return !Number.isNaN(qMs) && eventMs >= qMs && (eventType === 'create' || (eventType === 'update' && podiumChanged))
    })()
    const league = needsLeague && leagueId ? await readLeague(leagueId) : null

    const { decision, penalty } = decide({ eventType, podiumChanged, eventMs, race, league })

    const docId = `${predictionId}_${eventId}`
    const eventTime = toTimestamp(new Date(eventMs))

    let shadowCreated = null
    if (penalty) {
      shadowCreated = await writeShadow(docId, {
        predictionId,
        type: penalty.type,
        playerId,
        raceId,
        leagueId,
        amount: penalty.amount, // montant de la ligue à cet instant
        eventTime,
      })
    }

    const journalCreated = await writeJournal(docId, {
      predictionId,
      raceId,
      playerId,
      leagueId,
      eventType,
      eventTime, // event.time, jamais un champ du pronostic
      eventTimeRaw: time, // chaîne d'origine (précision à la microseconde)
      podiumChanged,
      modificationCountAfter: after && typeof after.modificationCount === 'number' ? after.modificationCount : null,
      qualifyingStartAtUsed: race?.qualifyingStartAt ?? null,
      qualifyingStartSourceUsed: race?.qualifyingStartSource ?? null,
      shadowDecision: decision,
    })

    if (!journalCreated) {
      logger.info(`[predictionShadow] ${predictionId} event=${eventId} : déjà journalisé (rejeu), rien de plus.`)
    }
    return { journalId: docId, journalCreated, shadowId: penalty ? docId : null, shadowCreated, decision }
  } catch (err) {
    if (err instanceof PermanentError) {
      logger.error(`[predictionShadow] Erreur PERMANENTE pour predictionId=${predictionId} event=${eventId} : ${err.message} — non relancée (un rejeu ne la réparerait pas).`)
      return { journalId: null, journalCreated: false, shadowId: null, shadowCreated: null, decision: 'permanent-error' }
    }
    logger.error(`[predictionShadow] Échec pour predictionId=${predictionId} event=${eventId} : ${err.message}`, { stack: err.stack })
    throw err // transitoire : relance, le retry rejoue l'événement
  }
}

const ALREADY_EXISTS = 6 // code gRPC Firestore

// create() : n'écrase jamais. Un document déjà présent (rejeu) => false ;
// toute autre erreur est relancée.
async function createOnce(ref, doc) {
  try {
    await ref.create(doc)
    return true
  } catch (err) {
    if (err && (err.code === ALREADY_EXISTS || err.code === 'already-exists')) return false
    throw err
  }
}

/**
 * Adaptateur Cloud Functions : traduit l'événement Firestore (Change de
 * DocumentSnapshot) et branche les dépendances réelles. Seul code de ce
 * fichier qui touche à Firestore.
 *
 * @param {object} p
 * @param {any} p.db            admin.firestore()
 * @param {object} p.logger     firebase-functions/logger
 * @param {(d: Date) => any} p.toTimestamp
 * @param {any} p.event         événement onDocumentWritten
 */
function observePredictionWrite({ db, logger, toTimestamp, event }) {
  const change = event.data
  const before = change?.before?.exists ? change.before.data() : null
  const after = change?.after?.exists ? change.after.data() : null

  const readDoc = async (collection, id) => {
    const snap = await db.collection(collection).doc(String(id)).get()
    return snap.exists ? snap.data() : null
  }

  return handlePredictionWrite(
    {
      readRace: (raceId) => readDoc('races', raceId),
      readLeague: (leagueId) => readDoc('leagues', leagueId),
      writeShadow: (id, doc) => createOnce(db.collection(SHADOW_COLLECTION).doc(id), doc),
      writeJournal: (id, doc) => createOnce(db.collection(JOURNAL_COLLECTION).doc(id), doc),
      toTimestamp,
      logger,
    },
    { id: event.id, time: event.time, predictionId: event.params?.predictionId, before, after }
  )
}

module.exports = {
  observePredictionWrite,
  handlePredictionWrite,
  decide,
  deepEqual,
  PermanentError,
  createOnce,
  JOURNAL_COLLECTION,
  SHADOW_COLLECTION,
}
