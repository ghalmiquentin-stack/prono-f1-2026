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

// Ligne « modification » (N = modificationCount, P = pénalités automatiques de
// modification, H = heure déjà formatée). Retourne null sans heure valide.
//   N=1,P=0 : « Modifié à 23h13 »            N=1,P>=1 : « Modifié à 23h13 (pénalisée) »
//   N>1,P=0 : « Modifié 3 fois · dernière à 23h31 »
//   N>1,0<P<N : « Modifié 3 fois (1 pénalisée) · dernière à 23h31 » / « (2 pénalisées) »
//   N>1,P>=N : « Modifié 3 fois (toutes pénalisées) · dernière à 23h31 »
export function formatModifiedLine(count, penalizedCount, hourMinute) {
  if (!(count > 0) || !hourMinute) return null
  if (count === 1) {
    return penalizedCount >= 1 ? `Modifié à ${hourMinute} (pénalisée)` : `Modifié à ${hourMinute}`
  }
  let penalized = ''
  if (penalizedCount >= count) penalized = ' (toutes pénalisées)'
  else if (penalizedCount === 1) penalized = ' (1 pénalisée)'
  else if (penalizedCount > 1) penalized = ` (${penalizedCount} pénalisées)`
  return `Modifié ${count} fois${penalized} · dernière à ${hourMinute}`
}

/**
 * Horodatages d'un pronostic, visibles de tous les joueurs de la ligue après le
 * départ de la course. Deux lignes, toutes à la minute :
 *   1. « Soumis le sam. 31 oct. à 22h24 »   (toujours ; « (tardif) » si une
 *      pénalité automatique 'late' existe pour ce joueur et cette course)
 *   2. « Modifié à 23h13 (pénalisée) » etc.  (si le pronostic a été modifié ;
 *      voir formatModifiedLine pour les formats exacts)
 * Les pénalités elles-mêmes n'ont plus de ligne : leur montant est déjà affiché
 * en haut à droite de la carte du joueur.
 *
 * Les heures viennent de l'appareil du joueur (submittedAt, modifiedAt), sauf
 * s'il existe une pénalité automatique (source === 'auto') 'late' (ligne 1) ou
 * 'change' (ligne 2) avec un eventTime valide : l'heure enregistrée par le
 * serveur, bien plus fiable, la remplace alors (la plus récente s'il y en a
 * plusieurs). Les pénalités sans source (anciennes ou manuelles) sont ignorées.
 * updatedAt n'est jamais affiché (il change à chaque écriture, déverrouillage
 * admin compris). Tout champ absent ou invalide donne simplement « rien » : le
 * composant ne lève jamais.
 *
 * `penalties` = pénalités de la ligue (déjà filtrées par ligue par la requête) ;
 * le composant ne garde que celles de (playerId, raceId).
 */
export default function PredictionTimestamps({ prediction, penalties, playerId, raceId, className = '' }) {
  try {
    const autoPens = (Array.isArray(penalties) ? penalties : [])
      .filter(p => p && p.source === 'auto' && p.playerId === playerId && p.raceId === raceId)

    // Latest valid server event time among automatic penalties of this type.
    const serverDateOf = (list) => list
      .map(p => toValidDate(p.eventTime))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    const latePens = autoPens.filter(p => p.type === 'late')
    const changePens = autoPens.filter(p => p.type === 'change')

    const submittedTime = formatPredTime(serverDateOf(latePens) ?? prediction?.submittedAt)
    const submitted = submittedTime && (latePens.length > 0 ? `${submittedTime} (tardif)` : submittedTime)

    const modifiedDate = serverDateOf(changePens) ?? toValidDate(prediction?.modifiedAt)
    const modified = formatModifiedLine(
      getModificationCount(prediction),
      changePens.length,
      modifiedDate ? formatHourMinute(modifiedDate) : null,
    )

    if (!submitted && !modified) return null

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
      </div>
    )
  } catch {
    return null
  }
}
