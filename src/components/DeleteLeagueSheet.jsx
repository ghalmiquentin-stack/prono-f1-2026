import { useState } from 'react'
import BottomSheet from './BottomSheet'
import { deleteLeague } from '../utils/leagues'

const CONFIRM_WORD = 'SUPPRIMER'

export default function DeleteLeagueSheet({ isOpen, onClose, league, onDeleted, addToast }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setConfirmText('')
    setError('')
    onClose?.()
  }

  const handleConfirm = async () => {
    if (!league || confirmText !== CONFIRM_WORD) return
    setDeleting(true)
    setError('')
    try {
      await deleteLeague(league._id)
      setConfirmText('')
      addToast?.('Ligue supprimée avec succès', 'success')
      onDeleted?.()
      onClose?.()
    } catch {
      setError('Erreur lors de la suppression de la ligue. Réessayez.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Supprimer la ligue ?">
      <div className="p-5 pb-10 space-y-4">
        <p className="text-sm text-muted leading-relaxed">
          ⚠️ Cette action supprimera définitivement la ligue{' '}
          <span className="font-bold text-white">{league?.name}</span>, tous ses joueurs, pronostics
          et pénalités. IRRÉVERSIBLE.
        </p>
        <div>
          <p className="text-xs text-muted font-bold mb-1.5">
            Tape <span className="font-mono text-white">{CONFIRM_WORD}</span> pour confirmer
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="input-field"
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
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
            disabled={confirmText !== CONFIRM_WORD || deleting}
            className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
              confirmText === CONFIRM_WORD && !deleting
                ? 'bg-red-600'
                : 'bg-surfaceHigh text-muted cursor-not-allowed'
            }`}
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
