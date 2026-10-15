const { resolveMeetingKey: defaultResolveMeetingKey } = require('./fetchRaceResult')

/**
 * Heure de début de la séance "Qualifying" d'une course (jamais la "Sprint
 * Qualifying"), stockée sur races/{id} :
 *   - qualifyingStartAt          : Timestamp — heure réelle si connue, sinon
 *                                  horaire programmé ;
 *   - qualifyingScheduledStartAt : Timestamp — horaire programmé d'origine,
 *                                  conservé quand l'heure réelle remplace
 *                                  qualifyingStartAt ;
 *   - qualifyingStartSource      : 'scheduled' | 'actual' | 'manual'.
 *
 * Appelé depuis autoFetchQualifying (functions/index.js), sans fonction
 * planifiée supplémentaire. Ce module n'écrit JAMAIS que ces trois champs,
 * par .update() ciblé, après relecture du document ; il ne touche ni
 * status, ni result, ni qualifying.
 *
 * ÉTAPE A — qualifyingStartAt absent : sessions?meeting_key&session_name=
 *   Qualifying (correspondance exacte). Exactement 1 session => écrit
 *   l'horaire programmé (date_start), source 'scheduled'. 0 ou plusieurs =>
 *   warn, aucune écriture.
 * ÉTAPE B — source 'scheduled' et maintenant >= programmé + 90 min : plus
 *   ancien message race_control "SESSION STARTED" de la session => écrit
 *   l'heure réelle, source 'actual', sous réserve de la plage de validité
 *   [programmé - 2 h ; raceStartAt[ (une qualification reportée au lendemain,
 *   avant le départ de la course, est donc acceptée). 401/404/aucun message => info, aucune
 *   écriture, nouvel essai au passage suivant (race_control est refusé
 *   pendant la séance et un moment après : hypothèse de données temps réel
 *   payantes, non vérifiée).
 * Les étapes A et B peuvent s'enchaîner dans un même passage.
 *
 * Toutes les dépendances externes (fetch, horloge, Firestore, résolution du
 * meeting_key, conversion en Timestamp) sont injectées : les fonctions de ce
 * fichier se testent sans réseau ni base (voir le script de test du lot).
 */

const OPENF1_BASE = 'https://api.openf1.org/v1'

// Courses candidates : départ dans <= 7 jours, ou déjà passé depuis moins de
// 24 h (aligné sur la fenêtre d'abandon des résultats, GIVE_UP_AFTER_MS dans
// index.js). Au-delà, exclue même si elle reste 'upcoming'.
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000
const LOOKBACK_MS = 24 * 60 * 60 * 1000
const ACTUAL_CHECK_DELAY_MS = 90 * 60 * 1000 // étape B : programmé + 90 min
// Plage de validité d'un "SESSION STARTED" : jamais plus de 2 h avant
// l'horaire programmé, et strictement avant le départ de la course. Hors de
// cette plage on préfère ne rien écrire (warn) plutôt qu'une valeur aberrante.
const EARLY_TOLERANCE_MS = 2 * 60 * 60 * 1000

// OpenF1 (niveau gratuit) : 3 req/s et 30 req/min. 2,1 s entre deux appels
// => < 30/min ; le plafond borne la durée d'un passage (~13 s en conditions
// normales).
const MAX_OPENF1_CALLS_PER_PASS = 6
const CALL_SPACING_MS = 2100
// Le délai d'expiration de autoFetchQualifying est de 120 s (timeoutSeconds
// dans index.js). fetch() natif n'a pas de délai d'attente utile : sans borne,
// un OpenF1 lent ferait tuer le passage en pleine exécution. Chaque appel est
// donc limité, et plus aucun appel n'est lancé au-delà de MAX_PASS_DURATION_MS
// (laisse de la marge aux écritures et à la logique qualifs existante,
// exécutée avant ce bloc).
const FETCH_TIMEOUT_MS = 8000
const MAX_PASS_DURATION_MS = 30000

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function defaultFetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, ok: res.ok, data }
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
 * Compteur d'appels OpenF1 d'un passage : plafonne leur nombre et espace
 * deux appels consécutifs d'au moins `spacingMs`.
 */
function createBudget({
  max = MAX_OPENF1_CALLS_PER_PASS, spacingMs = CALL_SPACING_MS, maxDurationMs = MAX_PASS_DURATION_MS,
  sleep = sleepReal, now = Date.now,
} = {}) {
  let used = 0
  let lastCallAt = null
  const startedAt = now()
  return {
    get used() { return used },
    get remaining() { return max - used },
    // Réserve `n` appels ; attend si nécessaire. false => budget épuisé
    // (nombre d'appels ou durée maximale du passage atteints).
    async take(n = 1) {
      if (used + n > max) return false
      if (now() - startedAt >= maxDurationMs) return false
      if (lastCallAt != null) {
        const wait = lastCallAt + spacingMs - now()
        if (wait > 0) await sleep(wait)
        if (now() - startedAt >= maxDurationMs) return false
      }
      used += n
      lastCallAt = now()
      return true
    },
  }
}

