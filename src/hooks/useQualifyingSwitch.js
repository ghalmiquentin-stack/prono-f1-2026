import { useEffect, useReducer } from 'react'
import { getQualifyingSwitchMs } from '../utils/qualifyingPenalty'

// setTimeout stores its delay as a signed 32-bit int: above ~24.8 days it
// overflows and fires immediately. Longer waits are split into chunks.
const MAX_TIMER_MS = 2 ** 31 - 1

// Fires just after the threshold, never just before it.
const MARGIN_MS = 50

// Whether the qualifying switch has been crossed — i.e. races/{id}.qualifyingStartAt
// minus the 30 s warning margin (see utils/qualifyingPenalty). Modelled on
// useRaceTiming: the value is computed from the clock at render time and the
// hook only schedules a re-render at the threshold, so the banner appears on
// its own without reloading the page. The timer is rebuilt whenever
// qualifyingStartAt changes (races are a real-time collection) and cleared on
// unmount. `switched` stays false when the field is absent or invalid.
export function useQualifyingSwitch(race) {
  const [, rerender] = useReducer(n => n + 1, 0)
  const switchMs = getQualifyingSwitchMs(race)

  useEffect(() => {
    if (switchMs == null) return undefined
    let timer
    const schedule = () => {
      const diff = switchMs - Date.now()
      if (diff <= 0) return
      timer = setTimeout(() => {
        rerender()
        schedule()
      }, Math.min(diff + MARGIN_MS, MAX_TIMER_MS))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [switchMs])

  return { switched: switchMs != null && Date.now() >= switchMs }
}
