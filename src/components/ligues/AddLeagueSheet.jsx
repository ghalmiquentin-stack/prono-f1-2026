import { Plus, LogIn } from 'lucide-react'
import BottomSheet from '../BottomSheet'

// Feuille du bouton « + » de Mes ligues : créer ou rejoindre une ligue.
export default function AddLeagueSheet({ isOpen, onClose, onCreate, onJoin }) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Ajouter une ligue">
      <div className="p-5 pb-10 space-y-3">
        <button type="button" onClick={onCreate} className="w-full card p-4 flex items-center gap-3 text-left active:opacity-70">
          <Plus size={22} className="shrink-0" />
          <span>
            <span className="block font-bold text-sm">Créer une ligue</span>
            <span className="block text-xs text-muted">Tu en seras l'admin et tu invites tes amis avec un code.</span>
          </span>
        </button>
        <button type="button" onClick={onJoin} className="w-full card p-4 flex items-center gap-3 text-left active:opacity-70">
          <LogIn size={22} className="shrink-0" />
          <span>
            <span className="block font-bold text-sm">Rejoindre une ligue</span>
            <span className="block text-xs text-muted">Avec le code d'invitation d'un ami.</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}
