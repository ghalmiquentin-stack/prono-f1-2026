import Portrait from './Portrait'
import { resolveDriver } from './driverUtils'

const BADGE = ['bg-gold', 'bg-silver', 'bg-bronze']

// Podium officiel en version compacte (Accueil) : trois cartes côte à côte, dans
// l'ordre 1, 2, 3, avec portrait cerclé de la couleur de l'écurie, numéro de place,
// nom et écurie. La feuille de GP terminé garde le podium à marches (PodiumCard).
// `times` (facultatif) : { P1: '1:09.511', … } affiché sous l'écurie (podium des qualifs).
export default function CompactPodium({ result, drivers, className = '', times }) {
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {['P1', 'P2', 'P3'].map((pos, i) => {
        const name = result?.[pos]
        const { color, team } = resolveDriver(drivers, name)
        return (
          <div key={pos} className="rounded-xl border border-border/60 bg-surfaceHigh/60 px-1 py-2.5 flex flex-col items-center text-center min-w-0">
            <div className="relative">
              <Portrait drivers={drivers} name={name} className="w-12 h-12" ring={color} />
              <span className={`absolute -bottom-1 -right-1 w-[20px] h-[20px] rounded-full text-[11px] font-black flex items-center justify-center text-bg ${BADGE[i]}`}>{i + 1}</span>
            </div>
            <p className="text-sm font-black mt-2 leading-tight truncate w-full">{name}</p>
            <p className="text-[11px] text-muted leading-tight truncate w-full">{team}</p>
            {times?.[pos] && <p className="text-[11px] font-bold tabular-nums leading-tight mt-0.5">{times[pos]}</p>}
          </div>
        )
      })}
    </div>
  )
}
