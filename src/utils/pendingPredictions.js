// Registre des envois de pronostics en cours (aucune dépendance à React ni à Firebase).
//
// Pourquoi : Firestore affiche tout de suite un pronostic écrit dans la liste locale, avant que le serveur
// l'ait reçu (copie locale « en attente »). Sans signal, un joueur voit son prono sur l'Accueil alors que
// l'envoi traîne, ou a échoué (application fermée, connexion coupée, GP déjà démarré). Ce registre garde la
// trace de chaque envoi, par ligue et par GP, jusqu'à la confirmation du serveur.
//
// Il vit au niveau de l'application entière (pas dans la feuille ni dans un écran) : les écrans sont recréés
// quand on change de ligue, et un joueur peut avoir plusieurs envois en même temps dans des ligues différentes.
//
// État d'une entrée (status) :
//   pending     envoi en cours dans cette session (le serveur n'a pas encore confirmé)
//   rejected    le serveur a refusé l'écriture (reason : 'started' = GP commencé, 'refused' = autre refus)
//   unverified  envoi qui était en cours quand l'application s'est fermée : on vérifie auprès du serveur
//   lost        vérifié : le serveur n'a jamais reçu ce pronostic
// Une entrée confirmée par le serveur est supprimée. Rien n'est écrit dans Firestore par ce module : seul le
// navigateur du joueur garde une trace (localStorage), pour pouvoir prévenir à la réouverture.

const STORAGE_KEY = 'prono_f1_pending_predictions'

// Seuils d'affichage (aucune décision de pénalité ne dépend d'eux) : au bout de 4 s on dit que la connexion
// est lente, au bout de 15 s que le prono n'est toujours pas enregistré.
export const SLOW_AFTER_MS = 4000
export const STUCK_AFTER_MS = 15000

// Une trace de GP terminé depuis plus de 2 jours n'a plus d'intérêt.
const KEEP_AFTER_RACE_MS = 2 * 24 * 60 * 60 * 1000

// Identifie cette ouverture de l'application : un envoi « pending » d'une autre ouverture est forcément
// perdu côté téléphone (le cache est en mémoire), il faut donc le vérifier auprès du serveur.
const SESSION_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const sendKey = (leagueId, raceId) => `${leagueId}_${raceId}`

// 'sending' (0 à 4 s) | 'slow' (4 à 15 s) | 'stuck' (15 s et plus)
export function levelOf(elapsedMs) {
  if (elapsedMs < SLOW_AFTER_MS) return 'sending'
  return elapsedMs < STUCK_AFTER_MS ? 'slow' : 'stuck'
}

const POSITIONS = ['P1', 'P2', 'P3']
export function samePodium(a, b) {
  if (!a || !b) return false
  return POSITIONS.every(pos => a[pos] != null && a[pos] === b[pos])
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(e => e && typeof e.key === 'string' && e.prediction) : []
  } catch {
    return []
  }
}

function writeStorage(list) {
  try {
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // stockage indisponible (navigation privée...) : le registre reste valable pour cette session
  }
}

function loadInitial() {
  const now = Date.now()
  const list = readStorage()
    .filter(e => !(Number.isFinite(e.raceStartMs) && now > e.raceStartMs + KEEP_AFTER_RACE_MS))
    .map(e => (e.status === 'pending' && e.sessionId !== SESSION_ID ? { ...e, status: 'unverified' } : e))
  writeStorage(list)
  return list
}

let entries = loadInitial()
let openRequest = null
const listeners = new Set()

function commit(next) {
  entries = next
  writeStorage(entries)
  listeners.forEach(fn => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const getEntries = () => entries
export const getOpenRequest = () => openRequest

// Début d'un envoi. `entry` : { uid, leagueId, playerId, raceId, raceStartMs, prediction, isModification, startedAt }.
// Remplace toute trace précédente (refusée ou perdue) pour la même ligue et le même GP.
export function startSend(entry) {
  const key = sendKey(entry.leagueId, entry.raceId)
  commit([
    ...entries.filter(e => e.key !== key),
    { ...entry, key, status: 'pending', sessionId: SESSION_ID },
  ])
  return key
}

// Le serveur a confirmé : l'entrée disparaît (seulement si c'est bien CET envoi, pas un envoi plus récent).
export function markDelivered(key, startedAt) {
  if (!entries.some(e => e.key === key && e.startedAt === startedAt)) return
  commit(entries.filter(e => !(e.key === key && e.startedAt === startedAt)))
}

export function markRejected(key, startedAt, reason) {
  if (!entries.some(e => e.key === key && e.startedAt === startedAt)) return
  commit(entries.map(e => (e.key === key && e.startedAt === startedAt ? { ...e, status: 'rejected', reason } : e)))
}

export function dismissEntries(keys) {
  if (!entries.some(e => keys.includes(e.key))) return
  commit(entries.filter(e => !keys.includes(e.key)))
}

// À la réouverture : pour chaque envoi qui était en cours quand l'application s'est fermée, demande au serveur
// ce qu'il a reçu. `fetchPrediction(playerId, raceId)` renvoie le podium enregistré, ou null s'il n'y en a pas,
// et lève une erreur si le serveur est injoignable (on réessaiera plus tard : rien n'est annoncé à tort).
export async function reconcileUnverified({ uid, fetchPrediction }) {
  const todo = entries.filter(e => e.status === 'unverified' && e.uid === uid)
  for (const entry of todo) {
    let server
    try {
      server = await fetchPrediction(entry.playerId, entry.raceId)
    } catch {
      continue
    }
    const stillThere = entries.some(e => e.key === entry.key && e.startedAt === entry.startedAt && e.status === 'unverified')
    if (!stillThere) continue
    if (samePodium(server, entry.prediction)) {
      commit(entries.filter(e => !(e.key === entry.key && e.startedAt === entry.startedAt)))
    } else {
      commit(entries.map(e => (e.key === entry.key && e.startedAt === entry.startedAt ? { ...e, status: 'lost' } : e)))
    }
  }
}

// « Refaire » : demande à l'Accueil d'ouvrir la feuille de ce GP dans cette ligue.
export function requestOpenSheet(leagueId, raceId) {
  openRequest = { leagueId, raceId }
  listeners.forEach(fn => fn())
}
export function clearOpenRequest() {
  if (!openRequest) return
  openRequest = null
  listeners.forEach(fn => fn())
}
