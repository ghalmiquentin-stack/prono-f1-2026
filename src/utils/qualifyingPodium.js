const POSITIONS = ['P1', 'P2', 'P3']

/**
 * Podium des qualifications (races.qualifying) sous forme de 3 entrées
 * { pos, name, time }, ou null si P1, P2 ou P3 n'a pas de nom exploitable —
 * l'appelant n'affiche alors rien (aucun espace réservé).
 *
 * Nom et meilleur temps sont repris tels que stockés, comme dans l'onglet
 * Résultat de PredictionSheet (entry.name, entry.lap_duration). Le champ
 * `source` ('auto') n'est volontairement pas exposé : il ne sert qu'à l'admin.
 */
export function getQualifyingPodium(qualifying) {
  if (!qualifying || typeof qualifying !== 'object') return null
  const entries = []
  for (const pos of POSITIONS) {
    const entry = qualifying[pos]
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    if (!name) return null
    const time = typeof entry.lap_duration === 'string' && entry.lap_duration.trim() ? entry.lap_duration.trim() : null
    entries.push({ pos, name, time })
  }
  return entries
}
