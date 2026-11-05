import { Plus } from 'lucide-react'
import Portrait from './Portrait'
import { resolveDriver } from './driverUtils'

// Marches : même dégradé que le visuel de l'intro d'accueil, réduit pour tenir sur un écran.
export const STEP = {
  P1: { color: '#FFD700', fill: 'linear-gradient(#FFE14D,#C9A400)', h: 54, size: 'w-[60px] h-[60px]', label: '1', empty: 'Le vainqueur' },
  P2: { color: '#C0C0C0', fill: 'linear-gradient(#D8D8D8,#9A9A9A)', h: 38, size: 'w-[52px] h-[52px]', label: '2', empty: 'Le 2e' },
  P3: { color: '#CD7F32', fill: 'linear-gradient(#DB9150,#A5651F)', h: 28, size: 'w-[52px] h-[52px]', label: '3', empty: 'Le 3e' },
}
export const ORDER = ['P2', 'P1', 'P3']

// Une marche du podium : portrait (ou emplacement vide en pointillés), nom,
// écurie, puis la marche. `onTap` absent = non interactive (verrouillé, résultat).
export function PodiumSlot({ pos, driver, drivers, onTap }) {
  const s = STEP[pos]
  const { color, team } = driver ? resolveDriver(drivers, driver) : {}
  const face = driver ? (
    <Portrait drivers={drivers} name={driver} className={s.size} ring={color} />
  ) : (
    <div
      className={`${s.size} rounded-full bg-surface border-2 border-dashed flex items-center justify-center`}
      style={{ borderColor: s.color, color: s.color }}
    >
      <Plus size={24} strokeWidth={2.4} />
    </div>
  )
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      {onTap ? (
        <button
          onClick={onTap}
          aria-label={driver ? `${driver}, changer` : `Choisir la place ${s.label}`}
          className="block"
        >
          {face}
        </button>
      ) : face}
      <div className="mt-1.5 h-[34px] text-center w-full px-1">
        {driver ? (
          <>
            <p className="text-sm font-black leading-tight truncate">{driver}</p>
            <p className="text-[11px] text-muted leading-tight truncate">{team}</p>
          </>
        ) : (
          <p className="text-xs text-muted pt-1">{s.empty}</p>
        )}
      </div>
      <div
        className="w-full rounded-t-[10px] flex items-center justify-center text-xl font-black text-bg leading-none"
        style={{ height: s.h, background: s.fill }}
      >
        {s.label}
      </div>
    </div>
  )
}

// Podium complet : P2 à gauche, P1 au centre, P3 à droite.
export function PodiumCard({ values, drivers, onTapPos }) {
  return (
    <div className="card overflow-hidden px-3 pt-3">
      <div className="flex items-end gap-2">
        {ORDER.map(pos => (
          <PodiumSlot
            key={pos}
            pos={pos}
            driver={values?.[pos] ?? null}
            drivers={drivers}
            onTap={onTapPos ? () => onTapPos(pos) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
