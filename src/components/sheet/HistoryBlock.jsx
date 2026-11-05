import { Flag } from 'lucide-react'
import Portrait from './Portrait'
import { shortTeam } from './driverUtils'

const RANK_BG = ['bg-gold', 'bg-silver', 'bg-bronze']

function Card({ drivers, entry, rank, pole }) {
  return (
    <div className={`border rounded-xl px-1 py-1 flex flex-col items-center text-center min-w-0 ${pole ? 'bg-white/[0.06] border-white/20' : 'bg-surfaceHigh/60 border-border/60'}`}>
      <div className="relative">
        <Portrait drivers={drivers} name={entry.name} className="w-7 h-7" />
        <span className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center text-bg ${pole ? 'bg-white' : RANK_BG[rank - 1]}`}>
          {pole ? <Flag size={10} strokeWidth={3} /> : rank}
        </span>
      </div>
      <p className="text-xs font-black mt-1.5 leading-tight truncate w-full">{entry.name ?? '—'}</p>
      <p className="text-[11px] text-muted leading-tight truncate w-full">{shortTeam(entry.team)}</p>
      {pole && entry.lap_duration && (
        <p className="text-[11px] font-bold tabular-nums leading-tight mt-0.5"><span className="text-muted font-normal">Pole</span> {entry.lap_duration}</p>
      )}
    </div>
  )
}

// Édition précédente du GP : podium de la course (3 cartes) et pole des
// qualifications (1 carte), clairement distingués. Rien n'est affiché sans
// données (première édition, historique absent).
export default function HistoryBlock({ history, firstEdition, drivers }) {
  if (firstEdition || !history) return null
  const podium = history.podium ? ['P1', 'P2', 'P3'].map(p => history.podium[p]).filter(Boolean) : []
  const pole = history.pole ?? null
  if (podium.length === 0 && !pole) return null
  const cols = (podium.length ? 3 : 0) + (pole ? 1 : 0)
  return (
    <>
      <div className="mt-2 border-t border-border" />
      <div className="px-5 pt-2">
        <div className={`grid gap-1.5 ${cols === 4 ? 'grid-cols-4' : cols === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {podium.length > 0 && (
            <p className="col-span-3 text-[11px] font-bold tracking-widest uppercase text-muted pb-0.5 border-b border-border/70">Course {history.year} · podium</p>
          )}
          {pole && (
            <p className="text-[11px] font-bold tracking-widest uppercase text-muted pb-0.5 border-b border-border/70 text-center">Qualifs</p>
          )}
          {podium.map((e, i) => <Card key={i} drivers={drivers} entry={e} rank={i + 1} />)}
          {pole && <Card drivers={drivers} entry={pole} pole />}
        </div>
      </div>
    </>
  )
}
