import { ShieldCheck } from 'lucide-react'

// Bouton « Gérer la ligue » (admin de la ligue) : ouvre l'écran d'administration de la ligue
// (suivi des GP, interventions sur les pronos et pénalités, joueurs, nom et règles).
// Gris compact, bouclier comme la pastille « Admin » : on ne parle plus de « Réglages ».
export default function ManageLeagueButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border border-border bg-surfaceHigh text-sm font-bold flex items-center justify-center gap-2 px-3 active:opacity-70 ${className}`}
      style={{ minHeight: 44 }}
    >
      <ShieldCheck size={16} className="shrink-0" />
      <span className="whitespace-nowrap">Gérer la ligue</span>
    </button>
  )
}
