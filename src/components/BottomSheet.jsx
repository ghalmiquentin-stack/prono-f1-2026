import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Hauteur de la barre de navigation du bas (BottomNav, z-50) qui recouvre le
// bas de toute feuille : un pied fixe doit se poser juste au-dessus.
const NAV_HEIGHT = 71

// Options facultatives (la feuille se comporte comme avant sans elles) :
//   bare        pas de bandeau de titre : une croix de fermeture flotte en haut à droite
//   header      bloc fixe sous la poignée (ne défile pas), ex. en-tête du choix du pilote
//   footer      bloc fixe posé au-dessus de la barre de navigation (ex. bouton Valider)
//   fixedHeight la feuille occupe toute sa hauteur (nécessaire pour ancrer le pied fixe)
export default function BottomSheet({
  isOpen, onClose, title, children, fullHeight = false,
  bare = false, header = null, footer = null, fixedHeight = false,
}) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const main = document.getElementById('app-main')
    if (isOpen) {
      if (main) main.style.overflow = 'hidden'
    } else {
      if (main) main.style.overflow = ''
    }
    return () => { if (main) main.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const heightClass = fixedHeight ? 'h-[90svh]' : fullHeight ? 'max-h-[90svh]' : 'max-h-[80svh]'

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`
          relative bg-surface rounded-t-2xl border-t border-border
          animate-slide-up
          ${heightClass}
          flex flex-col
        `}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        {bare && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-2.5 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-surfaceHigh text-muted hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}
        {header && <div className="shrink-0">{header}</div>}
        {!bare && !header && title && (
          <div className="flex items-center justify-between px-5 pb-3 shrink-0 border-b border-border">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surfaceHigh text-muted hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className={`overflow-y-auto flex-1 ${footer ? '' : 'pb-safe'}`} style={footer ? { paddingBottom: NAV_HEIGHT + 84 } : undefined}>
          {children}
        </div>

        {/* Pied fixe, au-dessus de la barre de navigation */}
        {footer && (
          <div className="absolute inset-x-0 bg-surface border-t border-border" style={{ bottom: NAV_HEIGHT }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