/**
 * Courses à examiner : status 'upcoming' (jamais 'cancelled' ni 'completed'),
 * raceStartAt connu, départ dans <= 7 jours ou passé depuis moins de 24 h.
 * Indépendant de la présence de `qualifying`.
 * Triées du départ le plus proche au plus lointain (le budget d'appels va
 * d'abord à la course la plus imminente).
 *
 * @param {Array<{ref: any, data: () => object}>} docs  documents races/{id}
 */
function selectCandidates(docs, nowMs) {
  return docs
    .map((d) => ({ ref: d.ref, data: d.data() }))
    .filter(({ data }) => {
      if (data.status !== 'upcoming') return false
      const startMs = toMillis(data.raceStartAt)
      if (Number.isNaN(startMs)) return false
      const untilStart = startMs - nowMs
      return untilStart <= LOOKAHEAD_MS && -untilStart < LOOKBACK_MS
    })
    .sort((a, b) => toMillis(a.data.raceStartAt) - toMillis(b.data.raceStartAt))
}

/**
 * Décision de l'étape A à partir de la réponse sessions.
 * @returns {{action:'write', startDate: Date, sessionKey: number} | {action:'skip', reason: string}}
 */
function decideStepA(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { action: 'skip', reason: 'aucune session "Qualifying" trouvée' }
  }
  if (sessions.length > 1) {
    const detail = sessions
      .map((s) => `session_key=${s.session_key} date_start=${s.date_start ?? 'inconnue'}`)
      .join(' | ')
    return { action: 'skip', reason: `${sessions.length} sessions "Qualifying" (ambiguïté, aucune ne sera devinée) : ${detail}` }
  }
  const [session] = sessions
  const startDate = new Date(session.date_start)
  if (Number.isNaN(startDate.getTime())) {
    return { action: 'skip', reason: `date_start illisible : ${JSON.stringify(session.date_start)}` }
  }
  return { action: 'write', startDate, sessionKey: session.session_key }
}

/**
 * Décision de l'étape B à partir des messages race_control. Prend le plus
 * ancien message "SESSION STARTED" (Q1 ; Q2/Q3/reprises sont ignorés), puis
 * le valide : antérieur à (programmé - 2 h) ou postérieur/égal à raceStartAt
 * => rejeté (jamais de repli sur un message suivant, qui serait Q2/Q3).
 * @returns {{action:'write', startDate: Date} | {action:'skip', level:'info'|'warn', reason: string}}
 */
function decideStepB(messages, scheduledMs, raceStartMs) {
  if (!Array.isArray(messages)) {
    return { action: 'skip', level: 'info', reason: 'réponse race_control inexploitable' }
  }
  const started = messages
    .filter((m) => (m.category == null || m.category === 'SessionStatus')
      && typeof m.message === 'string'
      && m.message.trim().toUpperCase() === 'SESSION STARTED'
      && !Number.isNaN(new Date(m.date).getTime()))
    .map((m) => new Date(m.date))
    .sort((a, b) => a - b)
  if (started.length === 0) {
    return { action: 'skip', level: 'info', reason: 'aucun message "SESSION STARTED" pour le moment' }
  }
  const startDate = started[0]
  const startMs = startDate.getTime()
  if (startMs < scheduledMs - EARLY_TOLERANCE_MS) {
    return {
      action: 'skip',
      level: 'warn',
      reason: `"SESSION STARTED" (${startDate.toISOString()}) antérieur de plus de 2 h à l'horaire programmé (${new Date(scheduledMs).toISOString()}) : ignoré`,
    }
  }
  if (!Number.isNaN(raceStartMs) && startMs >= raceStartMs) {
    return {
      action: 'skip',
      level: 'warn',
      reason: `"SESSION STARTED" (${startDate.toISOString()}) postérieur ou égal au départ de la course (${new Date(raceStartMs).toISOString()}) : ignoré`,
    }
  }
  return { action: 'write', startDate }
}

/**
 * Traite une course : étapes A puis B si leurs conditions sont remplies.
 * Retourne la liste des écritures effectuées (ou planifiées en dryRun).
 *
 * ctx = {
 *   nowMs, fetchJson(url)->{status,ok,data}, resolveMeetingKey(raceData)->Promise<number>,
 *   readFresh(ref)->Promise<object|null>, write(ref, fields)->Promise,
 *   toTimestamp(Date)->any, budget, log:{info,warn,debug}, dryRun?: boolean
 * }
 */
