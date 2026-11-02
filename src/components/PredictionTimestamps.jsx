import { Clock } from 'lucide-react'
import { getModificationCount } from '../utils/predictions'

// Date valide ou null — jamais d'exception (Timestamp Firestore, Date, nombre,
// chaîne ISO ; tout le reste, y compris un objet dont toDate() lève, donne null).
function toValidDate(ts) {
  if (!ts) return null
  try {
    const date = ts?.toDate?.() ?? new Date(ts)
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

// "22h24" — à la minute, jamais à la seconde (l'horloge d'un appareil n'a pas
// cette précision). Pas de fuseau imposé : celui de l'appareil du joueur.
function formatHourMinute(date) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${h}h${m}`
}

// "sam. 31 oct. à 22h24" — format historique de la carte « Soumis le … » de
// l'Accueil (déplacé ici tel quel pour être partagé). Retourne null si la date
// est absente ou illisible.
export function formatPredTime(ts) {
  const date = toValidDate(ts)
  if (!date) return null
  try {
    const datePart = date.toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const parts = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date)
    const h = parts.find(p => p.type === 'hour')?.value ?? '00'
    const m = parts.find(p => p.type === 'minute')?.value ?? '00'
    return `${datePart} à ${h}h${m}`
  } catch {
    return null
  }
}

const eventMs = (pen) => {
  const d = toValidDate(pen?.eventTime) ?? toValidDate(pen?.createdAt)
  return d ? d.getTime() : 0
}

/**
 * Horodatages d'un pronostic, visibles de tous les joueurs de la ligue après le
 * départ de la course. Trois familles de lignes, toutes à la minute :
 *   1. « Soumis le sam. 31 oct. à 22h24 »            (submittedAt, horloge de l'appareil)
 *   2. « Dernière modification à 23h13 (N fois) »    (modifiedAt, horloge de l'appareil)
 *   3. « Pénalité tardive à 22h24 » / « Pénalité de modification à 23h13 »
 *      (pénalités du joueur sur cette course, sans montant : il est déjà
 *      affiché à côté des points ; l'heure — celle du serveur — n'apparaît
 *      que pour source === 'auto' avec un eventTime valide, sinon le type seul)
 *
 * Cohérence : s'il existe une pénalité automatique 'late' (resp. 'change'), les
 * lignes 1 (resp. 2) sont masquées — l'heure serveur fait foi, pas celle de
 * l'appareil. updatedAt n'est jamais affiché (il change à chaque écriture,
 * déverrouillage admin compris). Le montant affiché est celui du document de
 * pénalité. Tout champ absent ou invalide donne simplement « rien » : le
 * composant ne lève jamais.
 *
 * `penalties` = pénalités de la ligue (déjà filtrées par ligue par la requête) ;
 * le composant ne garde que celles de (playerId, raceId).
 */
export default function PredictionTimestamps({ prediction, penalties, playerId, raceId, className = '' }) {
  try {
    const pens = (Array.isArray(penalties) ? penalties : [])
      .filter(p => p && p.playerId === playerId && p.raceId === raceId)
      .sort((a, b) => eventMs(a) - eventMs(b))

    const hasAutoLate = pens.some(p => p.source === 'auto' && p.type === 'late')
    const hasAutoChange = pens.some(p => p.source === 'auto' && p.type === 'change')

    const submitted = hasAutoLate ? null : formatPredTime(prediction?.submittedAt)

    const modCount = getModificationCount(prediction)
    const modifiedDate = toValidDate(prediction?.modifiedAt)
    const modified = !hasAutoChange && modCount > 0 && modifiedDate
      ? `Dernière modification à ${formatHourMinute(modifiedDate)} (${modCount} fois)`
      : null

    const penaltyLines = pens.map(pen => {
      const label = pen.type === 'late' ? 'Pénalité tardive'
        : pen.type === 'change' ? 'Pénalité de modification'
        : 'Pénalité'
      const serverDate = pen.source === 'auto' ? toValidDate(pen.eventTime) : null
      const suffix = serverDate ? ` à ${formatHourMinute(serverDate)}` : ''
      return { id: pen._id ?? pen.id ?? `${pen.type}-${eventMs(pen)}`, text: `${label}${suffix}` }
    })

    if (!submitted && !modified && penaltyLines.length === 0) return null

    return (
      <div className={`space-y-0.5 ${className}`}>
        {submitted && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock size={12} className="shrink-0" />
            Soumis le {submitted}
          </p>
        )}
        {modified && (
          <p className="text-xs text-muted pl-[16px]">{modified}</p>
        )}
        {penaltyLines.map(line => (
          <p key={line.id} className="text-xs text-muted pl-[16px]">{line.text}</p>
        ))}
      </div>
    )
  } catch {
    return null
  }
}
