// The scheduled start instant of a race, from its date + raceTimeUTC
// (falls back to 12:00 UTC if raceTimeUTC is missing) — same computation
// already used to drive the countdown across the app.
export function raceStartInstant(race) {
  return new Date(`${race.date}T${race.raceTimeUTC ?? '12:00'}:00Z`)
}

export function hasRaceStarted(race) {
  if (!race) return false
  return Date.now() >= raceStartInstant(race).getTime()
}
