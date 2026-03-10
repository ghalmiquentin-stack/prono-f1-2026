export const TEAMS = [
  {
    name: 'McLaren',
    color: '#FF8000',
    drivers: ['Norris', 'Piastri'],
  },
  {
    name: 'Mercedes',
    color: '#00D2BE',
    drivers: ['Russell', 'Antonelli'],
  },
  {
    name: 'Red Bull',
    color: '#3671C6',
    drivers: ['Verstappen', 'Hadjar'],
  },
  {
    name: 'Ferrari',
    color: '#E8002D',
    drivers: ['Hamilton', 'Leclerc'],
  },
  {
    name: 'Aston Martin',
    color: '#358C75',
    drivers: ['Alonso', 'Stroll'],
  },
  {
    name: 'Alpine',
    color: '#0093CC',
    drivers: ['Gasly', 'Colapinto'],
  },
  {
    name: 'Williams',
    color: '#64C4FF',
    drivers: ['Sainz', 'Albon'],
  },
  {
    name: 'Racing Bulls',
    color: '#6692FF',
    drivers: ['Lawson', 'Lindblad'],
  },
  {
    name: 'Haas',
    color: '#B6BABD',
    drivers: ['Bearman', 'Ocon'],
  },
  {
    name: 'Audi',
    color: '#C0C0C0',
    drivers: ['Hülkenberg', 'Bortoleto'],
  },
  {
    name: 'Cadillac',
    color: '#00694E',
    drivers: ['Bottas', 'Pérez'],
  },
]

export const DRIVERS = TEAMS.flatMap(t => t.drivers)

export const DRIVER_TEAM = Object.fromEntries(
  TEAMS.flatMap(t => t.drivers.map(d => [d, t]))
)

export function getDriverTeam(driverName) {
  return DRIVER_TEAM[driverName] ?? null
}

export function getTeamColor(driverName) {
  return DRIVER_TEAM[driverName]?.color ?? '#6B6B8A'
}
