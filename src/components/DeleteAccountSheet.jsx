import { useState } from 'react'
import { KeyRound, Users, Flag, ListOrdered, Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'

const CONFIRM_WORD = 'SUPPRIMER'

function Item({ icon, kept = false, children }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className={`shrink-0 ${kept ? 'text-green-400' : 'text-muted'}`}>{icon}</span>
      <span>{children}</span>
    </li>
  )
}

// Feuille de suppression du compte (même présentation que « Supprimer la ligue ») : bandeau rouge
// « irréversible », ce qui sera effacé, ce qui reste dans les ligues, puis le mot à taper.
// La suppression elle-même (`onConfirm`) est faite par MonProfil, inchangée.
export default function DeleteAccountSheet({ isOpen, onClose, onConfirm, deleting }) {
  const [confirmText, setConfirmText] = useState('')

  const handleClose = () => {
    if (deleting) return
    setConfirmText('')
    onClose?.()
  }

  const ready = confirmText.trim().toUpperCase() === CONFIRM_WORD && !deleting

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Supprimer mon compte ?">
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <Trash2 size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-black text-red-400">Suppression définitive</p>
            <p className="text-sm text-white mt-0.5">Impossible à annuler : tu ne pourras pas récupérer ce compte.</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted mb-2">Sera effacé :</p>
          <ul className="card p-4 space-y-2.5">
            <Item icon={<KeyRound size={16} />}>Ton compte de connexion</Item>
            <Item icon={<Users size={16} />}>Ton pseudo, ton avatar et ta couleur</Item>
          </ul>
        </div>

        <div>
          <p className="text-sm text-muted mb-2">Restera dans tes ligues, sous « Joueur supprimé » :</p>
          <ul className="card p-4 space-y-2.5">
            <Item icon={<Flag size={16} />} kept>Tes pronostics</Item>
            <Item icon={<ListOrdered size={16} />} kept>Tes points et tes pénalités</Item>
          </ul>
          <p className="text-xs text-muted mt-1.5">Pour ne pas fausser les classements des autres joueurs.</p>
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
            onClick={onConfirm}
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
