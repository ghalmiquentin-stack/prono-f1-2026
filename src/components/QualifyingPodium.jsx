import { Clock } from 'lucide-react'
import { getDriverPhoto } from '../utils/drivers'

const POSITIONS = ['P1', 'P2', 'P3']
const POS_BG    = { P1: 'bg-gold',   P2: 'bg-silver',   P3: 'bg-bronze'   }

/**
 * Podium des qualifications (races.qualifying) sous forme de 3 entrées
 * { pos, name, time }, ou null si P1, P2 ou P3 n'a pas de nom exploitable —
 * l'appelant n'affiche alors rien (aucun espace réservé).
 *
 * Nom et meilleur temps sont repris tels que stockés, comme dans l'onglet
 * Résultat de PredictionSheet (entry.name, entry.lap_duration). Le champ
 * `source` ('auto') n'est volontairement pas exposé : il ne sert qu'à l'admin.
 */
export function getQualifyingPodium(qualifying) {
  if (!qualifying || typeof qualifying !== 'object') return null
  const entries = []
  for (const pos of POSITIONS) {
    const entry = qualifying[pos]
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    if (!name) return null
    const time = typeof entry.lap_duration === 'string' && entry.lap_duration.trim() ? entry.lap_duration.trim() : null
    entries.push({ pos, name, time })
  }
  return entries
}

/**
 * Bande « Podium des qualifications » de la carte « Prochain GP » (Accueil).
 * Son en-tête remplace la ligne « heure locale » (`localTime`, qui est repris
 * à droite) : l'appelant n'affiche l'ancienne ligne que quand il n'y a pas de
 * podium. Le libellé dit « podium » car le classement OpenF1 est le classement
 * brut des qualifications, sans pénalités de grille.
 *
 * `podium` vient de getQualifyingPodium (validé). Aucun hook ici.
 */
export default function QualifyingPodium({ podium, drivers, localTime }) {
  if (!Array.isArray(podium) || podium.length !== POSITIONS.length) return null
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-white/80">🏁 Podium des qualifications</span>
        {localTime && (
          <span className="text-muted flex items-center gap-1.5 shrink-0">
            <Clock size={12} />
            <span className="text-white font-bold">{localTime.time}</span>
            <span className="text-[10px] text-muted">{localTime.tzAbbr}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {podium.map(({ pos, name, time }) => {
          const photoUrl = getDriverPhoto(drivers, name)
          return (
            <div key={pos} className="flex flex-col items-center gap-1 p-1.5 card-elevated rounded-lg min-w-0">
              <div className="relative">
                <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                  {photoUrl
                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                    : <span>{name[0] ?? '?'}</span>
                  }
                </div>
                <span className={`absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-bg ${POS_BG[pos]}`}>
                  {pos}
                </span>
              </div>
              <span className="text-xs font-bold text-center leading-tight truncate w-full">
                {name}
              </span>
              {time && (
                <span className="text-[10px] text-muted tabular-nums leading-none">{time}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
