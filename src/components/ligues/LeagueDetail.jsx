import LeagueCardBody from './LeagueCardBody'
import { PlayButton } from './LeagueParts'

// Réexports pour les écrans et maquettes qui importaient ces blocs d'ici.
export { PositionLine, PronoLine, RulesBlock } from './LeagueParts'

// Fiche d'une ligue NON active, ouverte dans « Mes autres ligues » : le même corps que la
// carte de la ligue active, avec le bouton « Jouer ici » sur la ligne de position. L'accordéon
// de la ligne montre tout d'un coup (règles, code, boutons) : pas de seconde barre à replier.
export default function LeagueDetail({ entry, nextRace, onPlay, onSettings, onLeave }) {
  return (
    <div>
      <LeagueCardBody
        entry={entry}
        nextRace={nextRace}
        positionAction={<PlayButton name={entry.league.name} onClick={onPlay} />}
        onSettings={onSettings}
        onLeave={onLeave}
      />
    </div>
  )
}
