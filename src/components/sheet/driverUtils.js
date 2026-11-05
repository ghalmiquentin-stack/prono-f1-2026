import { driverKey } from '../../utils/sheetStats'
import { getTeamColor, getDriverTeam } from '../../data/drivers'

// Retrouve un pilote de la collection Firestore `drivers` à partir du nom
// enregistré dans un pronostic ou un résultat (nom d'affichage ou nom de famille).
export function findDriver(drivers, name) {
  if (!name || !drivers?.length) return null
  const lower = name.toLowerCase()
  return drivers.find(d => driverKey(d) === name)
    ?? drivers.find(d => d.last_name?.toLowerCase() === lower)
    ?? null
}

// « Red Bull Racing » -> « Red Bull », « Haas F1 Team » -> « Haas »
export function shortTeam(name) {
  return (name ?? '').replace(/ Racing$/i, '').replace(/ F1 Team$/i, '').trim()
}

function normColor(c) {
  if (!c) return null
  return c.startsWith('#') ? c : `#${c}`
}

// Photo, écurie (nom court) et couleur d'écurie d'un pilote, avec repli sur
// les données statiques quand la collection n'est pas chargée.
export function resolveDriver(drivers, name) {
  const d = findDriver(drivers, name)
  return {
    photo: d?.headshot_url ?? null,
    team: d?.team_name ? shortTeam(d.team_name) : (getDriverTeam(name)?.name ?? ''),
    color: normColor(d?.team_colour) ?? getTeamColor(name),
  }
}
