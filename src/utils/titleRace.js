import { MAX_POINTS_PER_GP, STREAK_BONUS, STREAK_LENGTH } from './statsData'

// Course au titre : où en est le joueur courant par rapport au premier, et le titre
// est-il encore ouvert ? Lecture seule, à partir de la liste de computeStatsData.
//
// Points encore marquables par un joueur = le maximum d'un GP × les GP restants, plus le
// bonus série qu'il peut encore atteindre (selon sa série de GP gagnés en cours).
// Le titre est acquis quand le total du premier dépasse STRICTEMENT le total + le marquable
// de chacun des autres joueurs, même si le premier ne marque plus rien.
//
// Renvoie null s'il n'y a rien à montrer (un seul joueur, ou plus aucun GP à venir).
// Scénarios (clé `scenario`) :
//   leaderOpen      je suis premier, le titre n'est pas encore acquis
//   leaderDecided   je suis premier et champion avant la fin
//   chaserOpen      je suis derrière le premier mais je peux encore le rattraper
//   out             trop loin du premier, mais le titre reste ouvert pour d'autres joueurs
//   chaserDecided   un autre joueur est champion avant la fin
//   tie             à égalité de points avec le premier (ou le deuxième si je suis premier)

export function computeTitleRace({ list, me, remaining }) {
  if (list.length < 2 || remaining <= 0) return null

  const leader = list[0]
  const isLeader = me.id === leader.id
  const bonusCount = p => Math.floor(((p.winStreak % STREAK_LENGTH) + remaining) / STREAK_LENGTH)
  const pot = p => remaining * MAX_POINTS_PER_GP + bonusCount(p) * STREAK_BONUS
  const maxFinal = p => p.total + pot(p)

  const threat = list
    .filter(p => p.id !== leader.id)
    .sort((a, b) => maxFinal(b) - maxFinal(a))[0]
  const decided = leader.total > maxFinal(threat)
  const rival = isLeader ? list[1] : leader
  const gap = Math.abs(rival.total - me.total)
  const out = !isLeader && maxFinal(me) < leader.total
  const relevant = isLeader ? threat : me

  let scenario
  if (decided) scenario = isLeader ? 'leaderDecided' : 'chaserDecided'
  else if (gap === 0) scenario = 'tie'
  else if (out) scenario = 'out'
  else scenario = isLeader ? 'leaderOpen' : 'chaserOpen'

  return {
    scenario,
    remaining,
    leader,
    isLeader,
    rival,
    threat,
    relevant,
    gap,
    decided,
    pot,
    potRelevant: pot(relevant),
    bonusRelevant: bonusCount(relevant),
    // Points de plus par GP qu'il faut faire que le premier pour le rattraper.
    perGp: Math.ceil(gap / remaining),
    // Avance du premier sur le joueur le plus menaçant.
    leadOverThreat: leader.total - threat.total,
    // Avance qui manque encore au premier pour que le titre soit acquis.
    leadMissing: maxFinal(threat) - leader.total + 1,
  }
}
