import { LogOut } from 'lucide-react'

// « Quitter la ligue » : icône de sortie et texte clair, sans contour (retouche du 23 nov. 2026).
// Discret mais reconnaissable ; la confirmation (feuille LeaveLeagueSheet) reste celle d'avant.
export default function LeaveLeagueButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-sm font-bold text-white/80 flex items-center justify-center gap-2 active:opacity-70"
      style={{ minHeight: 44 }}
    >
      <LogOut size={16} className="shrink-0" />
      Quitter la ligue
    </button>
  )
}
