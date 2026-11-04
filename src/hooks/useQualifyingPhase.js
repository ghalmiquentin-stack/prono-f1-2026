import { useEffect, useReducer } from 'react'
import { raceStartInstant } from '../utils/races'
import { getQualifyingStartMs } from '../utils/qualifyingPenalty'

// Lecture seule : ce fichier ne sert qu'à l'affichage de la carte « Prochain GP »
// (Accueil). Il lit races.qualifyingStartAt, il n'écrit rien et n'a aucun lien
// avec le calcul des pénalités.

const DAY_MS = 24 * 60 * 60 * 1000

// Le serveur (autoFetchQualifying, toutes les 15 min) récupère l'horaire des
// qualifications quand la course est à 7 jours ou moins. L'encart « bientôt
// disponible » reste donc affiché jusqu'à 1 h après ce seuil, le temps que
// l'horaire arrive, pour ne pas disparaître puis réapparaître en compteur. Si
// l'horaire n'est toujours pas là après, on n'affiche rien plutôt qu'un
// « bientôt » qui durerait toute la semaine.
export const ANNOUNCED_UNTIL_MS = 7 * DAY_MS - 60 * 60 * 1000

// « Qualifications en cours » s'affiche au plus 2 h après le début de la
// séance (elle dure environ 1 h). Passé ce délai sans podium, on n'affiche plus
// rien plutôt qu'un « en cours » qui durerait jusqu'au dimanche.
export const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000

// Phase d'affichage des qualifications pour la carte « Prochain GP » :
//   'announced' : horaire pas encore connu, course à plus de ~7 jours ;
//   'before'    : horaire connu, séance pas commencée (compteur des qualifs) ;
//   'live'      : séance commencée depuis moins de 2 h (encart « en cours ») ;
//   'none'      : rien à montrer (course commencée, horaire absent à moins de
//                 7 jours, ou séance terminée depuis longtemps).
// Le podium (races.qualifying) n'intervient pas ici : l'appelant le teste.
export function getQualifyingPhase({ raceMs, qualifyingMs, nowMs }) {
  if (!Number.isFinite(raceMs) || nowMs >= raceMs) return 'none'
  if (qualifyingMs == null) return raceMs - nowMs > ANNOUNCED_UNTIL_MS ? 'announced' : 'none'
  if (nowMs < qualifyingMs) return 'before'
  return nowMs < qualifyingMs + LIVE_WINDOW_MS ? 'live' : 'none'
}

// setTimeout stocke son délai sur 32 bits signés : au-delà de ~24,8 jours il
// se déclenche immédiatement. Les attentes plus longues sont découpées.
const MAX_TIMER_MS = 2 ** 31 - 1

// Se déclenche juste après le seuil, jamais juste avant.
const MARGIN_MS = 50

// Même principe que useRaceTiming : la phase est calculée à chaque rendu avec
// l'horloge, le hook ne fait que programmer un nouveau rendu à chaque seuil
// (fin de l'encart « bientôt », début de la séance, fin de l'encart « en
// cours », départ de la course). Rien ne tourne chaque seconde.
export function useQualifyingPhase(race) {
  const [, rerender] = useReducer(n => n + 1, 0)
  const raceMs = race ? raceStartInstant(race).getTime() : NaN
  const qualifyingMs = getQualifyingStartMs(race)

  useEffect(() => {
    if (!Number.isFinite(raceMs)) return undefined
    const thresholds = [raceMs - ANNOUNCED_UNTIL_MS, raceMs]
    if (qualifyingMs != null) thresholds.push(qualifyingMs, qualifyingMs + LIVE_WINDOW_MS)
    let timer
    const schedule = () => {
      const now = Date.now()
      const next = Math.min(...thresholds.filter(t => t > now))
      if (!Number.isFinite(next)) return
      timer = setTimeout(() => {
        rerender()
        schedule()
      }, Math.min(next - now + MARGIN_MS, MAX_TIMER_MS))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [raceMs, qualifyingMs])

  return {
    phase: getQualifyingPhase({ raceMs, qualifyingMs, nowMs: Date.now() }),
    qualifyingMs,
  }
}
