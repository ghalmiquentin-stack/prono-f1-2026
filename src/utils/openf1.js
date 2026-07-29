import { upsertDoc } from '../hooks/useFirestore'

// OpenF1 doesn't expose a "country → this season's meeting" lookup keyed by
// our own race names, so we maintain this mapping ourselves. Keys must match
// the exact `name` field stored on the race document.
export const RACE_COUNTRY_MAP = {
  'Australie': 'Australia', 'Chine': 'China', 'Japon': 'Japan',
  'Bahreïn': 'Bahrain', 'Arabie Saoudite': 'Saudi Arabia',
  'Miami': 'United States', 'Émilie-Romagne': 'Italy', 'Monaco': 'Monaco',
  'Canada': 'Canada', 'Espagne': 'Spain', 'Barcelone-Catalunya': 'Spain',
  'Espagne (Madrid)': 'Spain', 'Autriche': 'Austria',
  'Grande-Bretagne': 'United Kingdom', 'Belgique': 'Belgium',
  'Hongrie': 'Hungary', 'Pays-Bas': 'Netherlands', 'Italie': 'Italy',
  'Azerbaïdjan': 'Azerbaijan', 'Singapour': 'Singapore',
  // Bahrain GP relocated to Sepang/Kuala Lumpur — OpenF1 still lists it under
  // country_name 'Bahrain' (the official race branding), not 'Malaysia'.
  'Bahreïn (Sepang)': 'Bahrain',
  'États-Unis': 'United States', 'Mexique': 'Mexico', 'Brésil': 'Brazil',
  'Las Vegas': 'United States', 'Qatar': 'Qatar', 'Abu Dhabi': 'United Arab Emirates',
}

/**
 * Resolves a race's OpenF1 meeting_key, caching it on the race document
 * (`meeting_key`) so it's only ever looked up once — shared by both the
 * admin race-result fetch (ReglagesSuperAdmin) and the qualifying fetch
 * (PredictionSheet), instead of each duplicating the same country-map +
 * /v1/meetings lookup independently.
 */
export async function resolveMeetingKey(race) {
  if (race.meeting_key) return race.meeting_key

  const countryName = RACE_COUNTRY_MAP[race.name]
  if (!countryName) throw new Error(`Pays non mappé : "${race.name}"`)

  const res = await fetch(
    `https://api.openf1.org/v1/meetings?year=2026&country_name=${encodeURIComponent(countryName)}`
  )
  const meetings = await res.json()
  if (!meetings.length) throw new Error(`Aucune réunion OpenF1 pour ${race.name}`)

  // Some countries host more than one 2026 race (e.g. Spain: Barcelona AND
  // Madrid). Disambiguate using the race's own `city`, which already exists
  // on every race document — falls back to the first match otherwise, so
  // this is a no-op for the (common) single-meeting case.
  const meeting =
    meetings.find(m => m.location?.toLowerCase() === race.city?.toLowerCase()) ?? meetings[0]

  const meetingKey = meeting.meeting_key
  await upsertDoc('races', String(race.id), { meeting_key: meetingKey })
  return meetingKey
}
