// Real amount for one penalty doc. Falls back to the legacy hardcoded
// values (10 for late submission, 5 for podium modification) for documents
// written before `amount` was stored per-penalty.
export function getPenaltyAmount(pen) {
  if (typeof pen?.amount === 'number') return pen.amount
  return pen?.type === 'late' ? 10 : 5
}
