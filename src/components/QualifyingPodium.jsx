import { getDriverPhoto } from '../utils/drivers'

const POSITIONS = ['P1', 'P2', 'P3']
const POS_COLOR = { P1: 'text-gold', P2: 'text-silver', P3: 'text-bronze' }

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
 * Bande « Podium des qualifications » de la carte « Prochain GP » (Accueil),
 * placée sous la ligne d'heure locale du départ. Le libellé dit « podium » car
 * le classement OpenF1 est le classement brut des qualifications, sans
 * pénalités de grille. Les libellés P1/P2/P3 reprennent le style des cartes de
 * pronostic (couleur or/argent/bronze au-dessus de la photo).
 *
 * `podium` vient de getQualifyingPodium (validé). Aucun hook ici.
 */
export default function QualifyingPodium({ podium, drivers }) {
  if (!Array.isArray(podium) || podium.length !== POSITIONS.length) return null
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-white/80 text-center">🏁 Podium des qualifications</p>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {podium.map(({ pos, name, time }) => {
          const photoUrl = getDriverPhoto(drivers, name)
          return (
            <div key={pos} className="flex flex-col items-center gap-1 p-1.5 card-elevated rounded-lg min-w-0">
              <div className={`text-[10px] font-bold leading-none ${POS_COLOR[pos]}`}>{pos}</div>
              <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surfaceHigh flex items-center justify-center text-xs font-bold text-muted">
                {photoUrl
                  ? <img src={photoUrl} alt="" className="w-full h-full object-cover object-top" />
                  : <span>{name[0] ?? '?'}</span>
                }
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