async function processRace(ctx, { ref, data: initialData }) {
  const { nowMs, fetchJson, budget, log } = ctx
  const label = `${initialData.name} (id=${initialData.id})`
  const writes = []

  // En dryRun rien n'est écrit : les écritures simulées sont superposées aux
  // relectures pour que l'étape B voie le résultat de l'étape A, comme en vrai.
  let pending = {}
  const readFresh = async () => {
    const fresh = await ctx.readFresh(ref)
    return fresh && ctx.dryRun ? { ...fresh, ...pending } : fresh
  }

  // Relecture initiale : l'instantané du passage peut avoir quelques secondes
  // (et la logique qualifs existante a pu écrire meeting_key entre-temps).
  let state = await readFresh()
  if (!state) {
    log.warn(`[qualifyingStart] ${label} : document introuvable à la relecture, ignorée.`)
    return writes
  }

  const apply = async (fields, why) => {
    if (ctx.dryRun) pending = { ...pending, ...fields }
    else await ctx.write(ref, fields)
    state = { ...state, ...fields }
    writes.push({ raceId: initialData.id, name: initialData.name, fields, why })
  }

  let sessionKey = null

  // ── ÉTAPE A ────────────────────────────────────────────────────────────
  const source = state.qualifyingStartSource
  if (source === 'manual' || source === 'actual') {
    log.debug(`[qualifyingStart] ${label} : source "${source}", rien à faire (aucun appel OpenF1).`)
  }
  if (state.qualifyingStartAt == null && source !== 'manual' && source !== 'actual') {
    let meetingKey = state.meeting_key
    if (!meetingKey) {
      if (!(await budget.take())) { log.info(`[qualifyingStart] ${label} : budget d'appels OpenF1 épuisé pour ce passage (résolution du meeting).`); return writes }
      meetingKey = await ctx.resolveMeetingKey(state)
    }
    if (!(await budget.take())) { log.info(`[qualifyingStart] ${label} : budget d'appels OpenF1 épuisé pour ce passage (sessions).`); return writes }
    const res = await fetchJson(`${OPENF1_BASE}/sessions?meeting_key=${meetingKey}&session_name=Qualifying`)

    // OpenF1 répond 404 quand un filtre ne trouve rien : équivalent à 0 session.
    const sessions = res.ok ? res.data : (res.status === 404 ? [] : null)
    if (sessions === null) {
      log.warn(`[qualifyingStart] ${label} : sessions HTTP ${res.status}, aucune écriture (nouvel essai au passage suivant).`)
      return writes
    }
    const decision = decideStepA(sessions)
    if (decision.action === 'skip') {
      log.warn(`[qualifyingStart] ${label} : ${decision.reason} — aucune écriture.`)
      return writes
    }

    // Relecture juste avant d'écrire : ne jamais écraser une valeur posée entre-temps.
    const fresh = await readFresh()
    if (!fresh || fresh.qualifyingStartAt != null || fresh.qualifyingStartSource === 'manual' || fresh.qualifyingStartSource === 'actual') {
      log.info(`[qualifyingStart] ${label} : qualifyingStartAt déjà renseigné à la relecture, rien écrit.`)
      return writes
    }
    state = fresh
    const ts = ctx.toTimestamp(decision.startDate)
    await apply(
      { qualifyingStartAt: ts, qualifyingScheduledStartAt: ts, qualifyingStartSource: 'scheduled' },
      `étape A : horaire programmé ${decision.startDate.toISOString()}`
    )
    sessionKey = decision.sessionKey
  }

  // ── ÉTAPE B ────────────────────────────────────────────────────────────
  if (state.qualifyingStartSource === 'scheduled' && state.qualifyingStartAt != null) {
    const scheduledMs = toMillis(state.qualifyingScheduledStartAt ?? state.qualifyingStartAt)
    if (Number.isNaN(scheduledMs)) {
      log.warn(`[qualifyingStart] ${label} : horaire programmé illisible, étape B ignorée.`)
      return writes
    }
    if (nowMs < scheduledMs + ACTUAL_CHECK_DELAY_MS) {
      log.debug(`[qualifyingStart] ${label} : trop tôt pour l'heure réelle (programmé ${new Date(scheduledMs).toISOString()} + 90 min).`)
      return writes
    }

    if (sessionKey == null) {
      let meetingKey = state.meeting_key
      if (!meetingKey) {
        if (!(await budget.take())) { log.info(`[qualifyingStart] ${label} : budget d'appels OpenF1 épuisé pour ce passage (résolution du meeting).`); return writes }
        meetingKey = await ctx.resolveMeetingKey(state)
      }
      if (!(await budget.take())) { log.info(`[qualifyingStart] ${label} : budget d'appels OpenF1 épuisé pour ce passage (sessions, étape B).`); return writes }
      const sres = await fetchJson(`${OPENF1_BASE}/sessions?meeting_key=${meetingKey}&session_name=Qualifying`)
      const sessions = sres.ok ? sres.data : (sres.status === 404 ? [] : null)
      if (sessions === null) {
        log.warn(`[qualifyingStart] ${label} : sessions HTTP ${sres.status} (étape B), nouvel essai au passage suivant.`)
        return writes
      }
      const d = decideStepA(sessions)
      if (d.action === 'skip') {
        log.warn(`[qualifyingStart] ${label} : ${d.reason} (étape B) — aucune écriture.`)
        return writes
      }
      sessionKey = d.sessionKey
    }

    if (!(await budget.take())) { log.info(`[qualifyingStart] ${label} : budget d'appels OpenF1 épuisé pour ce passage (race_control).`); return writes }
    const rc = await fetchJson(`${OPENF1_BASE}/race_control?session_key=${sessionKey}`)
    if (rc.status === 401 || rc.status === 404) {
      log.info(`[qualifyingStart] ${label} : race_control HTTP ${rc.status} (normal pendant/juste après la séance), nouvel essai au passage suivant.`)
      return writes
    }
    if (!rc.ok) {
      log.warn(`[qualifyingStart] ${label} : race_control HTTP ${rc.status}, nouvel essai au passage suivant.`)
      return writes
    }

    const decision = decideStepB(rc.data, scheduledMs, toMillis(state.raceStartAt))
    if (decision.action === 'skip') {
      log[decision.level](`[qualifyingStart] ${label} : ${decision.reason}.`)
      return writes
    }

    // Relecture juste avant d'écrire : seule la source 'scheduled' peut passer
    // à 'actual' (jamais d'écrasement d'un 'manual', jamais de retour arrière).
    const fresh = await readFresh()
    if (!fresh || fresh.qualifyingStartSource !== 'scheduled') {
      log.info(`[qualifyingStart] ${label} : source passée à "${fresh?.qualifyingStartSource}" entre-temps, rien écrit.`)
      return writes
    }
    state = fresh
    const fields = {
      qualifyingStartAt: ctx.toTimestamp(decision.startDate),
      qualifyingStartSource: 'actual',
    }
    // L'horaire programmé d'origine doit survivre : on ne le (re)pose que s'il manquait.
    if (fresh.qualifyingScheduledStartAt == null) fields.qualifyingScheduledStartAt = fresh.qualifyingStartAt
    await apply(fields, `étape B : heure réelle ${decision.startDate.toISOString()}`)
  }

  return writes
}

