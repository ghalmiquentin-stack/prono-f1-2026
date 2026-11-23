// Interventions d'un admin sur un pronostic : saisie (le joueur n'a pas de prono) ou correction.
//
// Transparence : chaque intervention est écrite en UN SEUL lot atomique avec
//   - le pronostic, qui porte `adminEntry` (qui, quand, motif, podium posé, choix de pénalité) : c'est ce qui
//     permet d'afficher le badge « Admin » sans lecture supplémentaire ;
//   - une entrée du journal `adminLog` (ajout seul, visible par toute la ligue) ;
//   - éventuellement une pénalité manuelle, si l'admin a choisi de l'appliquer.
// Les règles Firestore (firestore.rules, adminWriteLogged) REFUSENT l'écriture d'un admin sur le pronostic d'un
// autre joueur sans cette entrée de journal dans le même lot, et les fonctions serveur ne posent alors aucune
// pénalité automatique : la seule pénalité est celle que l'admin a choisie.

import { calculateAllSeasonScores } from './scoring'

const POSITIONS = ['P1', 'P2', 'P3']

export const podiumOf = (p) => ({ P1: p?.P1 ?? null, P2: p?.P2 ?? null, P3: p?.P3 ?? null })
export const samePodium = (a, b) => !!a && !!b && POSITIONS.every(pos => a[pos] != null && a[pos] === b[pos])

// L'intervention d'un admin encore « en vigueur » sur un pronostic, ou null. Le badge ne s'affiche que tant que
// le podium actuel est celui posé par l'admin : si le joueur le modifie ensuite, c'est de nouveau son pronostic
// (le journal garde l'historique).
export function adminEntryOf(pred) {
  const entry = pred?.adminEntry
  if (!entry?.podium || !pred?.prediction) return null
  return samePodium(entry.podium, pred.prediction) ? entry : null
}

const toMs = (v) => {
  if (v == null) return NaN
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  const t = Date.parse(v)
  return Number.isNaN(t) ? NaN : t
}

// Quelle pénalité s'appliquerait « comme pour tout le monde » à cette intervention ?
//   saisie (le joueur n'avait pas de prono)  -> pénalité de retard (postQualifsPenalty)
//   correction                               -> pénalité de modification (modificationPenalty)
// Elle n'existe que si les qualifs ont commencé (ou si leur heure est inconnue : l'admin juge), si la règle de
// la ligue est active et son montant strictement positif (mêmes critères que le serveur, voir decide()).
export function penaltyOptionFor({ league, race, isEdit, now = Date.now() }) {
  const type = isEdit ? 'change' : 'late'
  const rule = type === 'late' ? league?.rules?.postQualifsPenalty : league?.rules?.modificationPenalty
  const amount = typeof rule?.amount === 'number' && rule.amount > 0 ? rule.amount : 0
  const enabled = rule?.enabled === true && amount > 0
  const qMs = toMs(race?.qualifyingStartAt)
  const qualifsStarted = Number.isNaN(qMs) ? null : now >= qMs
  return { type, amount, enabled, qualifsStarted, applicable: enabled && qualifsStarted !== false }
}

// Construit les trois documents du lot (pur : l'horodatage serveur est injecté, ce qui permet de tester).
export function buildAdminIntervention({
  leagueId, race, player, existing, picks, motif, penaltyChoice, penalty, admin, logId, stamp,
}) {
  const isEdit = !!existing
  const podium = podiumOf(picks)
  const kind = isEdit ? 'prediction-edit' : 'prediction-create'
  const predictionId = `${player.id}_${race.id}`
  const applied = penaltyChoice === 'applied'
  const penaltyType = penaltyChoice === 'none' ? null : penalty.type
  const penaltyAmount = applied ? penalty.amount : 0

  const log = {
    leagueId, predictionId, raceId: race.id, playerId: player.id, playerName: player.name,
    kind, byUid: admin.uid, byName: admin.name, at: stamp(), motif,
    before: isEdit ? podiumOf(existing.prediction) : null,
    after: podium,
    penaltyChoice, penaltyType, penaltyAmount,
  }
  const adminEntry = { logId, at: stamp(), by: admin.uid, byName: admin.name, kind, motif, podium, penaltyChoice }

  // Saisie : un pronostic complet. Correction : seuls le podium et la trace changent ; le compteur de
  // modifications du joueur n'est PAS touché (une correction d'admin n'est pas une modification du joueur).
  const prediction = isEdit
    ? { data: { leagueId, prediction: podium, updatedAt: stamp(), adminEntry }, merge: true }
    : {
      data: {
        playerId: player.id, raceId: race.id, leagueId, prediction: podium, initialPrediction: podium,
        modificationCount: 0, submittedAt: stamp(), manualUnlockOverride: false, updatedAt: stamp(), adminEntry,
      },
      merge: false,
    }

  const penaltyDoc = applied
    ? {
      id: `pen_${penalty.type}_${player.id}_${race.id}_${Date.now()}`,
      data: {
        playerId: player.id, raceId: race.id, type: penalty.type, leagueId, amount: penalty.amount,
        createdAt: stamp(), addedBy: admin.uid, motif, adminLogId: logId,
      },
    }
    : null

  return { predictionId, prediction, log, penaltyDoc }
}

