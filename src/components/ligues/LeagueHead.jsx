import { Crown, ChevronDown } from 'lucide-react'
import { ordinal } from '../../utils/sheetStats'
import StatusDot from './StatusDot'

export function Pill({ children, tone = 'neutral', icon = null }) {
  const tones = {
    neutral: 'bg-surfaceHigh text-muted',
    green: 'bg-green-500/20 text-green-400',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${tones[tone]}`}>
      {icon}{children}
    </span>
  )
}

export const AdminPill = () => <Pill icon={<Crown size={11} />}>Admin</Pill>

// Ligne d'une ligue pliée (ou ouverte) dans « Mes autres ligues » : nom, position
// en petit, puis à droite la couronne (admin), le point d'état du pronostic et le
// chevron. Une ligne ouverte ne répète pas la position, la fiche la donne.
export default function LeagueHead({ entry, open, onToggle }) {
  const { league, rank, total, playerCount, isLeagueAdmin, prono, color } = entry
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center gap-3 min-h-[52px] py-2 text-left active:opacity-70"
    >
      <div className="min-w-0 flex-1">
        <p className="font-black text-base leading-snug break-words">{league.name}</p>
        {!open && (
          <p className="text-xs mt-1">
            {rank != null ? (
              <>
                <span className="font-bold">{ordinal(rank)}</span>
                <span className="text-muted"> sur {playerCount} · </span>
                <span className="font-bold" style={{ color }}>{total} pts</span>
              </>
            ) : (
              <span className="text-muted">{playerCount} joueur{playerCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {isLeagueAdmin && <Crown size={16} aria-label="Admin" className="text-muted" />}
        {!open && <StatusDot state={prono} />}
        <ChevronDown size={20} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
    </button>
  )
}
