import { useState } from 'react'
import useElementWidth from '../../hooks/useElementWidth'
import { ChevronDown, Search } from 'lucide-react'
import StatsCard from './StatsCard'
import BottomSheet from '../BottomSheet'
import { ptsLabel, signedPoints, normalizeText } from '../../utils/standings'

// « Duel » : me comparer à un joueur, GP par GP. Par défaut, le joueur juste au-dessus de moi
// au classement (juste en dessous si je suis premier). On change d'adversaire dans une feuille
// avec recherche dès 16 joueurs et « Autour de toi » dès 8.

const MAX_WIDTH = 560
const H = 96
const MUTED = '#9494AC'

function OpponentSheet({ data, current, onClose, onPick }) {
  const { me, list } = data
  const [query, setQuery] = useState('')
  const meIndex = list.findIndex(p => p.id === me.id)
  const near = list.filter((p, i) => p.id !== me.id && Math.abs(i - meIndex) <= 2)
  const results = list.filter(p => p.id !== me.id && normalizeText(p.name).includes(normalizeText(query)))
  const gapLabel = p => (p.total === me.total ? '=' : signedPoints(p.total - me.total))

  const Row = ({ p }) => (
    <button
      onClick={() => onPick(p.id)}
      className={`w-full h-[52px] flex items-center gap-3 px-3 rounded-lg text-left ${current === p.id ? 'bg-surfaceHigh ring-1 ring-white/15' : ''}`}
    >
      <span className="w-7 text-center text-sm font-black text-muted">{p.rank}</span>
      <span className="text-xl">{p.avatar}</span>
      <span className="flex-1 font-bold truncate">{p.name}</span>
      <span className="text-xs text-muted tabular-nums">{gapLabel(p)}</span>
    </button>
  )

  return (
    <BottomSheet isOpen onClose={onClose} bare fullHeight>
      <div className="px-5 pt-3 pb-24">
        <p className="text-xl font-black pr-10">Me comparer à</p>
        {list.length >= 16 && (
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Chercher un joueur"
              className="w-full h-11 rounded-lg bg-surfaceHigh border border-border pl-9 pr-3 text-sm"
            />
          </div>
        )}
        {!query && list.length >= 8 && (
          <>
            <p className="text-[11px] uppercase text-muted font-bold mt-4 mb-1">Autour de toi</p>
            {near.map(p => <Row key={`near-${p.id}`} p={p} />)}
          </>
        )}
        <p className="text-[11px] uppercase text-muted font-bold mt-4 mb-1">{query ? 'Résultats' : list.length >= 8 ? 'Tous les joueurs' : 'Joueurs'}</p>
        {results.map(p => <Row key={p.id} p={p} />)}
        {results.length === 0 && <p className="text-sm text-muted py-4">Aucun joueur trouvé.</p>}
      </div>
    </BottomSheet>
  )
}

