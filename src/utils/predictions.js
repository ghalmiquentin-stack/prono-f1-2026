// Real modification count for a prediction doc. Falls back to the legacy
// `hasChanged` boolean for documents written before modificationCount
// existed (0 or 1, matching the single-edit cap already in place).
export function getModificationCount(pred) {
  if (!pred) return 0
  if (typeof pred.modificationCount === 'number') return pred.modificationCount
  return pred.hasChanged ? 1 : 0
}
