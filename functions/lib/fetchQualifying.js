const { resolveMeetingKey } = require('./fetchRaceResult')
const { toTitle } = require('./toTitle')
const { formatLapDuration } = require('./formatLapDuration')

/**
 * Récupère la grille de qualification (top 3) d'une course depuis OpenF1 —
 * même algorithme que fetchQualifyingFromOpenF1()/buildEntry()
 * (src/screens/ReglagesSuperAdmin.jsx), avec les différences suivantes
 * imposées par l'environnement Cloud Functions et par un risque identifié :
 *   - Réutilise resolveMeetingKey (./fetchRaceResult), ne la duplique pas.
 *   - Résolution du pilote via db.collection('drivers').get() (SDK admin),
 *     avec le MÊME repli que l'existant : display_name ?? toTitle(...) —
 *     PAS de repli name_acronym ici, contrairement à fetchRaceResult.js
 *     (différence intentionnelle avec la résolution des résultats de course,
 *     à ne pas harmoniser : buildEntry() de la version manuelle actuelle ne
 *     cherche déjà que sur driver_number, jamais sur l'id du document).
 *   - Garde-fou AJOUTÉ, absent du code manuel actuel : si la requête
 *     sessions retourne plus d'un résultat pour session_name=Qualifying, on
 *     ne devine jamais laquelle prendre (risque identifié sur les 6 GP
 *     "Sprint" de la saison, où "Sprint Qualifying" et "Qualifying"
 *     peuvent coexister pour le même meeting_key) — averti via
 *     console.warn (détail session_key + date de chaque session) et
 *     retourne null plutôt que de prendre sessions[0] au hasard.
 *
 * Distinction retour null / erreur levée :
 *   - Pays non mappé ou aucune réunion OpenF1 (via resolveMeetingKey) :
 *     vraie erreur de configuration, levée (throw).
 *   - Aucune session "Qualifying" trouvée, plusieurs sessions ambiguës, ou
 *     grille de départ incomplète (une des 3 positions sans aucune entrée) :
 *     pas encore publié / cas ambigu, jamais une vraie erreur — retourne
 *     null, l'appelant (voir functions/index.js, autoFetchQualifying)
 *     retente simplement au prochain passage planifié.
 *
 * Fonction pure : ne prend que `db` (une instance admin.firestore()) et
 * `race` (les données d'un document races/{id}) en argument.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} race - données du document races/{id} (id, name, city, meeting_key...)
 * @returns {Promise<{year: number, P1: object|null, P2: object|null, P3: object|null, fetchedAt: string} | null>}
 */
async function fetchQualifying(db, race) {
  const meetingKey = await resolveMeetingKey(db, race)

  const sessRes = await fetch(
    `https://api.openf1.org/v1/sessions?meeting_key=${meetingKey}&session_name=Qualifying`
  )
  if (!sessRes.ok) throw new Error(`OpenF1 error ${sessRes.status} (sessions)`)
  const sessions = await sessRes.json()

  if (sessions.length === 0) {
    // Pas encore publiée — cas normal, pas une erreur.
    return null
  }
  if (sessions.length > 1) {
    console.warn(
      `[fetchQualifying] ${sessions.length} sessions "Qualifying" trouvées pour meeting_key=${meetingKey} ` +
      `(course ${race.name}, id=${race.id}) — ambiguïté (probable GP Sprint), aucune ne sera devinée. Détail : ` +
      sessions.map(s => `session_key=${s.session_key} date_start=${s.date_start ?? 'inconnue'}`).join(' | ')
    )
    return null
  }
  const qualSession = sessions[0]

  const gridRes = await fetch(
    `https://api.openf1.org/v1/starting_grid?session_key=${qualSession.session_key}&position<=3`
  )
  if (!gridRes.ok) throw new Error(`OpenF1 error ${gridRes.status} (starting_grid)`)
  const grid = await gridRes.json()
  grid.sort((a, b) => a.position - b.position)

  const driversSnap = await db.collection('drivers').get()
  const resolve = (num) => {
    const driverDoc = driversSnap.docs.find(d => d.data().driver_number === num)
    return driverDoc?.data()?.display_name ?? toTitle(String(num))
  }

  const buildEntry = (pos) => {
    const entry = grid.find(g => g.position === pos)
    if (!entry) return null
    return {
      name: resolve(entry.driver_number),
      lap_duration: formatLapDuration(entry.lap_duration),
    }
  }

  const P1 = buildEntry(1)
  const P2 = buildEntry(2)
  const P3 = buildEntry(3)

  // Complétude insuffisante — même principe que top3.length < 3 dans
  // fetchRaceResult.js : si une des 3 positions n'a aucune entrée de grille
  // du tout (buildEntry a retourné null), la grille n'est pas considérée
  // comme publiée/complète, plutôt que d'écrire un résultat partiel
  // automatiquement. Voir index.js (autoFetchQualifying) : c'est ce même
  // retour null qui déclenche un nouveau passage au prochain intervalle
  // planifié, sans distinction avec les autres cas "pas encore publié".
  if (!P1 || !P2 || !P3) {
    return null
  }

  return {
    year: new Date().getFullYear(),
    P1,
    P2,
    P3,
    fetchedAt: new Date().toISOString(),
  }
}

module.exports = { fetchQualifying }
