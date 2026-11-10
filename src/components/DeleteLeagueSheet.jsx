import { useState } from 'react'
import { Users, Flag, AlertTriangle, ListOrdered, Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { deleteLeague } from '../utils/leagues'

const CONFIRM_WORD = 'SUPPRIMER'

function Lost({ icon, children }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="text-muted shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  )
}

// Feuille de suppression de la ligue (maquette validée le 10 nov. 2026) : nom de la ligue, bandeau rouge
// « irréversible », ce qui sera effacé (avec les comptes), puis le mot à taper. La suppression elle-même
// (deleteLeague) est inchangée. `counts` : { players, races, penalties } (lus, jamais écrits).
export default function DeleteLeagueSheet({ isOpen, onClose, league, onDeleted, addToast, counts }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    if (deleting) return
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
      setError('Erreur lors de la suppression de la ligue. Réessaie.')
    } finally {
      setDeleting(false)
    }
  }

  const ready = confirmText === CONFIRM_WORD && !deleting
  const players = counts?.players ?? 0
  const races = counts?.races ?? 0
  const penalties = counts?.penalties ?? 0

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Supprimer la ligue ?">
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-white mb-1.5">Ligue</p>
          <p className="text-lg font-black leading-snug break-words">{league?.name}</p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <Trash2 size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-black text-red-400">Suppression définitive</p>
            <p className="text-sm text-white mt-0.5">Impossible à annuler : rien ne pourra être récupéré.</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted mb-2">Seront effacés pour tous les joueurs :</p>
          <ul className="card p-4 space-y-2.5">
            <Lost icon={<Users size={16} />}>{players} joueur{players > 1 ? 's' : ''} de la ligue</Lost>
            <Lost icon={<Flag size={16} />}>{races > 0 ? `Tous les pronostics (${races} GP)` : 'Aucun pronostic pour le moment'}</Lost>
            <Lost icon={<AlertTriangle size={16} />}>{penalties > 0 ? `Toutes les pénalités (${penalties})` : 'Aucune pénalité pour le moment'}</Lost>
            <Lost icon={<ListOrdered size={16} />}>Le classement et les statistiques</Lost>
          </ul>
        </div>

        <div>
          <label className="text-xs text-muted font-bold block mb-1.5">
            Tape <span className="font-mono text-white">{CONFIRM_WORD}</span> pour confirmer
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="input-field"
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={deleting}
          />
        </div>

        {error && <p className="text-accent text-xs font-bold">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={deleting}
            className="flex-1 rounded-lg border border-border bg-surfaceHigh text-sm font-bold disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!ready}
            className={`flex-1 rounded-lg text-sm font-black ${ready ? 'bg-red-600 text-white' : 'bg-surfaceHigh text-muted'}`}
            style={{ minHeight: 44 }}
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
