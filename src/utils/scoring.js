/**
 * Calculate the raw score for a single race prediction vs result.
 * Returns { raw, bonus, total, details, perfectPodium }
 */
export function calculateRaceScore(prediction, result) {
  if (!prediction || !result) return { raw: 0, bonus: 0, total: 0, details: {}, perfectPodium: false }

  const realPodium = [result.P1, result.P2, result.P3]
  let raw = 0
  const details = {}

  for (const pos of ['P1', 'P2', 'P3']) {
    const predicted = prediction[pos]
    if (predicted === result[pos]) {
      raw += 10
      details[pos] = 'exact'
    } else if (realPodium.includes(predicted)) {
      raw += 3
      details[pos] = 'podium'
    } else {
      details[pos] = 'miss'
    }
  }

  const perfectPodium =
    details.P1 === 'exact' && details.P2 === 'exact' && details.P3 === 'exact'
  const bonus = perfectPodium ? 5 : 0

  return { raw, bonus, total: raw + bonus, details, perfectPodium }
}

/**
 * Calculate the penalty total for an array of penalty objects.
 */
export function calculatePenalties(penalties) {
  let total = 0
  for (const p of penalties) {
    if (p.type === 'late') total += 10
    if (p.type === 'change') total += 5
  }
  return total
}

/**
 * Net score for a race (never below 0).
 */
export function netScore(rawPlusBonus, penaltyTotal) {
  return Math.max(0, rawPlusBonus - penaltyTotal)
}

/**
 * Per-player race scores without streak bonus.
 * Use calculateAllSeasonScores for correct cross-player streak bonus.
 *
 * @returns {{ total: number, raceScores: Array, streakBonus: 0 }}
 */
export function calculatePlayerSeasonScore(predictions, races, penalties) {
  const raceNetScores = []
  const raceScores = []

  for (const race of races.filter(r => r.status === 'completed')) {
    if (!race.result) continue

    const pred = predictions.find(p => p.raceId === race.id)
    const racePenalties = penalties.filter(p => p.raceId === race.id)
    const penaltyTotal = calculatePenalties(racePenalties)

    if (!pred) {
      raceNetScores.push(null)
      raceScores.push({ raceId: race.id, raceName: race.name, net: null, raw: 0, bonus: 0, penalty: 0, details: {} })
      continue
    }

    const { raw, bonus, details, perfectPodium } = calculateRaceScore(pred.prediction, race.result)
    const net = netScore(raw + bonus, penaltyTotal)

    raceNetScores.push(net)
    raceScores.push({
      raceId: race.id,
      raceName: race.name,
      net,
      raw,
      bonus,
      penalty: penaltyTotal,
      details,
      perfectPodium,
      prediction: pred.prediction,
      result: race.result,
    })
  }

  const baseTotal = raceNetScores.reduce((sum, s) => sum + (s ?? 0), 0)
  return { total: baseTotal, raceScores, streakBonus: 0 }
}

/**
 * Streak bonus from a boolean win-per-GP list.
 * Every 3 consecutive wins → +10, counter resets (multiple streaks allowed).
 */
function calculateStreakBonusFromWins(wins) {
  let bonus = 0
  let consecutive = 0
  for (const win of wins) {
    if (win) {
      consecutive++
      if (consecutive === 3) {
        bonus += 10
        consecutive = 0
      }
    } else {
      consecutive = 0
    }
  }
  return bonus
}

/**
 * Full season scores for ALL players with correct cross-player streak bonus.
 *
 * Rule: for each completed GP, the player(s) with the highest NET score
 * "win" that GP (ties count as wins for all tied players). A player who
 * wins 3 consecutive GPs earns +10. Counter resets after each trigger,
 * allowing multiple streaks in a season.
 *
 * @param {Array} players
 * @param {Array} sortedRaces - races sorted by id
 * @param {Array} predictions
 * @param {Array} penalties
 * @returns {Array} - one entry per player: { ...player, total, raceScores, streakBonus }
 */
export function calculateAllSeasonScores(players, sortedRaces, predictions, penalties) {
  // Step 1: per-player race scores (no streak bonus yet)
  const perPlayer = players.map(player => {
    const preds = predictions.filter(p => p.playerId === player.id)
    const pens = penalties.filter(p => p.playerId === player.id)
    const { raceScores } = calculatePlayerSeasonScore(preds, sortedRaces, pens)
    return { player, raceScores }
  })

  // Step 2: per completed GP, find winner(s) = highest net score
  const completedRaces = sortedRaces.filter(r => r.status === 'completed' && r.result)
  const gpWinnersMap = completedRaces.map(race => {
    const nets = perPlayer.map(pd => ({
      playerId: pd.player.id,
      net: pd.raceScores.find(rs => rs.raceId === race.id)?.net ?? null,
    })).filter(x => x.net !== null)

    if (!nets.length) return { raceId: race.id, raceName: race.name, winners: [], maxNet: 0 }
    const maxNet = Math.max(...nets.map(x => x.net))
    const winners = nets.filter(x => x.net === maxNet).map(x => x.playerId)
    return { raceId: race.id, raceName: race.name, winners, maxNet }
  })

  // Step 3: streak bonus + final total per player
  const result = perPlayer.map(({ player, raceScores }) => {
    const gpWins = completedRaces.map(race =>
      gpWinnersMap.find(g => g.raceId === race.id)?.winners.includes(player.id) ?? false
    )
    const streakBonus = calculateStreakBonusFromWins(gpWins)
    const baseTotal = raceScores.reduce((sum, rs) => sum + (rs.net ?? 0), 0)
    return { ...player, total: baseTotal + streakBonus, raceScores, streakBonus }
  })

  // Debug log: rapport de calcul du bonus série
  console.group('[Bonus Série] Rapport de calcul')
  gpWinnersMap.forEach(gp => {
    const scores = perPlayer
      .map(pd => {
        const rs = pd.raceScores.find(r => r.raceId === gp.raceId)
        return `${pd.player.id}=${rs?.net ?? 'N/A'}`
      })
      .join(' | ')
    console.log(`GP ${gp.raceName} → gagnant(s): [${gp.winners.join(', ')}] (max net=${gp.maxNet}) — ${scores}`)
  })
  const triggered = result.filter(p => p.streakBonus > 0)
  if (triggered.length) {
    triggered.forEach(p => console.log(`✓ Bonus série +${p.streakBonus} pts → ${p.id}`))
  } else {
    console.log('Aucun bonus série déclenché (< 3 victoires consécutives)')
  }
  result.forEach(p => {
    const wins = completedRaces.map(race => {
      const g = gpWinnersMap.find(g => g.raceId === race.id)
      return g?.winners.includes(p.id) ? 'W' : 'L'
    })
    console.log(`  ${p.id}: [${wins.join('')}] → streakBonus=${p.streakBonus} total=${p.total}`)
  })
  console.groupEnd()

  return result
}

/**
 * Get a human-readable label for a prediction detail.
 */
export function detailLabel(detail) {
  if (detail === 'exact') return 'Exact'
  if (detail === 'podium') return 'Podium'
  return 'Raté'
}

/**
 * Get points for a detail type.
 */
export function detailPoints(detail) {
  if (detail === 'exact') return 10
  if (detail === 'podium') return 3
  return 0
}
