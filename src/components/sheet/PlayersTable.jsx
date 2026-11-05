import { useState } from 'react'
import { Star } from 'lucide-react'
import Portrait from './Portrait'
import PredictionTimestamps from '../PredictionTimestamps'
import { driverCode, limitListWithMe } from '../../utils/sheetStats'

const CELL = {
  exact: 'border-green-500/70 bg-green-500/10',
  podium: 'border-yellow-500/60 bg-yellow-500/10',
  miss: 'border-border bg-surfaceHigh/50',
}
const PTS_COLOR = { exact: 'text-green-400', podium: 'text-yellow-400', miss: 'text-muted' }
const COLS = 'grid grid-cols-[84px_1fr_1fr_1fr_58px] gap-1'

function PickCell({ drivers, name, status }) {
  return (
    <div className={`border rounded-lg py-[3px] px-1 flex items-center justify-center gap-[3px] min-w-0 ${CELL[status]}`}>
      <Portrait drivers={drivers} name={name} className="w-5 h-5" />
      <span className="text-[11px] font-semibold tracking-wide leading-none text-white/90">{driverCode(drivers, name)}</span>
    </div>
  )
}

// Tableau des pronostics d'une course terminée : une ligne par joueur, trois
// cases (P1, P2, P3) colorées selon la justesse, total à droite, détail au toucher.
// `rows` est déjà trié par points décroissants (sans pronostic en dernier).
export default function PlayersTable({ rows, meId, drivers, penalties, raceId }) {
  const [open, setOpen] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const items = showAll ? rows.map(p => ({ type: 'player', player: p })) : limitListWithMe(rows, meId)
  const shown = items.filter(i => i.type === 'player').length
  const hidden = rows.length - shown

  return (
    <div className="px-5 pt-3">
      <div className="flex items-baseline justify-between">
        <p className="section-title !mb-1.5">Pronostics des joueurs</p>
        <p className="text-[11px] text-muted mb-1.5">Touche une ligne pour le détail</p>
      </div>
      <div className={`${COLS} px-1 pb-1 text-[11px] font-bold tracking-widest uppercase text-muted`}>
        <span /><span className="text-center">P1</span><span className="text-center">P2</span><span className="text-center">P3</span><span className="text-right">Total</span>
      </div>
      <div>
        {items.map((it, idx) => {
          if (it.type === 'gap') {
            return (
              <div key={`g${idx}`} className="flex items-center gap-2 mx-2 my-1 text-[11px] text-muted before:content-[''] before:flex-1 before:border-t before:border-dashed before:border-[#3A3A52] after:content-[''] after:flex-1 after:border-t after:border-dashed after:border-[#3A3A52]">
                {it.count} autres joueurs
              </div>
            )
          }
          const pl = it.player
          const isMe = pl.id === meId
          const isOpen = open === pl.id && !pl.none
          return (
            <div
              key={pl.id}
              className={`rounded-lg ${isMe ? 'bg-surfaceHigh' : ''} ${pl.perfect ? 'border border-gold/60 bg-gold/[0.06]' : ''}`}
              style={pl.perfect ? { boxShadow: '0 0 16px rgba(255,215,0,0.22)' } : undefined}
            >
              <button
                onClick={() => !pl.none && setOpen(isOpen ? null : pl.id)}
                aria-expanded={pl.none ? undefined : isOpen}
                className={`w-full ${COLS} items-center px-1 py-1 text-left`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xl leading-none">{pl.avatar}</span>
                  <span className="min-w-0 leading-tight">
                    <span className={`block font-bold text-sm truncate ${isMe ? 'text-white' : 'text-white/80'}`}>{pl.name}</span>
                    {isMe && <span className="block text-[11px] text-muted">vous</span>}
                  </span>
                </span>
                {pl.none
                  ? <span className="col-span-3 text-center text-xs text-muted italic">Pas de prono</span>
                  : pl.picks.map((d, k) => <PickCell key={k} drivers={drivers} name={d} status={pl.st[k]} />)}
                <span className="text-right leading-tight">
                  <span className="flex items-center justify-end gap-0.5 font-black text-sm" style={{ color: pl.perfect ? '#FFD700' : pl.color }}>
                    {pl.perfect && <Star size={11} fill="#FFD700" />}{pl.none ? '—' : pl.net}
                  </span>
                  {pl.pen > 0 && <span className="block text-[11px] text-muted tabular-nums">{pl.gross} <span className="text-accent font-bold">− {pl.pen}</span></span>}
                </span>
              </button>
              {isOpen && (
                <div className="mx-1 mb-1.5 rounded-lg bg-bg/40 border border-border/60 px-2 py-2 space-y-2">
                  <p className="text-sm font-bold flex items-center gap-1.5 min-w-0">
                    <span className="text-lg leading-none">{pl.avatar}</span>
                    <span className="truncate">{pl.name}</span>
                    {isMe && <span className="text-xs text-muted font-normal shrink-0">(vous)</span>}
                  </p>
                  <div className={COLS}>
                    <span className="text-[11px] text-muted self-center">Points</span>
                    {pl.pts.map((p, k) => (
                      <span key={k} className={`text-center text-[13px] font-black ${PTS_COLOR[pl.st[k]]}`}>{p > 0 ? `+${p}` : '0'}</span>
                    ))}
                    <span />
                  </div>
                  <PredictionTimestamps prediction={pl.pred} penalties={penalties} playerId={pl.id} raceId={raceId} />
                  <div className="flex items-center justify-between rounded-md bg-surfaceHigh/70 px-2 py-1.5 text-xs">
                    <span><span className="text-muted">Pronostic </span><span className="font-black text-green-400">{pl.raw}</span></span>
                    {pl.perfect && <span><span className="text-muted">Bonus </span><span className="font-black text-gold">+{pl.bonus}</span></span>}
                    {pl.pen > 0 && <span><span className="text-muted">Pénalité </span><span className="font-black text-accent">−{pl.pen}</span></span>}
                    <span><span className="text-muted">Total </span><span className="font-black" style={{ color: pl.perfect ? '#FFD700' : pl.color }}>{pl.net}</span></span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {rows.length > 6 && (
        <button onClick={() => setShowAll(v => !v)} className="mt-1 w-full text-center text-xs font-bold text-accent py-1.5">
          {showAll ? 'Réduire la liste' : `Voir les ${hidden} autres joueurs`}
        </button>
      )}
      <p className="mt-1 flex items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/60 border border-green-500" />Bonne place</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/50 border border-yellow-500" />Sur le podium</span>
      </p>
    </div>
  )
}
