import { Loader2, WifiOff } from 'lucide-react'
import { PRONO_TEXT } from '../../utils/leagueSummary'

// Point d'état du pronostic, identique à celui de l'Accueil (carte Prochain GP) :
// vert = soumis, rouge qui pulse = pas encore de prono, gris = pas de prono
// (la course a démarré). Envoi pas encore confirmé par le serveur : roue grise (« sending ») ou icône rouge
// « pas encore reçu » (« stuck »). `state` null : rien à afficher.
export default function StatusDot({ state, size = 'w-2.5 h-2.5' }) {
  if (!state) return null
  if (state === 'sending') return <Loader2 role="img" aria-label={PRONO_TEXT[state]} className="inline-block shrink-0 animate-spin text-white/80" size={12} />
  if (state === 'stuck') return <WifiOff role="img" aria-label={PRONO_TEXT[state]} className="inline-block shrink-0 text-accent" size={12} />
  const color = state === 'done' ? 'bg-green-500' : state === 'closed' ? 'bg-muted' : 'bg-accent animate-pulse'
  return <span role="img" aria-label={PRONO_TEXT[state]} className={`inline-block rounded-full shrink-0 ${size} ${color}`} />
}
