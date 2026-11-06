import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { signedPoints, normalizeText } from '../../utils/standings'

// Liste unique du classement (le podium en fait partie : médailles et teinte
// pour les trois premiers rangs).
//
// Grandes ligues : les 5 premiers, moi et mes deux voisins sont toujours
// visibles ; chaque tronçon masqué d'au moins 2 joueurs devient un bouton
// « N autres joueurs » qui se déplie sur place. À partir de 16 joueurs, une
// recherche s'ajoute. Quand ma ligne sort de l'écran, une barre « Ma ligne »
// reste affichée au-dessus du menu du bas.

const TOP_COUNT = 5
const SEARCH_FROM = 16
// Menu du bas (71 px) + marge : la barre « Ma ligne » se pose juste au-dessus.
const PINNED_BOTTOM = 82
const OBSERVER_MARGIN = '0px 0px -84px 0px'

function MoveCell({ move }) {
  if (!move) return <span className="w-[30px] shrink-0" />
  const gained = move > 0
  return (
    <span
      role="img"
      aria-label={`${gained ? 'gagne' : 'perd'} ${Math.abs(move)} place${Math.abs(move) > 1 ? 's' : ''}`}
      className={`w-[30px] shrink-0 text-right text-[11px] font-black tabular-nums ${gained ? 'text-green-400' : 'text-accent'}`}
    >
      {gained ? '▲' : '▼'}{Math.abs(move)}
    </span>
  )
}

function Row({ player, showGp, started, meTotal, onOpen, rowRef }) {
  const medal = started && player.rank <= 3 ? ['🥇', '🥈', '🥉'][player.rank - 1] : null
  const tint = !started ? '' : player.rank === 1 ? 'bg-gold/[0.07]' : player.rank === 2 ? 'bg-silver/[0.06]' : player.rank === 3 ? 'bg-bronze/[0.07]' : ''
  const sub = [player.isMe ? 'vous' : null, started && player.tied ? 'ex æquo' : null].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      ref={rowRef}
      onClick={() => onOpen(player)}
      className={`w-full flex items-center gap-2 px-2 min-h-[52px] rounded-lg text-left active:scale-[0.99] transition-transform ${player.isMe ? 'bg-surfaceHigh ring-1 ring-white/15' : tint} ${player.active === false ? 'opacity-60' : ''}`}
    >
      <span className={`w-7 shrink-0 text-center leading-none ${medal ? 'text-xl' : 'text-sm font-black text-muted'}`}>
        {started ? (medal || player.rank) : '–'}
      </span>
      <span className="w-7 shrink-0 text-center text-xl leading-none">{player.avatar}</span>
      <span className="flex-1 min-w-0 leading-tight">
        <span className={`block font-bold text-sm truncate ${player.isMe ? 'text-white' : 'text-white/85'}`}>
          {player.displayName}
          {player.active === false && (
            <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide bg-muted/20 text-muted px-1.5 py-0.5 rounded-full">Parti</span>
          )}
        </span>
        {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
      </span>
      {showGp && (
        <>
          <MoveCell move={player.move} />
          <span className={`w-[34px] shrink-0 text-right text-[13px] font-bold tabular-nums ${player.last === null || player.last < 0 ? 'text-muted' : 'text-white/80'}`}>
            {player.last === null ? '–' : signedPoints(player.last)}
          </span>
        </>
      )}
      <span className="w-[46px] shrink-0 text-right leading-tight">
        <span className="block font-black text-sm tabular-nums" style={{ color: player.color }}>{player.total}</span>
        {/* Écart avec moi, vu de mon côté : « −90 » = 90 points de retard sur lui, « +12 » = 12 d'avance. Rien sur ma ligne. */}
        {meTotal != null && !player.isMe && (
          <span className="block text-[11px] font-semibold text-muted tabular-nums">{signedPoints(meTotal - player.total)}</span>
        )}
      </span>
    </button>
  )
}

