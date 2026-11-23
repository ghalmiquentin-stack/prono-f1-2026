import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { auth } from '../firebase'
import { subscribe, getEntries, getOpenRequest, sendKey, levelOf } from '../utils/pendingPredictions'

// Entrées du registre des envois (voir utils/pendingPredictions.js) pour le compte connecté.
export function usePendingEntries() {
  const all = useSyncExternalStore(subscribe, getEntries)
  const uid = auth.currentUser?.uid ?? null
  return useMemo(() => all.filter(e => e.uid === uid), [all, uid])
}

// Envoi EN COURS (status pending) du joueur pour une ligue et un GP, ou null.
export function usePendingEntry(leagueId, raceId) {
  const entries = usePendingEntries()
  return useMemo(() => {
    if (!leagueId || raceId == null) return null
    const key = sendKey(leagueId, raceId)
    return entries.find(e => e.key === key && e.status === 'pending') ?? null
  }, [entries, leagueId, raceId])
}

// Horloge d'affichage (ms), une fois par seconde, SEULEMENT tant que `active` : sert à faire passer un envoi
// de « en cours » à « lent » puis « pas encore reçu ». Aucune décision de pénalité n'en dépend.
export function usePendingClock(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

// Niveau d'attente d'un envoi en cours : 'sending' | 'slow' | 'stuck' (null sans envoi).
export function useSendLevel(entry) {
  const now = usePendingClock(!!entry)
  return entry ? levelOf(Math.max(0, now - entry.startedAt)) : null
}

// Demande « Refaire » en attente (ligue et GP dont il faut ouvrir la feuille), ou null.
export function useOpenRequest() {
  return useSyncExternalStore(subscribe, getOpenRequest)
}

// Faux seulement quand le navigateur sait avec certitude qu'il n'a aucune connexion.
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}