export default function DuelCard({ data }) {
  const { me, list, completed } = data
  const [chosen, setChosen] = useState(null)
  const [boxRef, boxWidth] = useElementWidth()
  const W = Math.min(boxWidth, MAX_WIDTH)
  const [open, setOpen] = useState(false)
  const meIndex = list.findIndex(p => p.id === me.id)
  const opponent = list.find(p => p.id === chosen) ?? list[meIndex - 1] ?? list[meIndex + 1]
  if (!opponent) return null

  const n = completed.length
  const diffs = completed.map((_, k) => {
    const a = me.net[k]
    const b = opponent.net[k]
    return a === null && b === null ? null : (a ?? 0) - (b ?? 0)
  })
  const won = diffs.filter(d => d !== null && d > 0).length
  const lost = diffs.filter(d => d !== null && d < 0).length
  const ties = diffs.filter(d => d === 0).length
  const gap = me.total - opponent.total
  const maxAbs = Math.max(5, ...diffs.map(d => Math.abs(d ?? 0)))
  const mid = H / 2
  const barW = Math.min(26, (W - 4) / n)
  const bestOf = p => p.net.reduce((best, v, k) => (v !== null && (best === null || v > p.net[best]) ? k : best), null)
  const myBest = bestOf(me)
  const hisBest = bestOf(opponent)

  return (
    <StatsCard title="Duel" sub="Me comparer à un joueur, GP par GP.">
      <button onClick={() => setOpen(true)} className="w-full min-h-[52px] rounded-xl bg-surfaceHigh border border-border px-4 flex items-center gap-3 text-left">
        <span className="text-[11px] uppercase font-bold text-muted">Contre</span>
        <span className="text-xl">{opponent.avatar}</span>
        <span className="flex-1 font-black truncate">{opponent.name}</span>
        <ChevronDown size={18} className="text-muted" />
      </button>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-4">
        <div className="text-center min-w-0">
          <p className="text-3xl leading-none">{me.avatar}</p>
          <p className="font-black text-sm truncate mt-1" style={{ color: me.color }}>{me.name}</p>
          <p className="text-xl font-black">{me.total}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase text-muted font-bold">GP gagnés</p>
          <p className="text-3xl font-black leading-none whitespace-nowrap">
            <span style={{ color: me.color }}>{won}</span>
            <span className="text-muted mx-1.5 text-xl">–</span>
            <span style={{ color: opponent.color }}>{lost}</span>
          </p>
          {ties > 0 && <p className="text-[11px] text-muted mt-1">{ties} égalité{ties > 1 ? 's' : ''}</p>}
        </div>
        <div className="text-center min-w-0">
          <p className="text-3xl leading-none">{opponent.avatar}</p>
          <p className="font-black text-sm truncate mt-1" style={{ color: opponent.color }}>{opponent.name}</p>
          <p className="text-xl font-black">{opponent.total}</p>
        </div>
      </div>
      <p className="text-center text-sm mt-2">
        {gap === 0 ? 'Ex æquo' : (
          <>
            <b>{ptsLabel(gap)}</b> {gap > 0 ? "d'avance" : 'de retard'} <span className="text-muted">sur {opponent.name}</span>
          </>
        )}
      </p>

      <div className="flex items-center justify-between text-[11px] mt-4 mb-1 gap-2">
        <span className="flex items-center gap-1.5 font-bold" style={{ color: me.color }}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: me.color }} />Toi devant
        </span>
        <span className="flex items-center gap-1.5 text-muted font-bold">
          <span className="w-3.5 h-[3px] rounded-full" style={{ background: MUTED }} />égalité
        </span>
        <span className="flex items-center gap-1.5 font-bold" style={{ color: opponent.color }}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: opponent.color }} />{opponent.name} devant
        </span>
      </div>
      <div ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block mx-auto" role="img" aria-label="Qui a gagné chaque GP : barre vers le haut quand je suis devant, vers le bas quand l'autre est devant">
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="rgba(255,255,255,0.35)" />
          {diffs.map((d, k) => {
            if (d === null) return null
            const bx = 2 + k * barW + 1
            const bw = Math.max(2, barW - 2)
            if (d === 0) return <rect key={k} x={bx} y={mid - 1.5} width={bw} height={3} rx="1.5" fill={MUTED} />
            const h = (Math.abs(d) / maxAbs) * (mid - 3)
            return <rect key={k} x={bx} y={d > 0 ? mid - h : mid} width={bw} height={h} rx="1.5" fill={d > 0 ? me.color : opponent.color} />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div className="rounded-lg bg-surfaceHigh/60 p-2.5">
          <p className="text-muted">Mon meilleur GP</p>
          <p className="font-black text-sm" style={{ color: me.color }}>{myBest === null ? '–' : `${completed[myBest].flag} ${signedPoints(me.net[myBest])} pts`}</p>
        </div>
        <div className="rounded-lg bg-surfaceHigh/60 p-2.5">
          <p className="text-muted">Son meilleur GP</p>
          <p className="font-black text-sm" style={{ color: opponent.color }}>{hisBest === null ? '–' : `${completed[hisBest].flag} ${signedPoints(opponent.net[hisBest])} pts`}</p>
        </div>
      </div>

      {open && (
        <OpponentSheet data={data} current={opponent.id} onClose={() => setOpen(false)} onPick={id => { setChosen(id); setOpen(false) }} />
      )}
    </StatsCard>
  )
}
