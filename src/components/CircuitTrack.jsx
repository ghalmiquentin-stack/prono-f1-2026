import { CIRCUIT_TRACKS } from '../data/circuitTracks'

// Tracé blanc du circuit d'une course (clé : race.name). Purement décoratif :
// le nom du GP est toujours écrit à côté. Rend null si le circuit est inconnu.
export default function CircuitTrack({ race, size = 108, className = '' }) {
  const track = race && CIRCUIT_TRACKS[race.name]
  if (!track) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d={track.d}
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
