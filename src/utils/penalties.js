// Real amount for one penalty doc. Falls back to the legacy hardcoded
// values (10 for late submission, 5 for podium modification) for documents
// written before `amount` was stored per-penalty.
export function getPenaltyAmount(pen) {
  if (typeof pen?.amount === 'number') return pen.amount
  return pen?.type === 'late' ? 10 : 5
}

// Combines a player's penalties for one race into a single display-ready
// summary — shared by every "N modif. · -X pts" style indicator (Accueil,
// PredictionSheet, admin Réglages) so a manually-added late ('après les
// qualifs') penalty isn't silently dropped just because it isn't a 'change'
// penalty. When both types are present, `label` spells out the per-type
// breakdown inline — this is a touch-only app, so the detail can't live in
// a hover-only title/tooltip.
export function summarizePenalties(penalties, playerId, raceId) {
  const relevant = penalties.filter(p => p.playerId === playerId && p.raceId === raceId)
  const changes = relevant.filter(p => p.type === 'change')
  const lates = relevant.filter(p => p.type === 'late')
  const changeTotal = changes.reduce((s, p) => s + getPenaltyAmount(p), 0)
  const lateTotal = lates.reduce((s, p) => s + getPenaltyAmount(p), 0)
  const total = changeTotal + lateTotal

  let label = ''
  if (changes.length > 0 && lates.length > 0) {
    label = `${changes.length} modif. (-${changeTotal}) + tardif (-${lateTotal}) · -${total} pts`
  } else if (lates.length > 0) {
    label = `Pénalité${lates.length > 1 ? 's' : ''} tardive${lates.length > 1 ? 's' : ''} · -${total} pts`
  } else if (changes.length > 0) {
    label = `${changes.length} modif.${total > 0 ? ` · -${total} pts` : ''}`
  }

  return { changeCount: changes.length, lateCount: lates.length, changeTotal, lateTotal, total, label }
}
