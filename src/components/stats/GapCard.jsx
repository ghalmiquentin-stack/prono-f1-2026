import { useRef, useState } from 'react'
import useElementWidth from '../../hooks/useElementWidth'
import StatsCard from './StatsCard'
import { quantile } from '../../utils/statsFormat'
import { signedPoints } from '../../utils/standings'

// « Mon écart avec les autres » : ma ligne est le zéro ; au-dessus d'elle, les joueurs devant
// moi, en dessous ceux derrière. On fait glisser le doigt pour lire un GP.
//   - jusqu'à MAX_DIRECT joueurs : une ligne par joueur, à sa couleur de profil ;
//   - au-delà : les trois premiers (couleurs du podium) et une zone grise pour la moitié
//     centrale de la ligue.

export const MAX_DIRECT_PLAYERS = 6

const MAX_WIDTH = 560
const H = 220
const MARGIN = { left: 4, right: 74, top: 14, bottom: 20 }
const MEDALS = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
const OTHER_RANK = '#9494AC'
const MUTED = '#9494AC'
const BORDER = '#2E2E42'

// Étale les étiquettes de fin de ligne pour qu'elles ne se chevauchent pas.
function spreadLabels(items, minGap, maxY) {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) sorted[i].y = sorted[i - 1].y + minGap
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - maxY : 0
  if (overflow > 0) sorted.forEach(item => { item.y -= overflow })
  return sorted
}

export default function GapCard({ data }) {
  const { me, list, completed } = data
  const svgRef = useRef(null)
  const [boxRef, boxWidth] = useElementWidth()
  const W = Math.min(boxWidth, MAX_WIDTH)
  const [selected, setSelected] = useState(null)
  const n = completed.length
  const index = selected ?? n - 1

  const others = list.filter(p => p.id !== me.id)
  const grouped = list.length > MAX_DIRECT_PLAYERS
  const lines = (grouped ? others.slice(0, 3) : others).map(p => ({
    player: p,
    color: grouped ? (MEDALS[p.rank] ?? OTHER_RANK) : p.color,
  }))
  const diff = p => p.cum.map((v, i) => v - me.cum[i])
  const band = grouped
    ? me.cum.map((_, i) => {
        const gaps = others.map(p => p.cum[i] - me.cum[i])
        return [quantile(gaps, 0.25), quantile(gaps, 0.75)]
      })
    : null

  const values = [0, ...lines.flatMap(l => diff(l.player)), ...(band ? band.flat() : [])]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.08 || 5
  const x = i => MARGIN.left + (n === 1 ? (W - MARGIN.left - MARGIN.right) / 2 : (i / (n - 1)) * (W - MARGIN.left - MARGIN.right))
  const y = v => MARGIN.top + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - MARGIN.top - MARGIN.bottom)
  const path = points => points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  const labels = spreadLabels([
    { key: 'me', y: y(0), text: 'Moi', color: me.color },
    ...lines.map(l => ({ key: l.player.id, y: y(diff(l.player)[n - 1]), text: l.player.name.slice(0, 9), color: l.color })),
    ...(band ? [{ key: 'band', y: y((band[n - 1][0] + band[n - 1][1]) / 2), text: 'La ligue', color: MUTED }] : []),
  ], 13, H - MARGIN.bottom)

  const pointAt = e => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - MARGIN.left) / (W - MARGIN.left - MARGIN.right)) * (n - 1))
    setSelected(Math.max(0, Math.min(n - 1, i)))
  }
  const ahead = others.filter(p => p.cum[index] > me.cum[index]).length
  const ticks = [0, Math.round((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <StatsCard title="Mon écart avec les autres" sub="Ma ligne est le zéro. Au-dessus, ils sont devant moi, en dessous ils sont derrière.">
      <div className="min-h-[44px] rounded-lg bg-surfaceHigh/60 px-3 py-2 text-xs mb-2" aria-live="polite">
        <p className="font-bold">{completed[index].flag} GP {completed[index].name} <span className="font-normal text-muted">· après {index + 1} course{index ? 's' : ''}</span></p>
        <p className="text-muted">
          {selected === null ? 'Fais glisser ton doigt sur le graphique. ' : ''}
          {ahead === 0 ? 'Tu es en tête.' : `${ahead} joueur${ahead > 1 ? 's' : ''} devant toi.`}
        </p>
      </div>
      <div ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block mx-auto"
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label="Écart de points avec chaque joueur, GP après GP"
          onPointerDown={e => { svgRef.current.setPointerCapture?.(e.pointerId); pointAt(e) }}
          onPointerMove={e => { if (e.buttons > 0) pointAt(e) }}
        >
          {band && (
            <path
              d={`${band.map((b, i) => `${i ? 'L' : 'M'}${x(i)} ${y(b[1])}`).join(' ')} ${[...band].reverse().map((b, j) => `L${x(n - 1 - j)} ${y(b[0])}`).join(' ')} Z`}
              fill={MUTED}
              fillOpacity="0.2"
            />
          )}
          <line x1={MARGIN.left} x2={W - MARGIN.right} y1={y(0)} y2={y(0)} stroke={me.color} strokeWidth="3" strokeLinecap="round" />
          {selected !== null && <line x1={x(index)} x2={x(index)} y1={MARGIN.top - 6} y2={H - MARGIN.bottom} stroke="rgba(255,255,255,0.5)" />}
          {lines.map(l => (
            <path key={l.player.id} d={path(diff(l.player))} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.95" />
          ))}
          {n <= 4 && lines.flatMap(l => diff(l.player).map((v, i) => <circle key={`${l.player.id}-${i}`} cx={x(i)} cy={y(v)} r="3.5" fill={l.color} />))}
          {selected !== null && lines.map(l => (
            <circle key={l.player.id} cx={x(index)} cy={y(l.player.cum[index] - me.cum[index])} r="4.5" fill={l.color} stroke="#15151E" strokeWidth="1.5" />
          ))}
          {labels.map(l => (
            <text key={l.key} x={W - MARGIN.right + 8} y={l.y + 4} fontSize="11" fontWeight="700" fill={l.color}>{l.text}</text>
          ))}
          {ticks.map(i => (
            <text key={i} x={x(i)} y={H - 4} fontSize="11" fill={MUTED} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {completed[i].flag} GP {i + 1}
            </text>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
        {lines.map(l => (
          <span key={l.player.id} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
            {l.player.name} <b>{signedPoints(l.player.cum[index] - me.cum[index])}</b>
          </span>
        ))}
      </div>
      {grouped && (
        <p className="text-[11px] text-muted mt-2">Les 3 premiers aux couleurs du podium. La zone grise regroupe la moitié centrale de la ligue.</p>
      )}
    </StatsCard>
  )
}
