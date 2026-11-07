import { PRONO_TEXT } from '../../utils/leagueSummary'

// Point d'état du pronostic, identique à celui de l'Accueil (carte Prochain GP) :
// vert = soumis, rouge qui pulse = pas encore de prono, gris = pas de prono
// (la course a démarré). `state` null : rien à afficher.
export default function StatusDot({ state, size = 'w-2.5 h-2.5' }) {
  if (!state) return null
  const color = state === 'done' ? 'bg-green-500' : state === 'closed' ? 'bg-muted' : 'bg-accent animate-pulse'
  return <span role="img" aria-label={PRONO_TEXT[state]} className={`inline-block rounded-full shrink-0 ${size} ${color}`} />
}
