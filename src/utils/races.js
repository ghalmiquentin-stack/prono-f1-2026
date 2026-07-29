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

// Race start time formatted for display — no explicit timeZone, so it
// resolves to whichever timezone the viewer's own browser is set to,
// instead of the fixed French local hour previously stored in `raceTime`.
// Returns null (not a fake default hour) when the race has no real
// raceTimeUTC, e.g. a cancelled GP.
export function formatRaceLocalTime(race) {
  if (!race?.raceTimeUTC) return null
  return raceStartInstant(race).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  })
}

// Display-only round number, decoupled from the technical `id` (which stays
// a stable key referenced by predictions/penalties and never changes — e.g.
// a race inserted between two rounds can get a fractional id like 17.5 so
// existing raceId references aren't disturbed). The round number shown to
// users is just this race's 1-indexed position in the id-sorted list,
// counting cancelled races too since they still occupied a round historically.
export function withRoundNumbers(sortedRaces) {
  return sortedRaces.map((race, index) => ({ ...race, round: index + 1 }))
}
