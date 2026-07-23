import { collection, doc, deleteDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Amount fields are edited as free text (so the input can be temporarily
// empty while typing) and only parsed to a number when actually used.
export function parseAmount(value) {
  if (value.trim() === '') return 0
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

// Deletes a league and all of its league-scoped data. The league document
// itself is removed last so isLeagueAdmin() in the Firestore rules (which
// reads the league doc) still passes while players/predictions/penalties
// are being deleted.
export async function deleteLeague(leagueId) {
  const scopedCollections = ['predictions', 'penalties', 'players']
  for (const collectionName of scopedCollections) {
    const snap = await getDocs(query(collection(db, collectionName), where('leagueId', '==', leagueId)))
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
  }
  await deleteDoc(doc(db, 'leagues', leagueId))
}
