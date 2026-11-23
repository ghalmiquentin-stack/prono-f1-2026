import { Loader2, WifiOff } from 'lucide-react'

// Puce d'état d'un pronostic dont le serveur n'a pas encore confirmé la réception (Accueil, Courses).
// `level` : 'sending' | 'slow' (envoi en cours, gris avec une roue) | 'stuck' (pas encore reçu, rouge).
export default function SendChip({ level }) {
  if (level === 'stuck') {
    return (
      <span className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-accent">
        <WifiOff size={12} aria-hidden="true" />Pas encore reçu
      </span>
    )
  }
  return (
    <span className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-white/80">
      <Loader2 size={12} className="animate-spin" aria-hidden="true" />Envoi en cours
    </span>
  )
}
