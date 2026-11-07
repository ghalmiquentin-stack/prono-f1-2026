import { ArrowRight, Settings, LogOut } from 'lucide-react'
import { ordinal } from '../../utils/sheetStats'
import { gapLabel, leagueRuleLines, PRONO_TEXT } from '../../utils/leagueSummary'
import StatusDot from './StatusDot'
import InviteCode from './InviteCode'

// Position sur une ligne : « 2e sur 4 joueurs · 118 pts », puis l'écart en petit.
// `action` : bouton optionnel à droite (« Jouer ici » sur une ligue non active).
export function PositionLine({ entry, action = null }) {
  const { rank, total, playerCount, gap, color } = entry
  const label = gapLabel(gap)
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {rank != null ? (
          <p className="text-base">
            <span className="font-black">{ordinal(rank)}</span>
            <span className="text-muted"> sur {playerCount} joueur{playerCount !== 1 ? 's' : ''} · </span>
            <span className="font-black" style={{ color }}>{total} pts</span>
          </p>
        ) : (
          <p className="text-base text-muted">{playerCount} joueur{playerCount !== 1 ? 's' : ''}</p>
        )}
        {label && <p className="text-xs text-muted mt-0.5">{label}</p>}
      </div>
      {action}
    </div>
  )
}

function PlayButton({ name, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Jouer dans ${name}`}
      className="h-11 px-3.5 rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0 bg-accent border border-accent text-white shadow-glow-red-sm active:opacity-80 transition-opacity"
    >
      Jouer ici<ArrowRight size={16} />
    </button>
  )
}

// Fiche d'une ligue. `hero` : fiche de la ligue active (la position est affichée
// au-dessus, hors de la carte). Les actions dépendent du rôle DANS cette ligue :
// « Réglages » pour un admin de la ligue, « Quitter » pour tous.
export default function LeagueDetail({ entry, nextRace, hero = false, onPlay, onSettings, onLeave }) {
  const { league, isLeagueAdmin, prono } = entry
  const tone = prono === 'done' ? 'text-green-400' : prono === 'closed' ? 'text-muted' : 'text-accent'
  return (
    <div className="space-y-4">
      {!hero && <PositionLine entry={entry} action={<PlayButton name={league.name} onClick={onPlay} />} />}
      {prono && nextRace && (
        <div className={`flex items-center gap-2 text-sm font-bold ${tone}`}>
          <StatusDot state={prono} size="w-2 h-2" />
          <span>{nextRace.flag} GP {nextRace.name} · {PRONO_TEXT[prono]}</span>
        </div>
      )}
      <div>
        <p className="text-[11px] uppercase text-muted font-bold">Règles de la ligue</p>
        <div className="divide-y divide-border/60">
          {leagueRuleLines(league).map(line => (
            <div key={line.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-xs text-muted">{line.label}</span>
              <span className={`text-xs font-bold text-right ${line.red ? 'text-accent' : 'text-white'}`}>{line.value}</span>
            </div>
          ))}
        </div>
      </div>
      <InviteCode league={league} />
      <div className="space-y-1 pt-1 border-t border-border">
        {isLeagueAdmin && (
          <button
            type="button"
            onClick={onSettings}
            className="w-full h-11 mt-3 rounded-lg border border-border bg-surfaceHigh text-sm font-bold flex items-center justify-center gap-2 active:opacity-70"
          >
            <Settings size={16} />
            Réglages de la ligue
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="w-full h-11 text-sm font-bold text-muted flex items-center justify-center gap-2 active:text-accent transition-colors"
        >
          <LogOut size={16} />
          Quitter la ligue
        </button>
      </div>
    </div>
  )
}
