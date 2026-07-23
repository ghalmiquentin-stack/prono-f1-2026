import { Trophy } from 'lucide-react'

export default function ActiveLeagueBadge({ name, className = '' }) {
  if (!name) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted bg-surfaceHigh px-2.5 py-1 rounded-full ${className}`}
    >
      <Trophy size={11} className="text-gold shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}