// Pénalité posée à la main par un admin : la pénalité ET son entrée de journal, dans le même lot. L'identifiant
// du journal est déterministe (`add_` + id de la pénalité) : les règles Firestore lient ainsi un journal à UNE
// seule pénalité.
export function buildPenaltyAddition({ leagueId, race, player, type, amount, motif, admin, stamp, now = Date.now() }) {
  const penaltyId = `pen_${type}_${player.id}_${race.id}_${now}`
  const logId = `add_${penaltyId}`
  return {
    penaltyId, logId,
    penalty: {
      playerId: player.id, raceId: race.id, type, leagueId, amount,
      createdAt: stamp(), addedBy: admin.uid, motif, adminLogId: logId,
    },
    log: {
      leagueId, kind: 'penalty-add', raceId: race.id, playerId: player.id, playerName: player.name,
      byUid: admin.uid, byName: admin.name, at: stamp(), motif,
      penaltyId, penaltyType: type, penaltyAmount: amount,
    },
  }
}

// Retrait d'une pénalité par un admin (automatique ou posée à la main) : suppression de la pénalité ET entrée de
// journal (`rm_` + id de la pénalité) dans le même lot. Le montant et le type sont recopiés dans le journal : la
// pénalité supprimée n'existe plus, le journal est la seule trace.
export function buildPenaltyRemoval({ leagueId, pen, player, motif, admin, stamp }) {
  const penaltyId = pen._id ?? pen.id
  const amount = typeof pen.amount === 'number' ? pen.amount : (pen.type === 'late' ? 10 : 5)
  return {
    penaltyId, logId: `rm_${penaltyId}`,
    log: {
      leagueId: pen.leagueId ?? leagueId, kind: 'penalty-remove', raceId: pen.raceId, playerId: pen.playerId,
      playerName: player.name, byUid: admin.uid, byName: admin.name, at: stamp(), motif,
      penaltyId, penaltyType: pen.type, penaltyAmount: amount, penaltySource: pen.source === 'auto' ? 'auto' : 'admin',
    },
  }
}

// Effet de l'intervention sur le classement de la ligue (GP terminé seulement) : total et rang du joueur avant et
// après. Même calcul que la page Classement (calculateAllSeasonScores), sur une copie des données : rien n'est écrit.
export function projectImpact({ players, races, predictions, penalties, playerId, race, picks, penalty }) {
  if (race?.status !== 'completed' || !race?.result) return null
  try {
    const sortedRaces = [...races].sort((a, b) => a.id - b.id)
    const rank = (list, id) => {
      const me = list.find(p => p.id === id)
      return me ? 1 + list.filter(p => p.total > me.total).length : null
    }
    const run = (preds, pens) => {
      const list = calculateAllSeasonScores(players.map(p => ({ id: p.id })), sortedRaces, preds, pens, { silent: true })
      const me = list.find(p => p.id === playerId)
      return { total: me?.total ?? 0, rank: rank(list, playerId) }
    }
    const before = run(predictions, penalties)
    const others = predictions.filter(p => !(p.playerId === playerId && p.raceId === race.id))
    const preds = [...others, { playerId, raceId: race.id, prediction: podiumOf(picks) }]
    const pens = penalty ? [...penalties, { playerId, raceId: race.id, type: penalty.type, amount: penalty.amount }] : penalties
    return { before, after: run(preds, pens) }
  } catch {
    return null
  }
}