function GapButton({ count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[44px] flex items-center gap-2 px-2 text-[11px] text-muted font-bold before:content-[''] before:flex-1 before:border-t before:border-dashed before:border-[#3A3A52] after:content-[''] after:flex-1 after:border-t after:border-dashed after:border-[#3A3A52]"
    >
      <span className="flex items-center gap-1">{count} autres joueurs <ChevronDown size={12} /></span>
    </button>
  )
}

function buildItems(list, meIndex, expanded) {
  const keep = new Set()
  for (let i = 0; i < Math.min(TOP_COUNT, list.length); i++) keep.add(i)
  if (meIndex >= 0) {
    keep.add(meIndex)
    if (meIndex > 0) keep.add(meIndex - 1)
    if (meIndex < list.length - 1) keep.add(meIndex + 1)
  }
  const items = []
  let i = 0
  while (i < list.length) {
    if (keep.has(i) || expanded.has(i)) { items.push({ type: 'player', player: list[i] }); i += 1; continue }
    let j = i
    while (j < list.length && !keep.has(j) && !expanded.has(j)) j += 1
    // Un tronçon d'un seul joueur reste affiché (règle de l'Accueil).
    if (j - i <= 1) items.push({ type: 'player', player: list[i] })
    else items.push({ type: 'gap', start: i, count: j - i })
    i = j
  }
  return items
}

export default function StandingsList({ list, lastRace, started, onOpenPlayer }) {
  const meIndex = list.findIndex(p => p.isMe)
  const me = meIndex >= 0 ? list[meIndex] : null
  const [expanded, setExpanded] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [meVisible, setMeVisible] = useState(true)
  const [meAbove, setMeAbove] = useState(false)
  const meRef = useRef(null)
  const showGp = started && !!lastRace
  // L'écart avec moi n'a de sens que si le classement a démarré et que je suis dans la ligue.
  const showGap = started && !!me
  const searchable = list.length >= SEARCH_FROM

  const items = useMemo(() => buildItems(list, meIndex, expanded), [list, meIndex, expanded])
  const q = normalizeText(query.trim())
  const results = q ? list.filter(p => normalizeText(p.displayName).includes(q)) : null

  const expand = (start, count) => setExpanded(prev => {
    const next = new Set(prev)
    for (let k = start; k < start + count; k++) next.add(k)
    return next
  })

  useEffect(() => {
    const el = meRef.current
    if (!el) { setMeVisible(true); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      setMeVisible(entry.isIntersecting)
      setMeAbove(entry.boundingClientRect.top < 0)
    }, { rootMargin: OBSERVER_MARGIN })
    observer.observe(el)
    return () => observer.disconnect()
  }, [items, results])

  const renderRow = (player) => (
    <Row
      key={player.id}
      player={player}
      showGp={showGp}
      started={started}
      meTotal={showGap ? me.total : null}
      onOpen={onOpenPlayer}
      rowRef={player.isMe ? meRef : undefined}
    />
  )

  return (
    <div className="card p-3">
      {searchable && (
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Chercher un joueur"
            aria-label="Chercher un joueur"
            className="w-full min-h-[44px] bg-bg border border-border rounded-xl pl-9 pr-10 text-sm placeholder:text-muted outline-none focus:border-white/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-muted">
              <X size={15} />
            </button>
          )}
        </div>
      )}
      <p className="px-2 text-[11px] text-muted leading-tight">Touchez un joueur pour voir d'où viennent ses points.</p>
      <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
        <span className="w-7 shrink-0" /><span className="w-7 shrink-0" /><span className="flex-1" />
        {showGp && <span className="w-[68px] shrink-0 text-right whitespace-nowrap">{lastRace.flag} GP</span>}
        <span className="w-[46px] shrink-0 text-right leading-tight">
          <span className="block">Total</span>
          {showGap && <span className="block opacity-70">Écart</span>}
        </span>
      </div>
      <div className="space-y-0.5">
        {results ? (
          results.length === 0
            ? <p className="text-sm text-muted text-center py-6">Aucun joueur nommé « {query.trim()} »</p>
            : results.map(renderRow)
        ) : items.map(item => (
          item.type === 'gap'
            ? <GapButton key={`gap-${item.start}`} count={item.count} onClick={() => expand(item.start, item.count)} />
            : renderRow(item.player)
        ))}
      </div>
      {!results && expanded.size > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surfaceHigh text-[13px] font-bold active:scale-95 transition-transform"
        >
          Réduire la liste <ChevronUp size={14} />
        </button>
      )}
      {!meVisible && me && (
        <div className="sticky z-30 mt-2" style={{ bottom: PINNED_BOTTOM }}>
          <button
            type="button"
            onClick={() => meRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="w-full min-h-[48px] flex items-center gap-2 px-3 rounded-xl bg-surfaceHigh border border-white/20 shadow-[0_6px_20px_rgba(0,0,0,0.5)] text-left"
          >
            <span className="w-7 text-center text-sm font-black text-muted">{started ? me.rank : '–'}</span>
            <span className="text-xl leading-none">{me.avatar}</span>
            <span className="flex-1 text-sm font-bold">Ma ligne</span>
            {meAbove ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
            <span className="font-black text-sm tabular-nums" style={{ color: me.color }}>{me.total}</span>
          </button>
        </div>
      )}
    </div>
  )
}
