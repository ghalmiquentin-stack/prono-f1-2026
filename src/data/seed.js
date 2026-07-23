import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

export async function clearDatabase() {
  const collections = ['players', 'races', 'predictions', 'penalties']
  for (const col of collections) {
    const snap = await getDocs(collection(db, col))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}
