import { useEffect, useRef, useState } from 'react'
import { Trophy, ChevronDown, Check } from 'lucide-react'

// Pastille de la ligue active quand le joueur en a plusieurs : elle ouvre un
// menu pour changer de ligue (nom en entier, ligue active en haut avec un repère,
// les autres par ordre alphabétique, qui défilent au-delà de 5) et un lien vers
// « Mes ligues » toujours visible en bas. Changer de ligue ne quitte pas l'écran courant.
// `onManage` absent : pas de lien « Gérer mes ligues » (utilisé par la page Règles,
// où le menu ne sert qu'à consulter). `markedLeagueId` : ligue qui porte la
// mention « Active » (la ligue active de l'application, quand la ligue cochée
// est une ligue simplement consultée).
export default function LeagueSwitcher({ activeLeagueId, activeName, options, onSelect, onManage, markedLeagueId }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (leagueId) => {
    setOpen(false)
    if (leagueId !== activeLeagueId) onSelect?.(leagueId)
  }

  const activeOption = options.find(o => o.id === activeLeagueId)
  const otherOptions = options.filter(o => o.id !== activeLeagueId)

  const renderItem = ({ id, name }) => {
    const isActive = id === activeLeagueId
    return (
      <button
        key={id}
        type="button"
        role="menuitemradio"
        aria-checked={isActive}
        onClick={() => choose(id)}
        className={`flex w-full min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-bold normal-case tracking-normal text-white ${
          isActive ? 'bg-green-500/10' : 'hover:bg-white/5'
        }`}
      >
        <span className="w-4 shrink-0 text-green-500">{isActive && <Check size={16} />}</span>
        <span className="min-w-0 break-words">{name}</span>
        {id === markedLeagueId && (
          <span className="ml-auto shrink-0 pl-2 text-[10px] font-bold uppercase tracking-wide text-muted">Active</span>
        )}
      </button>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-[96px] shrink-[10]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ligue active : ${activeName}. Changer de ligue`}
        title={activeName}
        className="relative flex w-full items-center gap-1.5 rounded-full border border-border bg-surfaceHigh px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted active:scale-95 transition-transform after:absolute after:-inset-y-2.5 after:inset-x-0"
      >
        <Trophy size={11} className="text-gold shrink-0" />
        <span className="truncate min-w-0">{activeName}</span>
        <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 z-30 w-[290px] max-w-[calc(100vw-40px)] rounded-xl border border-border bg-surfaceHigh p-1.5 shadow-lg"
        >
          {/* Ligue active toujours en haut (hors zone qui défile), puis les
              autres par ordre alphabétique (ordre reçu des options). */}
          {activeOption && renderItem(activeOption)}
          {activeOption && otherOptions.length > 0 && <div className="my-1.5 mx-1 border-t border-border" />}
          {otherOptions.length > 0 && (
            <div className="max-h-[220px] overflow-y-auto">
              {otherOptions.map(renderItem)}
            </div>
          )}
          {onManage && (
            <>
              <div className="my-1.5 mx-1 border-t border-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onManage() }}
                className="flex w-full min-h-[44px] items-center rounded-lg px-2.5 text-left text-xs font-semibold normal-case tracking-normal text-muted hover:text-white"
              >
                Gérer mes ligues →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
