// Client-side mirror of the server's penalty model, used ONLY to warn the
// player before an action that will be penalised (banner + confirmation in
// PredictionSheet). The server stays the single source of truth: it decides
// and writes every penalty from its own clock (functions/lib/predictionShadow.js,
// decide()). Nothing here writes anything.
//
// Model: from races/{id}.qualifyingStartAt on, a first prediction is a 'late'
// penalty (rule postQualifsPenalty) and a podium change is a 'change' penalty
// (rule modificationPenalty); an update without podium change is free. The
// warning opens WARNING_MARGIN_MS before qualifyingStartAt — a warning too
// many is better than one missed.

export const QUALIFYING_WARNING_MARGIN_MS = 30 * 1000

const POSITIONS = ['P1', 'P2', 'P3']
const RULE_KEY = { late: 'postQualifsPenalty', change: 'modificationPenalty' }

const NO_PENALTY = Object.freeze({ kind: null, amount: 0 })

// Timestamp Firestore | Date | number -> milliseconds, null when the field is
// absent or unusable (same tolerance as the server's toMillis).
export function getQualifyingStartMs(race) {
  const value = race?.qualifyingStartAt
  if (value == null) return null
  try {
    const ms = typeof value.toMillis === 'function' ? value.toMillis()
      : value instanceof Date ? value.getTime()
      : typeof value === 'number' ? value
      : NaN
    return Number.isFinite(ms) ? ms : null
  } catch {
    return null
  }
}

// Instant from which the warning applies (qualifyingStartAt - 30 s), or null.
export function getQualifyingSwitchMs(race) {
  const startMs = getQualifyingStartMs(race)
  return startMs == null ? null : startMs - QUALIFYING_WARNING_MARGIN_MS
}

export function hasQualifyingSwitched(race, nowMs) {
  const switchMs = getQualifyingSwitchMs(race)
  return switchMs != null && nowMs >= switchMs
}

// Which penalty an action would cost, from the league rules alone (no clock,
// no draft): 'late' when the player has no prediction yet, 'change' otherwise.
// Same activation test as the server's decide() (enabled === true and a numeric
// amount), plus amount > 0 so "-0 pts" is never displayed.
export function getPenaltyRule(league, hasExistingPrediction) {
  const kind = hasExistingPrediction ? 'change' : 'late'
  const rule = league?.rules?.[RULE_KEY[kind]]
  if (!rule || rule.enabled !== true) return null
  if (typeof rule.amount !== 'number' || !Number.isFinite(rule.amount) || rule.amount <= 0) return null
  return { kind, amount: rule.amount }
}

// Penalty context for a click on "Valider", computed from the clock passed in
// (Date.now() at click time — never frozen when the sheet opens).
//   -> { kind: 'late' | 'change' | null, amount }
export function getPenaltyContext({ race, league, existingPrediction, draft, nowMs }) {
  if (!hasQualifyingSwitched(race, nowMs)) return NO_PENALTY
  // Same test as the "Aucune modification effectuée" check in savePrediction.
  if (existingPrediction && POSITIONS.every(pos => draft?.[pos] === existingPrediction.prediction?.[pos])) {
    return NO_PENALTY
  }
  return getPenaltyRule(league, !!existingPrediction) ?? NO_PENALTY
}

// Banner text once the switch is crossed. The text is the same whether the
// switch instant is the scheduled timetable or the real session start: since
// the server retracts penalties injected by a provisional timetable (LOT 4),
// the banner no longer has to mention it.
export function buildQualifyingBannerText({ kind, amount }) {
  return kind === 'change'
    ? `Départ des qualifications passé : modifier votre podium coûte -${amount} pts.`
    : `Départ des qualifications passé : un premier pronostic coûte -${amount} pts (pénalité tardive).`
}

export function buildPenaltyConfirm(context) {
  // Called on every render with the held context, null while closed.
  const { kind, amount } = context ?? {}
  if (kind !== 'late' && kind !== 'change') return {}
  return {
    title: 'Confirmer la pénalité ?',
    message: kind === 'change'
      ? `Vous modifiez votre podium après le départ des qualifications : pénalité de -${amount} pts. L'admin de la ligue peut l'annuler.`
      : `Vous pronostiquez après le départ des qualifications : pénalité tardive de -${amount} pts. L'admin de la ligue peut l'annuler.`,
    confirmLabel: `Confirmer (-${amount} pts)`,
  }
}
