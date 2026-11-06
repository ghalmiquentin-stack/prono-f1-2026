import {
  calculateAllSeasonScores,
  calculateRaceScore,
  POINTS_EXACT,
  POINTS_PODIUM,
  PERFECT_PODIUM_BONUS,
  STREAK_LENGTH,
  STREAK_BONUS,
} from './scoring'
import { getPenaltyAmount } from './penalties'
import { getPlayerIdentity } from './profiles'

// Données de la page Stats (lecture seule : aucun calcul de points ici, tout vient de
// calculateAllSeasonScores et calculateRaceScore).
//
// computeStatsData renvoie, pour la ligue active :
//   list        joueurs triés par total (puis pseudo), avec pour chacun :
//                 rank, total, cum (total cumulé après chaque GP terminé), net (points
//                 nets de chaque GP, null = pas de prono), wins (a eu le meilleur score
//                 du GP), winStreak (GP gagnés d'affilée), form et formRank (points sur
//                 les derniers GP et rang), place (pronostics exacts par place), drivers
//                 (pilotes pronostiqués), mods (modifications de pronostic)
//   me          le joueur courant (null s'il n'est pas dans la ligue)
//   completed   les GP terminés, upcoming les GP à venir
//   avgNet      moyenne de la ligue à chaque GP terminé
//   leagueDrivers  points par pilote pour toute la ligue

const POS = ['P1', 'P2', 'P3']

// Un GP rapporte au plus 10 par place exacte + le bonus de podium parfait.
export const MAX_POINTS_PER_GP = POS.length * POINTS_EXACT + PERFECT_PODIUM_BONUS
export { STREAK_LENGTH, STREAK_BONUS }
// Nombre de GP pris en compte pour « la forme ».
export const FORM_LENGTH = 5

const sum = list => list.reduce((s, x) => s + x, 0)

export function computeStatsData({ players, races, predictions, penalties, profiles, meId }) {
  const sortedRaces = [...races].sort((a, b) => a.id - b.id)
  const completed = sortedRaces.filter(r => r.status === 'completed' && r.result)
  const upcoming = sortedRaces.filter(r => r.status === 'upcoming')
  if (!players.length || !completed.length) return null

  // Classement après chaque GP (bonus série compris, comme partout dans l'app).
  const history = completed.map((_, k) =>
    calculateAllSeasonScores(players, completed.slice(0, k + 1), predictions, penalties, { silent: true })
  )
  const totalsAt = history.map(h => new Map(h.map(p => [p.id, p.total])))
  const final = history[history.length - 1]
  const idOrder = players.map(p => p.id).sort()

  const list = final.map(sc => {
    const ident = getPlayerIdentity(profiles, sc, idOrder.indexOf(sc.id))
    const played = sc.raceScores.filter(r => r.net !== null)
    const preds = predictions.filter(p => p.playerId === sc.id)
    const pens = penalties.filter(p => p.playerId === sc.id)

    // Pronostics exacts par place, et points rapportés par pilote.
    const place = { P1: { exact: 0, n: 0 }, P2: { exact: 0, n: 0 }, P3: { exact: 0, n: 0 } }
    const drivers = {}
    played.forEach(r => POS.forEach(pos => {
      const detail = r.details[pos]
      place[pos].n += 1
      if (detail === 'exact') place[pos].exact += 1
      const name = r.prediction?.[pos]
      if (name) {
        const o = (drivers[name] ??= { n: 0, pts: 0 })
        o.n += 1
        o.pts += detail === 'exact' ? POINTS_EXACT : detail === 'podium' ? POINTS_PODIUM : 0
      }
    }))

    // Modifications : on garde le premier podium (initialPrediction) et le podium final.
    const mods = []
    completed.forEach((race, k) => {
      const pr = preds.find(p => p.raceId === race.id)
      if (!pr || !(pr.modificationCount > 0) || !pr.initialPrediction) return
      const before = calculateRaceScore(pr.initialPrediction, race.result).total
      const after = calculateRaceScore(pr.prediction, race.result).total
      const pen = sum(pens.filter(x => x.raceId === race.id && x.type === 'change').map(getPenaltyAmount))
      mods.push({ k, before, after, delta: after - before, pen })
    })

    return {
      id: sc.id,
      name: String(ident.displayName),
      avatar: String(ident.avatar),
      color: String(ident.color),
      active: sc.active !== false,
      total: sc.total,
      cum: totalsAt.map(m => m.get(sc.id) ?? 0),
      net: sc.raceScores.map(r => r.net),
      played: played.length,
      place,
      drivers,
      mods,
    }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'))

  list.forEach(p => { p.rank = 1 + list.filter(o => o.total > p.total).length })

  // GP gagnés : meilleur score net du GP (ex æquo compris, comme pour le bonus série).
  completed.forEach((_, k) => {
    const nets = list.map(p => p.net[k]).filter(v => v !== null)
    const max = nets.length ? Math.max(...nets) : null
    list.forEach(p => {
      p.wins ??= []
      p.wins[k] = p.net[k] !== null && p.net[k] === max
    })
  })
  list.forEach(p => {
    let run = 0
    for (let k = p.wins.length - 1; k >= 0 && p.wins[k]; k--) run += 1
    p.winStreak = run
  })

  // Forme : points sur les derniers GP.
  const from = Math.max(0, completed.length - FORM_LENGTH)
  list.forEach(p => { p.form = sum(p.net.slice(from).map(v => v ?? 0)) })
  list.forEach(p => { p.formRank = 1 + list.filter(o => o.form > p.form).length })

  const avgNet = completed.map((_, k) => {
    const v = list.map(p => p.net[k]).filter(x => x !== null)
    return v.length ? sum(v) / v.length : 0
  })

  const leagueDrivers = {}
  list.forEach(p => Object.entries(p.drivers).forEach(([name, o]) => {
    const x = (leagueDrivers[name] ??= { n: 0, pts: 0 })
    x.n += o.n
    x.pts += o.pts
  }))

  return {
    list,
    me: list.find(p => p.id === meId) ?? null,
    completed,
    upcoming,
    avgNet,
    leagueDrivers,
    formFrom: from,
  }
}
