import { ChevronDown } from 'lucide-react'
import { PositionLine, PronoLine, RulesBlock } from './LeagueParts'
import InviteCode from './InviteCode'
import ManageLeagueButton from './ManageLeagueButton'
import LeaveLeagueButton from './LeaveLeagueButton'

// Corps de fiche commun à TOUTES les ligues (la ligue active et les ligues ouvertes dans
// la liste), pour que l'affichage soit identique partout :
//   position (et bouton « Jouer ici » sur une ligue non active), état du pronostic,
//   code d'invitation (Copier, Partager), règles de la ligue, puis « Quitter la ligue ».
// `collapsible` : seule la ligue active replie les règles derrière la barre « Règles de la ligue » ;
// son bouton « Gérer la ligue » est dans l'en-tête de la carte (ActiveLeagueCard), toujours visible.
// Une ligue non active, déjà ouverte par son accordéon, montre les règles et, pour un admin,
// « Gérer la ligue » en pleine largeur. « Quitter la ligue » est toujours visible en bas.
export default function LeagueCardBody({ entry, nextRace, positionAction = null, collapsible = false, open = true, onToggle, onSettings, onLeave }) {
  const { league, isLeagueAdmin } = entry
  const panelId = `rules-${league._id}`
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
          className="w-full min-h-[44px] mt-3 pt-1 flex items-center justify-between border-t border-border/60 active:opacity-70"
        >
          <span className="text-sm font-bold">{open ? 'Masquer les règles' : 'Règles de la ligue'}</span>
          <ChevronDown size={20} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {(!collapsible || open) && (
        <div id={panelId} className={`${collapsible ? 'mt-3' : 'mt-4'} space-y-4`}>
          <RulesBlock league={league} />
          {isLeagueAdmin && !collapsible && <ManageLeagueButton onClick={onSettings} className="w-full" />}
        </div>
      )}
      <div className={`${collapsible ? 'mt-1' : 'mt-4'} pt-1 border-t border-border/60`}>
        <LeaveLeagueButton onClick={onLeave} />
      </div>
    </>
  )
}
