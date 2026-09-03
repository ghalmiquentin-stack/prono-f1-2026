const { RACE_COUNTRY_MAP } = require('./raceCountryMap')

/**
 * Résout le meeting_key OpenF1 d'une course, en le mettant en cache sur le
 * document races/{id} après la première résolution — même algorithme que
 * resolveMeetingKey() (src/utils/openf1.js), porté sur le SDK admin :
 * `db` (admin.firestore()) remplace l'écriture cliente upsertDoc(), et
 * l'écriture reste ciblée sur le seul champ meeting_key via .update()
 * (jamais un .set()/merge du document complet — cf. la mise en garde sur
 * saveResult() dans index.js).
 */
async function resolveMeetingKey(db, race) {
  if (race.meeting_key) return race.meeting_key

  const countryName = RACE_COUNTRY_MAP[race.name]
  if (!countryName) throw new Error(`Pays non mappé : "${race.name}"`)

  const res = await fetch(
    `https://api.openf1.org/v1/meetings?year=${new Date().getFullYear()}&country_name=${encodeURIComponent(countryName)}`
  )
  if (!res.ok) throw new Error(`OpenF1 error ${res.status} (meetings)`)
  const meetings = await res.json()
  if (!meetings.length) throw new Error(`Aucune réunion OpenF1 pour ${race.name}`)

  // Some countries host more than one 2026 race (e.g. Spain: Barcelona AND
  // Madrid). Disambiguate using the race's own `city`, which already exists
  // on every race document — falls back to the first match otherwise, so
  // this is a no-op for the (common) single-meeting case.
  const meeting =
    meetings.find(m => m.location?.toLowerCase() === race.city?.toLowerCase()) ?? meetings[0]

  const meetingKey = meeting.meeting_key
  await db.collection('races').doc(String(race.id)).update({ meeting_key: meetingKey })
  return meetingKey
}

/**
 * Récupère le top 3 d'une course depuis OpenF1 — même algorithme que
 * fetchResultFromOpenF1() (src/screens/ReglagesSuperAdmin.jsx), avec deux
 * différences imposées par l'environnement Cloud Functions :
 *   - fetch() natif (déjà portable, inchangé).
 *   - la résolution driver_number → nom d'affichage lit la collection
 *     Firestore `drivers` via le SDK admin (db.collection('drivers').get()),
 *     au lieu du state React `drivers` du composant.
 *
 * Fonction pure : ne prend que `db` (une instance admin.firestore()) et
 * `race` (les données d'un document races/{id}) en argument — aucune
 * initialisation Firebase ici, aucune dépendance à l'appelant.
 *
 * Distinction retour null / erreur levée :
 *   - Pays non mappé, aucune réunion OpenF1, ou aucune session "Race"
 *     trouvée : ce sont des problèmes de configuration/mapping qui ne se
 *     résolvent pas en attendant (le calendrier des réunions/sessions est
 *     connu bien avant le jour de course) — traités comme de vraies erreurs,
 *     levées pour être logguées distinctement.
 *   - Moins de 3 positions confirmées dans session_result : la
 *     classification officielle peut mettre du temps à être publiée après
 *     un GP (enquêtes commissaires, etc.) — ce n'est pas une erreur, la
 *     fonction retourne null pour que l'appelant retente simplement au
 *     prochain passage planifié.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} race - données du document races/{id} (id, name, city, meeting_key...)
 * @returns {Promise<{P1: string, P2: string, P3: string} | null>}
 */
async function fetchRaceResult(db, race) {
  const meetingKey = await resolveMeetingKey(db, race)

  const sessionsRes = await fetch(
    `https://api.openf1.org/v1/sessions?meeting_key=${meetingKey}&session_name=Race`
  )
  if (!sessionsRes.ok) throw new Error(`OpenF1 error ${sessionsRes.status} (sessions)`)
  const sessions = await sessionsRes.json()
  if (!sessions.length) throw new Error(`Session "Race" introuvable pour meeting_key=${meetingKey}`)
  const sessionKey = sessions[0].session_key

  const resultRes = await fetch(
    `https://api.openf1.org/v1/session_result?session_key=${sessionKey}`
  )
  if (!resultRes.ok) throw new Error(`OpenF1 error ${resultRes.status} (session_result)`)
  const allResults = await resultRes.json()
  const top3 = allResults
    .filter(r => r.position >= 1 && r.position <= 3)
    .sort((a, b) => a.position - b.position)

  if (top3.length < 3) {
    return null
  }

  const driversSnap = await db.collection('drivers').get()
  const resolve = (num) => {
    const driverDoc = driversSnap.docs.find(d =>
      d.data().driver_number === num || String(d.id) === String(num)
    )
    const data = driverDoc?.data()
    return data?.display_name ?? data?.name_acronym ?? String(num)
  }

  return {
    P1: resolve(top3.find(r => r.position === 1)?.driver_number),
    P2: resolve(top3.find(r => r.position === 2)?.driver_number),
    P3: resolve(top3.find(r => r.position === 3)?.driver_number),
  }
}

module.exports = { fetchRaceResult }
