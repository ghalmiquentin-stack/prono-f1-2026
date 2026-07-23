import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Cet email est déjà utilisé par un autre compte.',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
  'auth/user-not-found': 'Aucun compte ne correspond à cet email.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
  'auth/popup-closed-by-user': 'Fenêtre de connexion fermée avant la fin.',
  'auth/cancelled-popup-request': 'Connexion annulée.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
  'auth/requires-recent-login': 'Cette action nécessite une reconnexion récente. Déconnectez-vous puis reconnectez-vous et réessayez.',
}

/** Translate a Firebase Auth error into a clear French message */
export function formatAuthError(error) {
  const code = error?.code
  return ERROR_MESSAGES[code] || "Une erreur est survenue. Veuillez réessayer."
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  const signUpWithEmail = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password)

  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider)

  const logout = () => signOut(auth)

  return { user, authLoading, signUpWithEmail, signInWithEmail, signInWithGoogle, logout }
}
