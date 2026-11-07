import { ChevronDown, Settings, LogOut } from 'lucide-react'
import { Pill, AdminPill } from './LeagueHead'
import { PositionLine, PronoLine, RulesBlock } from './LeagueDetail'
import InviteCode from './InviteCode'

// Carte de la ligue active : tout ce qui concerne la ligue est dans UN cadre (liseré vert).
// Toujours visibles : nom, rôle, position, état du pronostic et code d'invitation (Copier,
// Partager). La barre « Règles et options » déplie les règles et les boutons Réglages
// (admin de la ligue) et Quitter. Le texte de la barre dit ce qu'elle cache : une flèche
// seule en haut de carte faisait croire que la carte était déjà ouverte.
export default function ActiveLeagueCard({ entry, nextRace, open, onToggle, onSettings, onLeave }) {
  const { league, isLeagueAdmin } = entry
  const panelId = `options-${league._id}`
  return (
    <div className="rounded-lg p-4 border border-green-500 bg-green-500/5">
      <h3 className="text-xl font-black leading-snug break-words">{league.name}</h3>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <Pill tone="green">Active</Pill>
        {isLeagueAdmin && <AdminPill />}
      </div>
      <div className="mt-3">
        <PositionLine entry={entry} />
      </div>
      <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
        <PronoLine entry={entry} nextRace={nextRace} />
        <InviteCode league={league} />
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-[44px] mt-3 -mb-1 pt-1 flex items-center justify-between border-t border-border/60 active:opacity-70"
      >
        <span className="text-sm font-bold">{open ? 'Masquer les règles et options' : 'Règles et options'}</span>
        <ChevronDown size={20} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} className="mt-4 space-y-4">
          <RulesBlock league={league} />
          <div className="flex gap-2 pt-1 border-t border-border/60">
            {isLeagueAdmin && (
              <button
                type="button"
                onClick={onSettings}
                className="flex-1 h-11 mt-3 rounded-lg border border-border bg-surfaceHigh text-sm font-bold flex items-center justify-center gap-2 active:opacity-70"
              >
                <Settings size={16} />
                Réglages
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="flex-1 h-11 mt-3 rounded-lg border border-border text-sm font-bold text-muted flex items-center justify-center gap-2 active:text-accent transition-colors"
            >
              <LogOut size={16} />
              Quitter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
