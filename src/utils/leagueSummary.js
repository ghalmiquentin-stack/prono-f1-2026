// Résumé d'une ligue pour l'écran Mes ligues (lecture seule : aucun calcul de
// points ici, tout vient de computeStandings).

import { ptsLabel } from './standings'

// Écart de points entre le joueur et la tête de sa ligue.
//   négatif : retard sur le 1er (le joueur n'est pas premier) ;
//   positif : avance sur le joueur juste derrière (le joueur est seul premier) ;
//   0       : ex æquo en tête ;
//   null    : pas d'écart à montrer (joueur absent du classement, ou seul dans la ligue).
// `list` = classement trié par points décroissants (computeStandings).
export function gapFromStandings(list, mineId) {
  const mine = list.find(p => p.id === mineId)
  if (!mine || list.length < 2) return null
  if (mine.rank > 1) return mine.total - list[0].total
  const nextBest = list.find(p => p.id !== mine.id)
  return mine.total - nextBest.total
}

export function gapLabel(gap) {
  if (gap === null || gap === undefined) return null
  if (gap === 0) return 'Ex æquo'
  return gap < 0 ? `${ptsLabel(gap)} derrière le 1er` : `${ptsLabel(gap)} d'avance sur le 2e`
}

// État du pronostic du prochain GP, comme le point d'état de l'Accueil :
//   null     pas de GP à venir (inter-saison) : rien à montrer ;
//   'done'   pronostic soumis ;
//   'closed' pas de prono et la course a démarré ;
//   'missing' pas encore de prono, la course n'a pas démarré.
export function pronoState({ nextRace, started, hasPrediction }) {
  if (!nextRace) return null
  if (hasPrediction) return 'done'
  return started ? 'closed' : 'missing'
}

export const PRONO_TEXT = {
  done: 'Pronostic soumis',
  missing: 'Pas encore de prono',
  closed: 'Pas de prono',
}
