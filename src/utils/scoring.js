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
 * Calculate streak bonus.
 * Rule: best 3-consecutive-race total → +10 bonus (once, for best window).
 * Applied once per player per season.
 *
 * @param {Array<number|null>} raceNetScores - array of net scores per race (null = no prediction)
 * @returns {number} bonus points
 */
export function calculateStreakBonus(raceNetScores) {
  const filled = raceNetScores.filter(s => s !== null && s !== undefined)
  if (filled.length < 3) return 0

  let best = -Infinity
  for (let i = 0; i <= raceNetScores.length - 3; i++) {
    const window = raceNetScores.slice(i, i + 3)
    if (window.every(s => s !== null && s !== undefined)) {
      const sum = window.reduce((a, b) => a + b, 0)
      if (sum > best) best = sum
    }
  }

  return best > -Infinity ? 10 : 0
}

/**
 * Full season score for a player.
 * @param {Array} predictions - all predictions for this player
 * @param {Array} races - all races (with results)
 * @param {Array} penalties - all penalties for this player
 * @returns {{ total: number, raceScores: Array, streakBonus: number }}
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

  const streakBonus = calculateStreakBonus(raceNetScores)
  const baseTotal = raceNetScores.reduce((sum, s) => sum + (s ?? 0), 0)
  const total = baseTotal + streakBonus

  return { total, raceScores, streakBonus }
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
