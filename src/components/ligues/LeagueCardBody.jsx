import { ChevronDown, Settings, LogOut } from 'lucide-react'
import { PositionLine, PronoLine, RulesBlock } from './LeagueParts'
import InviteCode from './InviteCode'

// Corps de fiche commun à TOUTES les ligues (la ligue active et les ligues ouvertes dans
// la liste), pour que l'affichage soit identique partout :
//   position (et bouton « Jouer ici » sur une ligue non active), état du pronostic,
//   code d'invitation (Copier, Partager), règles de la ligue, puis les boutons Réglages
//   (admin de la ligue) et Quitter côte à côte.
// `collapsible` : seule la ligue active replie les règles et les boutons derrière la barre
// « Règles et options ». Une ligue non active, déjà ouverte par son accordéon, montre tout.
export default function LeagueCardBody({ entry, nextRace, positionAction = null, collapsible = false, open = true, onToggle, onSettings, onLeave }) {
  const { league, isLeagueAdmin } = entry
  const panelId = `options-${league._id}`
  return (
    <>
      <PositionLine entry={entry} action={positionAction} />
      <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
        <PronoLine entry={entry} nextRace={nextRace} />
        <InviteCode league={league} />
      </div>
      {collapsible && (
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
      )}
      {(!collapsible || open) && (
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
    </>
  )
}
