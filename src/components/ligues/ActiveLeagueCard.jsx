import { Pill, AdminPill } from './LeagueHead'
import LeagueCardBody from './LeagueCardBody'

// Carte de la ligue active : tout ce qui concerne la ligue est dans UN cadre (liseré vert).
// Le corps est le même que celui d'une ligue ouverte dans la liste (LeagueCardBody) ; le
// texte de la barre « Règles et options » dit ce qu'elle cache (une flèche seule en haut
// de carte faisait croire que la carte était déjà ouverte).
export default function ActiveLeagueCard({ entry, nextRace, open, onToggle, onSettings, onLeave }) {
  const { league, isLeagueAdmin } = entry
  return (
    <div className="rounded-lg p-4 border border-green-500 bg-green-500/5">
      <h3 className="text-xl font-black leading-snug break-words">{league.name}</h3>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <Pill tone="green">Active</Pill>
        {isLeagueAdmin && <AdminPill />}
      </div>
      <div className="mt-3">
        <LeagueCardBody entry={entry} nextRace={nextRace} collapsible open={open} onToggle={onToggle} onSettings={onSettings} onLeave={onLeave} />
      </div>
    </div>
  )
}
