import { useState, useEffect } from 'react'
import { LAST_HOUR_MS } from '../hooks/useRaceTiming'

function getTimeLeft(targetMs) {
  const diff = targetMs - Date.now()
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    inLastHour: diff < LAST_HOUR_MS,
  }
}

// `targetDate` can be a Date, a timestamp or an ISO string — it is
// normalised to a number so the interval below isn't torn down and rebuilt on
// every render when the caller passes a fresh Date object.
export default function Countdown({ targetDate, label, compact = false }) {
  const targetMs = new Date(targetDate).getTime()
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetMs))

  useEffect(() => {
    setTimeLeft(getTimeLeft(targetMs))
    const interval = setInterval(() => setTimeLeft(getTimeLeft(targetMs)), 1000)
    return () => clearInterval(interval)
  }, [targetMs])

  if (!timeLeft) {
    return (
      <div className="text-center">
        <span className="text-accent font-bold text-sm">Pronostics verrouillés</span>
      </div>
    )
  }

  const { days, hours, minutes, seconds, inLastHour } = timeLeft

  // Compact: inline text for race list
  if (compact) {
    const time = `${days > 0 ? `${days}j ` : ''}${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`
    if (inLastHour) {
      return (
        <span className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-accent">Dernière heure pour pronostiquer</span>
          <span className="font-mono text-sm font-bold text-accent">{time}</span>
        </span>
      )
    }
    return <span className="font-mono text-sm text-muted">{time}</span>
  }

  return (
    <div className="text-center">
      {inLastHour
        ? <p className="text-xs text-accent font-bold uppercase tracking-widest mb-3">Dernière heure pour pronostiquer</p>
        : label && <p className="text-xs text-muted uppercase tracking-widest mb-3">{label}</p>}
      <div className="flex items-center justify-center gap-2">
        {[
          { value: days,    lbl: 'J'   },
          { value: hours,   lbl: 'HRS' },
          { value: minutes, lbl: 'MIN' },
          { value: seconds, lbl: 'SEC' },
        ].map(({ value, lbl }) => (
          <div key={lbl} className="flex flex-col items-center">
            <div className={`bg-surfaceHigh border rounded-lg w-14 h-14 flex items-center justify-center ${
              inLastHour ? 'border-accent/60' : 'border-border'
            }`}>
              <span className={`font-black text-2xl tabular-nums ${inLastHour ? 'text-accent' : 'text-white'}`}>
                {String(value).padStart(2, '0')}
              </span>
            </div>
            <span className="text-[9px] text-muted mt-1 font-bold tracking-wider">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
