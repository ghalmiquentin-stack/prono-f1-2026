// Interventions d'un admin sur un pronostic : écriture dans Firestore (un seul lot atomique).
// Toute la logique pure (construction des documents, pénalité proposée, effet au classement, badge) est dans
// adminInterventionsCore.js, testable sans Firebase. Voir ce fichier pour la description de la transparence.

import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { buildAdminIntervention } from './adminInterventionsCore'

export { adminEntryOf, penaltyOptionFor, projectImpact, podiumOf, samePodium } from './adminInterventionsCore'

// Écrit l'intervention (un seul lot atomique). Renvoie { ok, error }.
export async function saveAdminIntervention(params) {
  try {
    const logRef = doc(collection(db, 'adminLog'))
    const built = buildAdminIntervention({ ...params, logId: logRef.id, stamp: serverTimestamp })
    const batch = writeBatch(db)
    batch.set(doc(db, 'predictions', built.predictionId), built.prediction.data, built.prediction.merge ? { merge: true } : {})
    batch.set(logRef, built.log)
    if (built.penaltyDoc) batch.set(doc(db, 'penalties', built.penaltyDoc.id), built.penaltyDoc.data)
    await batch.commit()
    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, error: "Erreur lors de l'enregistrement. Rien n'a été modifié, réessaie." }
  }
}

