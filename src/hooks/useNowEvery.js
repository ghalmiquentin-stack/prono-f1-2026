import { useEffect, useState } from 'react'

// Horloge d'affichage (ms) rafraîchie toutes les `intervalMs` (30 s par défaut).
// Sert UNIQUEMENT à afficher le délai « Départ dans » : aucune décision de
// pénalité ou de verrouillage ne passe par ici (elles restent dans
// useRaceTiming / useQualifyingSwitch et côté serveur).
export function useNowEvery(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
