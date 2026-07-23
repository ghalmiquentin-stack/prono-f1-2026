import { useState } from 'react'
import { upsertDoc } from '../hooks/useFirestore'
import BottomSheet from './BottomSheet'

export default function LeaveLeagueSheet({ isOpen, onClose, profileId, isSoleAdmin, onLeft }) {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setError('')
    onClose?.()
  }

  const handleConfirm = async () => {
    if (!profileId) return
    setLeaving(true)
    setError('')
    try {
      await upsertDoc('players', profileId, { active: false })
      onLeft?.()
      onClose?.()
    } catch {
      setError('Erreur lors de la sortie de la ligue. Réessayez.')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Quitter la ligue ?">
      <div className="p-5 pb-10 space-y-4">
        {isSoleAdmin ? (
          <>
            <p className="text-sm text-muted leading-relaxed">
              Tu es le seul administrateur de cette ligue, tu ne peux pas la quitter.
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl border border-border text-sm font-bold"
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted leading-relaxed">
              Quitter cette ligue ? Ton historique de pronostics restera visible dans le classement
              de la ligue, mais tu ne pourras plus y participer. Cette action est réversible uniquement
              si tu la rejoins à nouveau avec son code.
            </p>
            {error && (
              <p className="text-accent text-xs font-bold">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={leaving}
                className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
                  leaving ? 'bg-surfaceHigh text-muted cursor-not-allowed' : 'bg-red-600'
                }`}
              >
                {leaving ? 'Sortie…' : 'Quitter'}
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
