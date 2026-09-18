// Formats an OpenF1 `lap_duration` (raw seconds, float) as "M:SS.mmm" —
// shared between the browser app (screens/ReglagesSuperAdmin.jsx) and the
// standalone seedHistory.js script. Kept dependency-free (no Firebase
// imports) so it stays safely importable from both a Vite-bundled context
// and plain Node.
//
// Copie fidèle de src/utils/formatLapDuration.js pour functions/ — fichier
// déjà confirmé pur (aucune dépendance React/Firebase), copié tel quel sans
// réécriture. À garder synchronisée manuellement si l'original change.
function formatLapDuration(seconds) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

module.exports = { formatLapDuration }
