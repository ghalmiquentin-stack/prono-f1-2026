import { useState, useEffect } from 'react'

function getTimeLeft(targetDate) {
  const now = new Date()
  const target = new Date(targetDate)
  const diff = target - now
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

export default function Countdown({ targetDate, label, compact = false }) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate))

  useEffect(() => {
    setTimeLeft(getTimeLeft(targetDate))
    const interval = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (!timeLeft) {
    return (
      <div className="text-center">
        <span className="text-accent font-bold text-sm">Course en cours !</span>
      </div>
    )
  }

  // Compact: inline text for race list
  if (compact) {
    const { days, hours, minutes } = timeLeft
    return (
      <span className="font-mono text-sm text-muted">
        {days > 0 ? `${days}j ` : ''}{String(hours).padStart(2, '0')}h{String(minutes).padStart(2, '0')}
      </span>
    )
  }

  const { days, hours, minutes, seconds } = timeLeft

  return (
    <div className="text-center">
      {label && <p className="text-xs text-muted uppercase tracking-widest mb-3">{label}</p>}
      <div className="flex items-center justify-center gap-2">
        {[
          { value: days,    lbl: 'J'   },
          { value: hours,   lbl: 'HRS' },
          { value: minutes, lbl: 'MIN' },
          { value: seconds, lbl: 'SEC' },
        ].map(({ value, lbl }) => (
          <div key={lbl} className="flex flex-col items-center">
            <div className="bg-surfaceHigh border border-border rounded-lg w-14 h-14 flex items-center justify-center">
              <span className="font-black text-2xl text-white tabular-nums">
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
