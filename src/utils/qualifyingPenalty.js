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

// "22h24" in the viewer's own timezone, to the minute.
function formatHourMinute(ms) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${h}h${m}`
}

// Banner text once the switch is crossed. When the switch instant is only the
// scheduled timetable (qualifyingStartSource 'scheduled', not yet confirmed by
// the real session start), say so; 'actual' and 'manual' need no mention.
export function buildQualifyingBannerText({ kind, amount }, race) {
  const startMs = getQualifyingStartMs(race)
  const scheduledNote = race?.qualifyingStartSource === 'scheduled' && startMs != null
    ? `d'après l'horaire prévu à ${formatHourMinute(startMs)}, il peut être ajusté`
    : null
  // The schedule note goes before the final full stop; for a late creation it
  // joins the existing parenthesis instead of opening a second one.
  if (kind === 'change') {
    return `Les qualifications ont commencé. Modifier votre podium coûte -${amount} pts${scheduledNote ? ` (${scheduledNote})` : ''}.`
  }
  return `Les qualifications ont commencé. Un premier pronostic maintenant coûte -${amount} pts (pénalité tardive${scheduledNote ? `, ${scheduledNote}` : ''}).`
}

export function buildPenaltyConfirm(context) {
  // Called on every render with the held context, null while closed.
  const { kind, amount } = context ?? {}
  if (kind !== 'late' && kind !== 'change') return {}
  return {
    title: 'Confirmer la pénalité ?',
    message: kind === 'change'
      ? `Vous modifiez votre podium après le début des qualifications : pénalité de -${amount} pts. Seul l'admin de la ligue peut l'annuler.`
      : `Vous pronostiquez après le début des qualifications : pénalité tardive de -${amount} pts. Seul l'admin de la ligue peut l'annuler.`,
    confirmLabel: `Confirmer (-${amount} pts)`,
  }
}
