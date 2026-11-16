import { useState } from 'react'
import { BookOpen, ChevronRight } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ReglesDuJeu from '../screens/ReglesDuJeu'

// Ligne-carte « Règles du jeu » (même forme que les entrées des Réglages de ligue) qui ouvre la page
// Règles en feuille, sans le bloc « Ta ligue ». Utilisée par Créer et Rejoindre une ligue.
export default function ReglesLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-surfaceHigh/50"
          style={{ minHeight: 64 }}
        >
          <span className="w-9 h-9 rounded-lg bg-surfaceHigh flex items-center justify-center text-white shrink-0">
            <BookOpen size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-base leading-snug">Règles du jeu</p>
            <p className="text-xs text-muted">Barème des points et week-end de course</p>
          </div>
          <ChevronRight size={18} className="text-muted shrink-0" />
        </button>
      </div>
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} fullHeight bare>
        <ReglesDuJeu />
      </BottomSheet>
    </>
  )
}
