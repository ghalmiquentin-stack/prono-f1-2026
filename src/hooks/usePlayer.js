import { useState } from 'react'

const STORAGE_KEY = 'prono_f1_player'
const VALID_IDS = ['william', 'quentin', 'alex', 'romain']

export function usePlayer() {
  const [playerId, setPlayerIdState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      // Guard against corrupted values (e.g. "[object Object]" from old bug)
      return stored && VALID_IDS.includes(stored) ? stored : null
    } catch {
      return null
    }
  })

  const setPlayerId = (id) => {
    setPlayerIdState(id)
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }

  const logout = () => setPlayerId(null)

  return { playerId, setPlayerId, logout }
}
