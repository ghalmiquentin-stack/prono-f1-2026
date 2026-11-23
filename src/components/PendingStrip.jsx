import { useEffect, useRef } from 'react'
import { Loader2, WifiOff, X } from 'lucide-react'
import { levelOf } from '../utils/pendingPredictions'
import { usePendingClock } from '../hooks/usePendingPredictions'

// Hauteur de la barre de navigation du bas (BottomNav) : le bandeau se pose juste au-dessus.
const NAV_HEIGHT = 71

// Ordre d'importance : un prono perdu ou refusé prime sur un envoi encore en cours.
function pickGroup(entries) {
  for (const status of ['lost', 'rejected', 'pending']) {
    const items = entries.filter(e => e.status === status)
    if (items.length) return { status, items }
  }
  return null
}

// Bandeau global, au-dessus de la barre du bas, visible sur tous les écrans : dit à tout moment où en est le
// pronostic (envoi en cours, pas encore enregistré, refusé, perdu), pour TOUTES les ligues du joueur.
// Il passe sous les feuilles (z-30 < z-40) : une feuille ouverte porte déjà l'information dans son pied.
//   entries     entrées du registre (compte connecté)
//   leagues     ligues du joueur [{ id, name }] : le nom de la ligue n'est affiché que s'il y en a plusieurs
//   onRedo      « Refaire » : (entrée) => void
//   onDismiss   ferme le bandeau : (clés) => void
//   onHeight    hauteur occupée (px, 0 si absent), pour garder le bas des écrans visible
export default function PendingStrip({ entries, leagues, onRedo, onDismiss, onHeight }) {
  const group = pickGroup(entries)
  const now = usePendingClock(group?.status === 'pending')
  const ref = useRef(null)

  useEffect(() => {
    if (!onHeight) return undefined
    if (!group || !ref.current) { onHeight(0); return undefined }
    const el = ref.current
    const report = () => onHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [group?.status, group?.items.length, onHeight])

  if (!group) return null

  const multi = leagues.length > 1
  const n = group.items.length
  const nameOf = (id) => leagues.find(l => l.id === id)?.name ?? 'Ligue'
  const names = group.items.map(e => nameOf(e.leagueId)).join(', ')
  const first = group.items[0]
  const suffix = multi && n === 1 ? ` · ${nameOf(first.leagueId)}` : ''
  const list = multi && n > 1 ? <span className="block text-white/70 mt-0.5">{names}</span> : null
  const stuck = group.status === 'pending' && group.items.some(e => levelOf(now - e.startedAt) === 'stuck')
  const base = 'fixed left-0 right-0 z-30 px-4 py-2.5 flex items-center gap-2.5 border-t text-[12.5px] leading-snug'
  const red = { bottom: NAV_HEIGHT, background: '#2B1620' }
  const dismissKeys = group.items.map(e => e.key)
  const closeBtn = (
    <button onClick={() => onDismiss(dismissKeys)} className="shrink-0 w-11 h-11 -my-2 -mr-3 flex items-center justify-center text-white/70" aria-label="Fermer le message">
      <X size={16} />
    </button>
  )

  if (group.status === 'pending' && !stuck) {
    return (
      <div ref={ref} role="status" className={`${base} bg-surface border-white/25`} style={{ bottom: NAV_HEIGHT }}>
        <Loader2 size={16} className="animate-spin shrink-0 text-white/80" aria-hidden="true" />
        <span className="flex-1 text-white/90">
          <b className="font-black">{n > 1 ? `Envoi de ${n} pronos en cours` : `Envoi de ton prono en cours${suffix}`}.</b> Reste sur l'application.{list}
        </span>
      </div>
    )
  }

  if (group.status === 'pending') {
    return (
      <div ref={ref} role="status" className={`${base} border-accent/60`} style={red}>
        <WifiOff size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1">
          <b className="font-black">{n > 1 ? `${n} pronos pas encore enregistrés` : `Prono pas encore enregistré${suffix}`}.</b>{' '}
          Garde l'application ouverte, {n > 1 ? 'ils partiront' : 'il partira'} dès que la connexion revient.{list}
        </span>
      </div>
    )
  }

  if (group.status === 'rejected') {
    const reason = first.reason === 'started' ? "Le Grand Prix a commencé pendant l'envoi." : "Le serveur a refusé l'envoi."
    const title = n > 1 ? `${n} pronos non enregistrés` : first.isModification ? `Modification non enregistrée${suffix}` : `Prono non enregistré${suffix}`
    return (
      <div ref={ref} role="alert" className={`${base} border-accent/60`} style={red}>
        <X size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1"><b className="font-black">{title}.</b> {reason}{list}</span>
        {closeBtn}
      </div>
    )
  }

  // lost : l'application s'est fermée avant que le serveur reçoive le prono.
  const title = n > 1
    ? `${n} pronos n'ont pas été enregistrés`
    : first.isModification ? `Ta modification n'a pas été enregistrée${suffix}` : `Ton prono n'a pas été enregistré${suffix}`
  const canRedo = n >= 1 && Number.isFinite(first.raceStartMs) && Date.now() < first.raceStartMs
  return (
    <div ref={ref} role="alert" className={`${base} border-accent/60`} style={red}>
      <WifiOff size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="flex-1"><b className="font-black">{title}.</b> L'application s'est fermée avant l'envoi.{list}</span>
      {canRedo && (
        <button onClick={() => onRedo(first)} className="shrink-0 bg-accent text-white font-bold rounded-lg px-3 min-h-[36px] text-xs">Refaire</button>
      )}
      {closeBtn}
    </div>
  )
}
