// Resolves a driver's headshot from the Firestore `drivers` collection by
// display name (last name) — shared by every screen that shows a driver
// photo (Accueil, Courses, PredictionSheet).
export function getDriverPhoto(drivers, displayName) {
  if (!displayName || !drivers?.length) return null
  return drivers.find(d => d.last_name?.toLowerCase() === displayName.toLowerCase())?.headshot_url ?? null
}
