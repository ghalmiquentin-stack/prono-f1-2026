import { UserCog } from 'lucide-react'
import { toValidDate, formatHourMinute } from './PredictionTimestamps'

// « 23 nov. à 10h12 », ou null si la date est illisible.
export function formatAdminWhen(ts) {
  const date = toValidDate(ts)
  if (!date) return null
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${formatHourMinute(date)}`
}

// Mention discrète « Admin » sous le nom d'un joueur (badge A1, validé le 23 nov. 2026) : texte gris clair avec
// une petite icône, sans cadre, sur la ligne où s'affiche aussi « vous ». Pour « vous », l'icône seule suit le mot
// (sinon la ligne passerait à la ligne suivante dans la colonne de 84 px).
export function AdminMention({ isMe = false }) {
  if (isMe) return <UserCog size={11} className="inline ml-1 text-white/80 align-[-1px]" aria-label="Intervention d'un admin" />
  return (
    <span className="inline-flex items-center gap-0.5 text-white/80">
      <UserCog size={10} aria-hidden="true" />Admin
    </span>
  )
}

// Bloc de détail d'une intervention (au toucher d'une ligne, dans la fiche) : qui, quand, pourquoi, pénalité.
export default function AdminNote({ entry, className = '' }) {
  if (!entry) return null
  const when = formatAdminWhen(entry.at)
  const edit = entry.kind === 'prediction-edit'
  const penalty = entry.penaltyChoice === 'applied'
    ? `Pénalité ${edit ? 'de modification' : 'de retard'} appliquée`
    : entry.penaltyChoice === 'waived'
      ? `Pénalité ${edit ? 'de modification' : 'de retard'} non appliquée`
      : null
  return (
    <div className={`rounded-lg border border-white/30 bg-white/[0.05] p-2 space-y-1 ${className}`}>
      <p className="text-xs font-bold flex items-start gap-1.5"><UserCog size={13} className="shrink-0 mt-px" />Prono {edit ? 'corrigé' : 'saisi'} par {entry.byName || 'un admin'} (admin)</p>
      {when && <p className="text-[11px] text-muted">{when}</p>}
      {entry.motif && <p className="text-xs italic break-words">« {entry.motif} »</p>}
      {penalty && <p className="text-[11px] font-bold">{penalty}</p>}
    </div>
  )
}
