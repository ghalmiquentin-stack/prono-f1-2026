import { Trophy } from 'lucide-react'

// Nom de la ligue active quand le joueur n'en a qu'une : texte simple, sans
// fond, pour ne pas ressembler à un bouton (il n'ouvre rien). Il se coupe avec
// « … » seulement quand la place manque (voir HeaderBadges).
export default function ActiveLeagueBadge({ name, className = '' }) {
  if (!name) return null
  return (
    <span
      title={name}
      className={`inline-flex items-center gap-1.5 min-w-[96px] shrink-[10] text-[10px] font-bold uppercase tracking-wide text-muted ${className}`}
    >
      <Trophy size={11} className="text-gold shrink-0" />
      <span className="truncate min-w-0">{name}</span>
    </span>
  )
}
