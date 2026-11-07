import { calculateAllSeasonScores } from './scoring'

// Classement d'une ligue pour la page Classement (lecture seule : aucun calcul
// de points ici, tout vient de calculateAllSeasonScores).
//
// Pour chaque joueur, en plus des points :
//   rank    rang « sportif » : 1 + nombre de joueurs strictement meilleurs
//           (deux joueurs à égalité partagent le rang, le suivant saute)
//   tied    vrai s'il partage son total avec au moins un autre joueur
//   ahead   le joueur le plus proche strictement devant (ou null)
//   behind  le joueur le plus proche strictement derrière (ou null)
//   move    places gagnées (+) ou perdues (-) grâce au dernier GP terminé
//   last    points nets marqués au dernier GP terminé (null = pas de prono)
//
// resolveIdentity(player) renvoie { color, avatar, displayName } déjà nettoyés.

function sortAndRank(scores, resolveIdentity) {
  const decorated = scores
    .map(player => ({ ...player, ...resolveIdentity(player) }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, 'fr'))
  return decorated.map(player => ({
    ...player,
    rank: 1 + decorated.filter(other => other.total > player.total).length,
  }))
}

// `silent` : coupe le rapport console de calculateAllSeasonScores (utile quand
// plusieurs ligues sont calculées d'un coup, comme dans Mes ligues).
export function computeStandings({ players, sortedRaces, predictions, penalties, resolveIdentity, silent = false }) {
  const completed = sortedRaces.filter(r => r.status === 'completed' && r.result)
  const lastRace = completed[completed.length - 1] ?? null
  if (!players.length) return { list: [], completed, lastRace }

  const current = sortAndRank(
    calculateAllSeasonScores(players, sortedRaces, predictions, penalties, { silent }),
    resolveIdentity,
  )

  // Classement avant le dernier GP, pour les flèches ▲▼. Avec un seul GP
  // terminé, il n'y a rien à comparer : pas de flèches.
  let previousRank = null
  if (lastRace && completed.length > 1) {
    const before = sortAndRank(
      calculateAllSeasonScores(players, sortedRaces.filter(r => r.id !== lastRace.id), predictions, penalties, { silent }),
      resolveIdentity,
    )
    previousRank = new Map(before.map(p => [p.id, p.rank]))
  }

  const list = current.map((player, index) => {
    const ahead = [...current.slice(0, index)].reverse().find(other => other.total > player.total) ?? null
    const behind = current.slice(index + 1).find(other => other.total < player.total) ?? null
    const tied = current.some(other => other.id !== player.id && other.total === player.total)
    const move = previousRank ? (previousRank.get(player.id) ?? player.rank) - player.rank : 0
    const last = lastRace
      ? (player.raceScores.find(rs => rs.raceId === lastRace.id)?.net ?? null)
      : null
    return { ...player, ahead, behind, tied, move, last }
  })

  return { list, completed, lastRace }
}

// « 1 pt », « 12 pts » (singulier pour 1, valeur absolue)
export function ptsLabel(value) {
  const n = Math.abs(value)
  return `${n} ${n > 1 ? 'pts' : 'pt'}`
}

// « +11 », « −2 », « 0 » (vrai signe moins pour les points négatifs)
export function signedPoints(value) {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

// Recherche sans tenir compte des accents ni de la casse.
export function normalizeText(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