/**
 * Point d'entrée appelé par autoFetchQualifying. Une erreur sur une course
 * est journalisée (warn, avec son id) et n'arrête pas les suivantes ; le
 * try/catch englobant côté index.js garantit en plus que rien ici ne peut
 * empêcher la logique qualifs existante.
 *
 * @param {object} opts
 * @param {any} opts.db            admin.firestore()
 * @param {Array} opts.docs        documents races (snapshot 'upcoming' déjà lu)
 * @param {object} opts.logger     firebase-functions/logger
 * @param {(d: Date) => any} opts.toTimestamp
 */
async function syncQualifyingStarts({
  db, docs, logger, toTimestamp,
  nowMs = Date.now(), fetchJson = defaultFetchJson, sleep = sleepReal, dryRun = false,
  resolveMeetingKey = (race) => defaultResolveMeetingKey(db, race),
  readFresh = async (ref) => { const snap = await ref.get(); return snap.exists ? snap.data() : null },
  write = (ref, fields) => ref.update(fields),
}) {
  const candidates = selectCandidates(docs, nowMs)
  if (candidates.length === 0) {
    logger.debug('[qualifyingStart] Aucune course candidate (upcoming, départ dans <= 7 jours ou passé).')
    return []
  }

  const ctx = {
    nowMs, fetchJson, resolveMeetingKey, readFresh, write, toTimestamp, dryRun,
    budget: createBudget({ sleep }),
    log: logger,
  }

  const allWrites = []
  for (const candidate of candidates) {
    try {
      allWrites.push(...(await processRace(ctx, candidate)))
    } catch (err) {
      logger.warn(`[qualifyingStart] Erreur pour ${candidate.data.name} (id=${candidate.data.id}) : ${err.message}`)
    }
  }
  return allWrites
}

module.exports = {
  syncQualifyingStarts,
  processRace,
  selectCandidates,
  decideStepA,
  decideStepB,
  createBudget,
  LOOKAHEAD_MS,
  LOOKBACK_MS,
  ACTUAL_CHECK_DELAY_MS,
  MAX_OPENF1_CALLS_PER_PASS,
}
