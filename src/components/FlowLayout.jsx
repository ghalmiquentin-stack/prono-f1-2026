import { ChevronLeft, X } from 'lucide-react'

// Cadre commun des parcours en plusieurs étapes (Créer une ligue, Rejoindre une ligue) :
// barre du haut (Retour à gauche si on n'est pas à la première étape, croix à droite),
// segments de progression, contenu qui défile, et un pied fixe avec le bouton principal.
// Plein écran, sans barre de navigation du bas : on est au milieu d'une action.
export default function FlowLayout({ step, count, onBack, onClose, footer, children, hideProgress = false }) {
  return (
    <div className="h-[100dvh] bg-bg flex flex-col safe-top overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-2 shrink-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70"
            style={{ minHeight: 44 }}
          >
            <ChevronLeft size={18} />Retour
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="w-11 h-11 -mr-3 flex items-center justify-center text-muted active:opacity-70"
        >
          <X size={20} />
        </button>
      </div>

      {!hideProgress && <div className="px-5 shrink-0">
        <div className="flex gap-2" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i < step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mt-2">Étape {step} sur {count}</p>
      </div>}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-4">
        {children}
      </div>

      <div className="shrink-0 px-5 pt-3 bg-bg border-t border-border pb-[max(12px,env(safe-area-inset-bottom))]">
        {footer}
      </div>
    </div>
  )
}

// Bouton principal du pied (même style que « Enregistrer » des Réglages de ligue).
export function FlowButton({ enabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`w-full rounded-xl font-black text-base transition-all ${
        enabled ? 'bg-accent text-white shadow-glow-red active:scale-95' : 'bg-surfaceHigh text-muted cursor-not-allowed'
      }`}
      style={{ minHeight: 48 }}
    >
      {children}
    </button>
  )
}
