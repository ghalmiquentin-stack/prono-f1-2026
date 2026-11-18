import { ChevronRight } from 'lucide-react'

// Ligne d'une liste de réglages (même forme que les entrées de Réglages de ligue) : tuile d'icône,
// titre, sous-titre facultatif et chevron facultatif. À placer dans une `card divide-y overflow-hidden`.
export default function EntryRow({ icon, title, sub, onClick, chevron = true, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-surfaceHigh/50 disabled:opacity-50"
      style={{ minHeight: 64 }}
    >
      <span className="w-9 h-9 rounded-lg bg-surfaceHigh flex items-center justify-center text-white shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-black text-base leading-snug">{title}</p>
        {sub && <p className="text-xs text-muted break-words">{sub}</p>}
      </div>
      {chevron && <ChevronRight size={18} className="text-muted shrink-0" />}
    </button>
  )
}
