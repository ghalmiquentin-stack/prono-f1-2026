// Interventions d'un admin sur un pronostic : écriture dans Firestore (un seul lot atomique).
// Toute la logique pure (construction des documents, pénalité proposée, effet au classement, badge) est dans
// adminInterventionsCore.js, testable sans Firebase. Voir ce fichier pour la description de la transparence.

import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { buildAdminIntervention, buildPenaltyAddition, buildPenaltyRemoval } from './adminInterventionsCore'

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


// Ajout d'une pénalité à la main : pénalité + entrée de journal (motif obligatoire), un seul lot. { ok, error }
export async function saveAdminPenalty(params) {
  try {
    const built = buildPenaltyAddition({ ...params, stamp: serverTimestamp })
    const batch = writeBatch(db)
    batch.set(doc(db, 'penalties', built.penaltyId), built.penalty)
    batch.set(doc(db, 'adminLog', built.logId), built.log)
    await batch.commit()
    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, error: "Erreur lors de l'ajout de la pénalité. Rien n'a été modifié, réessaie." }
  }
}

// Retrait d'une pénalité : suppression + entrée de journal (motif obligatoire), un seul lot. { ok, error }
export async function removeAdminPenalty(params) {
  try {
    const built = buildPenaltyRemoval({ ...params, stamp: serverTimestamp })
    const batch = writeBatch(db)
    batch.delete(doc(db, 'penalties', built.penaltyId))
    batch.set(doc(db, 'adminLog', built.logId), built.log)
    await batch.commit()
    return { ok: true }
  } catch (err) {
    console.error(err)
    return { ok: false, error: 'Erreur lors du retrait de la pénalité. Rien n\'a été modifié, réessaie.' }
  }
}
