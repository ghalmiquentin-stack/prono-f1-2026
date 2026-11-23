import { Pill, AdminPill } from './LeagueHead'
import LeagueCardBody from './LeagueCardBody'
import ManageLeagueButton from './ManageLeagueButton'

// Carte de la ligue active : une carte neutre comme les autres (le cadre vert était trop criard,
// retouche du 23 nov. 2026) ; seule la pastille « Active » reste verte. Le bouton « Gérer la ligue »
// (admin seulement) est dans l'en-tête, visible sans rien déplier. Le corps est le même que celui
// d'une ligue ouverte dans la liste (LeagueCardBody) ; le texte de la barre « Règles de la ligue »
// dit ce qu'elle cache (une flèche seule en haut de carte faisait croire que la carte était
// déjà ouverte).
export default function ActiveLeagueCard({ entry, nextRace, open, onToggle, onSettings, onLeave }) {
  const { league, isLeagueAdmin } = entry
  return (
    <div className="card p-4">
      {/* Le bouton passe sous le nom quand l'écran est trop étroit pour garder au moins 140 px au titre */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div className="min-w-0" style={{ flex: '1 1 140px' }}>
          <h3 className="text-xl font-black leading-snug break-words">{league.name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <Pill tone="green">Active</Pill>
            {isLeagueAdmin && <AdminPill />}
          </div>
        </div>
        {isLeagueAdmin && <ManageLeagueButton onClick={onSettings} />}
      </div>
      <div className="mt-3">
        <LeagueCardBody entry={entry} nextRace={nextRace} collapsible open={open} onToggle={onToggle} onLeave={onLeave} />
      </div>
    </div>
  )
}
