import { User } from 'lucide-react'
import LeaguesVisual from '../components/LeaguesVisual'

const RED = '#E8002D'

// Écran d'un joueur qui n'a JAMAIS eu de ligue (typiquement : juste après l'intro).
// Écran à part, sans barre du bas, dans la continuité de la dernière diapo de l'intro.
// Un joueur qui a déjà eu puis quitté ses ligues voit à la place l'état vide de
// Mes ligues (« Tu n'as plus de ligue »). Le choix se fait dans App.jsx.
// Sous 640 px de hauteur, le mini-classement disparaît pour que le titre et les
// deux boutons restent entiers sans défiler.
export default function PremiereLigue({ setActiveTab }) {
  return (
    <div className="h-[100dvh] bg-bg flex flex-col safe-top overflow-hidden">
      <div className="flex justify-end px-3 pt-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab?.('monprofil')}
          aria-label="Mon profil"
          className="w-11 h-11 flex items-center justify-center rounded-full border border-border text-muted hover:text-white hover:border-muted transition-colors active:scale-95"
        >
          <User size={18} />
        </button>
      </div>

      <section className="flex-1 min-h-0 flex flex-col justify-center px-[22px]">
        <div className="relative flex items-center justify-center -mx-[22px] pt-1 pb-11 [@media(max-height:640px)]:hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(232,0,45,0.16) 0%, rgba(21,21,30,0) 65%)' }}
            aria-hidden="true"
          />
          <LeaguesVisual />
        </div>
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] mt-3 mb-2" style={{ color: RED }}>
          Dernière étape
        </p>
        <h1 className="text-center text-[34px] font-black tracking-tight leading-none text-white">
          Prends place sur la <span style={{ color: RED }}>grille</span>.
        </h1>
        <p className="text-center text-[14.5px] text-muted leading-normal mt-3 mx-1">
          Une ligue, c'est ton groupe d'amis et son classement. Crée la tienne ou rejoins celle d'un ami.
        </p>
      </section>

      <div className="shrink-0 px-[22px] pt-4 pb-[max(28px,env(safe-area-inset-bottom))] flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setActiveTab?.('creer-ligue')}
          className="w-full bg-accent text-white rounded-xl py-3.5 text-[15px] font-black active:scale-95 transition-transform"
        >
          Créer ma ligue
        </button>
        <button
          type="button"
          onClick={() => setActiveTab?.('rejoindre-ligue')}
          className="w-full min-h-[48px] rounded-xl border border-border bg-surface text-white text-[15px] font-bold active:opacity-70"
        >
          J'ai un code d'invitation
        </button>
      </div>
    </div>
  )
}
