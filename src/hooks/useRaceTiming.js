import { useEffect, useReducer } from 'react'
import { raceStartInstant } from '../utils/races'

export const LAST_HOUR_MS = 60 * 60 * 1000

// setTimeout stores its delay as a signed 32-bit int: above ~24.8 days it
// overflows and fires immediately. Longer waits are split into chunks.
const MAX_TIMER_MS = 2 ** 31 - 1

// Fires just after the threshold, never just before it.
const MARGIN_MS = 50

// Whether a race's start has passed (`started`) and whether it is within the
// hour before it (`inLastHour`, strictly less than one hour left). The values
// are computed from the clock at render time; the hook only schedules a
// re-render when each threshold is crossed (T-1h, then T), so the screen
// flips on its own without ticking every second.
export function useRaceTiming(race) {
  const [, rerender] = useReducer(n => n + 1, 0)
  const startMs = race ? raceStartInstant(race).getTime() : NaN

  useEffect(() => {
    if (Number.isNaN(startMs)) return undefined
    let timer
    const schedule = () => {
      const diff = startMs - Date.now()
      if (diff <= 0) return
      const untilNextThreshold = diff > LAST_HOUR_MS ? diff - LAST_HOUR_MS : diff
      timer = setTimeout(() => {
        rerender()
        schedule()
      }, Math.min(untilNextThreshold + MARGIN_MS, MAX_TIMER_MS))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [startMs])

  const diff = startMs - Date.now()
  return {
    started: diff <= 0,
    inLastHour: diff > 0 && diff < LAST_HOUR_MS,
  }
}
