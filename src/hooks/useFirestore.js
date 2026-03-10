import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

/** Listen to a whole collection */
export function useCollection(collectionName, constraints = []) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!collectionName) return
    setLoading(true)
    let q
    try {
      q = constraints.length > 0
        ? query(collection(db, collectionName), ...constraints)
        : collection(db, collectionName)
    } catch (e) {
      setError(e)
      setLoading(false)
      return
    }

    const unsub = onSnapshot(q,
      snap => {
        setData(snap.docs.map(d => ({ _id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        setError(err)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [collectionName])

  return { data, loading, error }
}

/** Listen to a single document */
export function useDocument(collectionName, docId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!collectionName || !docId) return
    const ref = doc(db, collectionName, docId)
    const unsub = onSnapshot(ref,
      snap => {
        setData(snap.exists() ? { _id: snap.id, ...snap.data() } : null)
        setLoading(false)
      },
      err => {
        setError(err)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [collectionName, docId])

  return { data, loading, error }
}

/** Write / upsert a document with a known ID */
export async function upsertDoc(collectionName, docId, data) {
  const ref = doc(db, collectionName, docId)
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

/** Add a document (auto-ID) */
export async function addDocument(collectionName, data) {
  return addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() })
}

/** Update specific fields */
export async function updateDocument(collectionName, docId, data) {
  const ref = doc(db, collectionName, docId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

/** Delete a document */
export async function deleteDocument(collectionName, docId) {
  const ref = doc(db, collectionName, docId)
  await deleteDoc(ref)
}

export { where, orderBy }
