// Formats an OpenF1 `lap_duration` (raw seconds, float) as "M:SS.mmm" —
// shared between the browser app (screens/ReglagesSuperAdmin.jsx) and the
// standalone seedHistory.js script. Kept dependency-free (no Firebase
// imports) so it stays safely importable from both a Vite-bundled context
// and plain Node.
export function formatLapDuration(seconds) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}
