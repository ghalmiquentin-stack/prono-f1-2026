import Portrait from './Portrait'
import { resolveDriver } from './driverUtils'

const RANK_BG = ['bg-gold', 'bg-silver', 'bg-bronze']

// Qualifications du week-end (top 3 et temps). Lecture seule : les données sont
// récupérées côté admin, jamais depuis cette feuille.
export default function QualifyingBlock({ qualifying, drivers }) {
  const entries = qualifying ? ['P1', 'P2', 'P3'].map(p => qualifying[p]).filter(Boolean) : []
  return (
    <>
      <div className="mt-3 border-t border-border" />
      <div className="px-5 pt-3">
        <p className="section-title !mb-2">Qualifications {qualifying?.year ?? new Date().getFullYear()}</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted rounded-xl border border-dashed border-border px-3 py-3 text-center">Qualifications pas encore disponibles</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {entries.map((e, i) => (
              <div key={i} className="border rounded-xl px-1 py-1 flex flex-col items-center text-center min-w-0 bg-surfaceHigh/60 border-border/60">
                <div className="relative">
                  <Portrait drivers={drivers} name={e.name} className="w-7 h-7" />
                  <span className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center text-bg ${RANK_BG[i]}`}>{i + 1}</span>
                </div>
                <p className="text-xs font-black mt-1.5 leading-tight truncate w-full">{e.name}</p>
                <p className="text-[11px] text-muted leading-tight truncate w-full">{resolveDriver(drivers, e.name).team}</p>
                {e.lap_duration && <p className="text-[11px] font-bold tabular-nums leading-tight mt-0.5">{e.lap_duration}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
