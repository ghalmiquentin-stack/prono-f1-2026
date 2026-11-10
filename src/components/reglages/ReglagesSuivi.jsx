import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Timer, RefreshCw, Search, X } from 'lucide-react'
import BottomSheet from '../BottomSheet'
import StatusDot from '../ligues/StatusDot'
import FicheJoueurGP from './FicheJoueurGP'
import { getProfile } from '../../utils/profiles'
import { summarizePenalties } from '../../utils/penalties'
import { hasRaceStarted } from '../../utils/races'
import { driverCode } from '../../utils/sheetStats'
import { normalizeText } from '../../utils/standings'
import { formatPredTime, toValidDate } from '../PredictionTimestamps'

const NEUTRAL_COLOR = '#6B6B8A'
// Le champ de recherche n'apparaît qu'à partir de 8 lignes affichées (maquette validée le 9 nov. 2026)
const SEARCH_FROM = 8

// Écran « Suivi des GP » (maquette validée) : rangée de GP, trois filtres, recherche, une ligne par joueur.
// Toucher une ligne ouvre la fiche du joueur pour ce GP. Lecture seule ici ; les actions de l'admin
// (pénalités) arrivent par `renderActions` / `onRemovePenalty`.

function RaceStrip({ races, selected, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current?.querySelector('[data-sel="1"]')
    if (el) ref.current.scrollLeft = Math.max(0, el.offsetLeft - 28)
  }, [selected])
  return (
    <div ref={ref} className="flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
      {races.map(r => {
        const sel = r.id === selected
        return (
          <button
            key={r.id}
            data-sel={sel ? '1' : undefined}
            onClick={() => onSelect(r.id)}
            className={`shrink-0 px-3 rounded-xl border text-left active:scale-95 transition-all ${sel ? 'bg-accent border-accent text-white' : 'bg-surface border-border text-muted'}`}
            style={{ minHeight: 44 }}
          >
            <span className="block text-base leading-none">{r.flag}</span>
            <span className="block text-[11px] font-bold mt-0.5 whitespace-nowrap">{r.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function Filters({ value, onChange, counts }) {
  const items = [['all', 'Tous'], ['missing', 'Sans prono'], ['pen', 'Pénalisés']]
  return (
    <div className="flex gap-1.5 px-5 mt-3">
      {items.map(([k, label]) => {
        const sel = value === k
        const n = counts[k]
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{ minHeight: 52 }}
            className={`flex-1 min-w-0 px-2 py-1.5 rounded-2xl border flex flex-col items-center justify-center active:scale-95 transition-all ${sel ? 'bg-white text-bg border-white' : 'bg-surface border-border'}`}
          >
            <span className={`text-xs font-bold whitespace-nowrap ${!sel && n === 0 ? 'text-muted' : ''}`}>{label}</span>
            <span className={`text-base font-black leading-tight ${!sel && n === 0 ? 'text-muted' : ''}`}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

function SearchField({ value, onChange }) {
  return (
    <div className="relative px-5 mt-3">
      <Search size={15} style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-50%)' }} className="text-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Rechercher un joueur"
        aria-label="Rechercher un joueur"
        className="w-full bg-bg border border-border rounded-xl pl-9 pr-10 text-sm placeholder:text-muted outline-none focus:border-white/30 [&::-webkit-search-cancel-button]:hidden"
        style={{ minHeight: 44 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Effacer la recherche" style={{ position: 'absolute', right: 20, top: 0, width: 44, height: 44 }} className="flex items-center justify-center text-muted">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

function Row({ p, sub, pens, dot, onOpen }) {
  return (
    <button onClick={() => onOpen(p)} style={{ minHeight: 60 }} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-surfaceHigh/50">
      <span className="text-xl leading-none shrink-0">{p.avatar}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-sm truncate" style={{ color: p.color }}>{p.name}</span>
        <span className="block text-[11px] text-muted truncate">{sub}</span>
      </span>
      {pens && (pens.changeCount > 0 || pens.lateCount > 0) && (
        <span className="flex items-center gap-1.5 shrink-0">
          {pens.changeCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold" role="img" aria-label={`${pens.changeCount} modification${pens.changeCount > 1 ? 's' : ''} pénalisée${pens.changeCount > 1 ? 's' : ''}`}>
              <RefreshCw size={13} className="text-accent shrink-0" />{pens.changeCount > 1 && <span>×{pens.changeCount}</span>}
            </span>
          )}
          {pens.lateCount > 0 && <Timer size={14} className="text-accent shrink-0" role="img" aria-label="Pronostic tardif" />}
          <span className="font-black text-xs text-accent">−{pens.total}</span>
        </span>
      )}
      <StatusDot state={dot} />
    </button>
  )
}

export default function ReglagesSuivi({
  league, players, predictions, penalties, profiles, races, drivers,
  initialRaceId, initialFilter = 'all', onBack, onRemovePenalty, renderActions,
}) {
  const [raceId, setRaceId] = useState(initialRaceId)
  const [filter, setFilter] = useState(initialFilter)
  const [query, setQuery] = useState('')
  const [openPlayerId, setOpenPlayerId] = useState(null)

  const race = races.find(r => r.id === raceId) ?? races[0] ?? null

  // Joueurs actifs de la ligue (les partis et bannis ne jouent plus)
  const list = useMemo(() => players
    .filter(p => p.active !== false)
    .map(player => {
      const identity = getProfile(profiles, player)
      return {
        id: player.id,
        raw: player,
        name: String(identity?.displayName ?? player.id),
        avatar: String(identity?.avatar ?? '🏎️'),
        color: String(identity?.color ?? NEUTRAL_COLOR),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })), [players, profiles])

  if (!race) {
    return (
      <div className="pb-6">
        <div className="px-5 pt-4 pb-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}><ChevronLeft size={18} />Réglages</button>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Suivi des GP</h1>
        </div>
        <p className="px-5 text-sm text-muted">Aucun GP pour le moment.</p>
      </div>
    )
  }

  const started = hasRaceStarted(race)
  // Les pronostics sont masqués jusqu'au départ si la règle de la ligue est active (aucune exception pour l'admin)
  const hidden = !!league?.rules?.hidePredictionsBeforeRace?.enabled && !started
  const open = race.status === 'upcoming' && !started // le GP n'a pas encore démarré : un prono peut encore arriver

  const predOf = (playerId) => predictions.find(p => p.playerId === playerId && p.raceId === race.id)
  const pensOf = (playerId) => {
    const s = summarizePenalties(penalties, playerId, race.id)
    return s.changeCount > 0 || s.lateCount > 0 ? s : null
  }

  const counts = {
    all: list.length,
    missing: list.filter(p => !predOf(p.id)).length,
    pen: list.filter(p => pensOf(p.id)).length,
  }
  const played = list.length - counts.missing

  // Le champ dépend de la liste AFFICHÉE (après le filtre, avant la recherche) : dès 8 lignes.
  // Tant qu'une recherche est en cours il reste visible, pour qu'on puisse l'effacer.
  const byFilter = list.filter(p => filter === 'all' || (filter === 'missing' && !predOf(p.id)) || (filter === 'pen' && pensOf(p.id)))
  const searchable = byFilter.length >= SEARCH_FROM || query.trim() !== ''
  const q = normalizeText(query.trim())
  const shown = q ? byFilter.filter(p => normalizeText(p.name).includes(q)) : byFilter

  const subOf = (p) => {
    const pred = predOf(p.id)
    if (!pred) return open ? 'Pas encore de prono' : 'Pas de prono'
    if (hidden) {
      const when = formatPredTime(toValidDate(pred.submittedAt))
      return `${when ? `Soumis le ${when}` : 'Prono soumis'} · masqué`
    }
    return ['P1', 'P2', 'P3'].map(pos => driverCode(drivers, pred.prediction?.[pos])).join(' · ')
  }

  const openPlayer = list.find(p => p.id === openPlayerId) ?? null

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
          <ChevronLeft size={18} />Réglages
        </button>
        <h1 className="text-2xl font-black tracking-tight leading-tight">Suivi des GP</h1>
      </div>

      <RaceStrip races={races} selected={race.id} onSelect={setRaceId} />
      <Filters value={filter} onChange={setFilter} counts={counts} />
      {searchable && <SearchField value={query} onChange={setQuery} />}

      <div className="px-5 mt-3">
        <p className="text-sm font-bold">{race.flag} GP {race.name}</p>
        <p className="text-xs text-muted mt-0.5">
          {played} sur {list.length} ont joué{hidden ? " · pronos masqués jusqu'au départ" : ''}
        </p>
        <div className="card divide-y divide-border overflow-hidden mt-3">
          {shown.length === 0
            ? <p className="p-4 text-sm text-muted">{q ? `Aucun joueur ne correspond à « ${query.trim()} ».` : 'Aucun joueur dans ce filtre pour ce GP.'}</p>
            : shown.map(p => (
              <Row
                key={p.id}
                p={p}
                sub={subOf(p)}
                pens={pensOf(p.id)}
                dot={predOf(p.id) ? 'done' : (open ? 'missing' : 'closed')}
                onOpen={() => setOpenPlayerId(p.id)}
              />
            ))}
        </div>
      </div>

      <BottomSheet isOpen={!!openPlayer} onClose={() => setOpenPlayerId(null)} title="Détail">
        {openPlayer && (
          <FicheJoueurGP
            player={openPlayer}
            race={race}
            pred={predOf(openPlayer.id)}
            penalties={penalties}
            drivers={drivers}
            hidden={hidden}
            onRemovePenalty={onRemovePenalty}
          >
            {renderActions?.({ player: openPlayer, race, pred: predOf(openPlayer.id), close: () => setOpenPlayerId(null) })}
          </FicheJoueurGP>
        )}
      </BottomSheet>
    </div>
  )
}
