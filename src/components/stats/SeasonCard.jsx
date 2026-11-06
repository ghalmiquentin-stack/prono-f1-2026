import { useState } from 'react'
import { Star } from 'lucide-react'
import StatsCard from './StatsCard'
import { ordinal } from '../../utils/sheetStats'
import { signedPoints } from '../../utils/standings'
import { oneDecimal } from '../../utils/statsFormat'

// « Ma saison » : une case par GP, comparée à la moyenne de la ligue. On fait glisser le doigt
// sur la bande pour lire chaque GP (aucune case à viser avec précision). Chaque case reste
// aussi un vrai bouton : toucher ou clavier.

const CELL_MAX = 36 // largeur maximale d'une case (px)
const CELL = {
  none: { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #2E2E42' },
  negative: { background: 'rgba(232,0,45,0.6)' },
  above: { background: 'rgba(74,222,128,0.85)' },
  below: { background: 'rgba(255,255,255,0.16)' },
}
const stateOf = (net, avg) => (net === null ? 'none' : net < 0 ? 'negative' : net > avg ? 'above' : 'below')

function Legend({ solo }) {
  if (solo) {
    return (
      <div className="flex items-center gap-4 text-[11px] text-muted mt-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={CELL.above} />points marqués</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={CELL.negative} />négatif</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted mt-2 whitespace-nowrap">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={CELL.above} />au-dessus</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={CELL.below} />en dessous</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={CELL.negative} />négatif</span>
      <span className="flex items-center gap-1"><Star size={11} className="text-gold fill-gold" />meilleur du GP</span>
    </div>
  )
}

export default function SeasonCard({ data }) {
  const { me, list, completed, avgNet } = data
  const [selected, setSelected] = useState(null)
  const solo = list.length < 2 // seul dans la ligue : on ne compare qu'à zéro

  const pick = e => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-gp]')
    if (el) setSelected(Number(el.dataset.gp))
  }
  const net = selected === null ? null : me.net[selected]
  const gpRank = selected === null || net === null ? null : 1 + list.filter(p => p.net[selected] !== null && p.net[selected] > net).length
  const last = completed.length - 1

  return (
    <StatsCard title="Ma saison" sub={solo ? 'Un GP par case.' : 'Un GP par case, comparé à la moyenne de la ligue.'}>
      <div className="min-h-[44px] rounded-lg bg-surfaceHigh/60 px-3 py-2 text-sm flex items-center" aria-live="polite">
        {selected === null ? (
          <p className="text-xs text-muted">Fais glisser ton doigt sur la saison pour lire chaque GP.</p>
        ) : (
          <p className="leading-tight">
            {completed[selected].flag} <b>GP {completed[selected].name}</b>
            <span className="block text-xs text-muted">
              {net === null ? 'Pas de pronostic' : (
                <>
                  <b className="text-white">{signedPoints(net)} pts</b>
                  {!solo && <> · {ordinal(gpRank)} du GP{me.wins[selected] ? ' · meilleur score' : ''} · moyenne de la ligue {oneDecimal(avgNet[selected])}</>}
                </>
              )}
            </span>
          </p>
        )}
      </div>
      {/* La bande et ses repères GP forment un bloc : le dernier repère reste sous la dernière case. */}
      <div style={{ maxWidth: completed.length * (CELL_MAX + 2) }}>
        <div
          className="flex gap-[2px] h-11 mt-2 select-none"
          style={{ touchAction: 'pan-y' }}
          role="group"
          aria-label="Mes points GP par GP"
          onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e) }}
          onPointerMove={e => { if (e.buttons > 0) pick(e) }}
        >
          {me.net.map((value, k) => (
            <button
              key={completed[k].id}
              data-gp={k}
              onClick={() => setSelected(k)}
              aria-label={`GP ${completed[k].name} : ${value === null ? 'pas de pronostic' : `${value} points`}`}
              className={`rounded-[3px] relative ${selected === k ? 'ring-2 ring-white z-10' : ''}`}
              style={{ flex: '1 1 0', maxWidth: CELL_MAX, ...CELL[solo ? (value === null ? 'none' : value < 0 ? 'negative' : 'above') : stateOf(value, avgNet[k])] }}
            >
              {!solo && me.wins[k] && <Star size={8} className="absolute top-0.5 left-1/2 -translate-x-1/2 text-gold fill-gold" />}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted mt-1">
          <span>{completed[0].flag} GP 1</span>
          {last > 0 && <span>{completed[last].flag} GP {completed.length}</span>}
        </div>
      </div>
      <Legend solo={solo} />
    </StatsCard>
  )
}
