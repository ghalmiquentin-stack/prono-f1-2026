import { useRef, useState } from 'react'
import {
  POINTS_EXACT,
  POINTS_PODIUM,
  PERFECT_PODIUM_BONUS,
  STREAK_LENGTH,
  STREAK_BONUS,
} from '../utils/scoring'

// Code d'invitation affiché à titre d'exemple sur le dernier écran. Valeur fixe,
// jamais lue dans la base : les vrais codes font 6 caractères lettres/chiffres
// (CODE_CHARS dans CreerLigue), le tiret ne peut donc jamais correspondre à un
// vrai code de ligue.
const EXAMPLE_INVITE_CODE = 'ABC-123'

const GOLD = '#FFD700'
const GREEN = '#22C55E'
const AMBER = '#F59E0B'
const RED = '#E8002D'

// ── Visuels des quatre écrans ─────────────────────────────────────────────────

function PodiumVisual() {
  const columns = [
    { label: '2', color: '#C0C0C0', height: 84, fill: 'linear-gradient(#D8D8D8,#9A9A9A)' },
    { label: '1', color: GOLD, height: 120, fill: 'linear-gradient(#FFE14D,#C9A400)' },
    { label: '3', color: '#CD7F32', height: 60, fill: 'linear-gradient(#DB9150,#A5651F)' },
  ]
  return (
    <div className="relative flex items-end gap-2.5">
      {columns.map(col => (
        <div key={col.label} className="w-[88px] text-center">
          <div
            className="w-[62px] h-[62px] rounded-full bg-surface border-2 border-dashed mx-auto mb-2 flex items-center justify-center text-[32px] font-black"
            style={{ borderColor: col.color, color: col.color }}
          >
            ?
          </div>
          <div
            className="rounded-t-[10px] flex items-start justify-center pt-2.5 text-[26px] font-black text-bg"
            style={{ height: col.height, background: col.fill }}
          >
            {col.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function PointsVisual() {
  return (
    <div className="relative flex flex-col gap-2.5 w-full max-w-[290px]">
      <div className="grid grid-cols-3 gap-2">
        <div className="card px-1 py-4 text-center" style={{ borderColor: 'rgba(34,197,94,0.5)' }}>
          <p className="text-[32px] font-black leading-none" style={{ color: GREEN }}>+{POINTS_EXACT}</p>
          <p className="text-[11px] text-muted mt-1.5 leading-tight">Bonne place</p>
        </div>
        <div className="card px-1 py-4 text-center">
          <p className="text-[32px] font-black leading-none" style={{ color: AMBER }}>+{POINTS_PODIUM}</p>
          <p className="text-[11px] text-muted mt-1.5 leading-tight">Sur le podium</p>
        </div>
        <div className="card px-1 py-4 text-center">
          <p className="text-[32px] font-black leading-none" style={{ color: '#6B6B8A' }}>0</p>
          <p className="text-[11px] text-muted mt-1.5 leading-tight">Raté</p>
        </div>
      </div>
      <div className="card flex items-center gap-3 px-3.5 py-2.5">
        <p className="text-2xl font-black text-gold min-w-[44px] leading-none">+{PERFECT_PODIUM_BONUS}</p>
        <div>
          <p className="text-sm font-extrabold">Podium parfait</p>
          <p className="text-[11.5px] text-muted">Les 3 places exactes</p>
        </div>
      </div>
      <div className="card flex items-center gap-3 px-3.5 py-2.5">
        <p className="text-2xl font-black text-gold min-w-[44px] leading-none">+{STREAK_BONUS}</p>
        <div>
          <p className="text-sm font-extrabold">Bonus série</p>
          <p className="text-[11.5px] text-muted">{STREAK_LENGTH} GP gagnés d'affilée</p>
        </div>
      </div>
    </div>
  )
}

function TimingVisual() {
  const steps = [
    { title: 'Avant les qualifs', detail: 'Pronostics gratuits', color: GREEN },
    { title: 'Départ des qualifs', detail: 'Une modification peut coûter', color: AMBER },
    { title: 'Départ de la course', detail: 'Pronostics verrouillés', color: RED },
  ]
  return (
    <div className="relative w-full max-w-[290px] pl-10 before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-0.5 before:bg-border before:content-['']">
      {steps.map(step => (
        <div key={step.title} className="relative mb-7 last:mb-0">
          <span
            className="absolute -left-10 top-px w-6 h-6 rounded-full border-[5px] border-bg"
            style={{ backgroundColor: step.color }}
            aria-hidden="true"
          />
          <p className="text-base font-extrabold">{step.title}</p>
          <p className="text-[13px] text-muted">{step.detail}</p>
        </div>
      ))}
    </div>
  )
}

function LeaguesVisual() {
  // Joueurs d'exemple (fictifs), pas des données de l'application.
  const rows = [
    { rank: '🥇', avatar: '💎', name: 'Léa', points: 41, color: '#A855F7' },
    { rank: '🥈', avatar: '🚀', name: 'Toi', points: 38, color: GREEN, me: true },
    { rank: '🥉', avatar: '🔥', name: 'Hugo', points: 27, color: '#F97316' },
  ]
  return (
    <div className="relative w-full max-w-[290px] card rounded-2xl p-1.5">
      {rows.map(row => (
        <div
          key={row.name}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] ${row.me ? 'bg-green-500/10' : ''}`}
        >
          <span className="w-[22px] text-base">{row.rank}</span>
          <span
            className="w-8 h-8 rounded-[10px] border flex items-center justify-center text-[17px]"
            style={{ borderColor: row.color, backgroundColor: `${row.color}1F` }}
          >
            {row.avatar}
          </span>
          <span className="flex-1 text-sm font-extrabold">{row.name}</span>
          <span className="text-sm font-black" style={{ color: row.color }}>{row.points} pts</span>
        </div>
      ))}
      <div className="absolute -right-1.5 -bottom-9 rounded-[10px] bg-surfaceHigh border border-[#3A3A52] px-3 py-1.5 text-center">
        <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-muted">Code d'invitation</p>
        <p className="text-base font-black tracking-[0.18em]">{EXAMPLE_INVITE_CODE}</p>
      </div>
    </div>
  )
}

// ── Les quatre écrans ─────────────────────────────────────────────────────────

const SLIDES = [
  {
    kicker: 'Le jeu',
    color: GOLD,
    glow: 'rgba(255,215,0,0.16)',
    title: ['Devine le ', 'podium', '.'],
    text: 'P1, P2, P3. Avant chaque Grand Prix, tu prédis les trois premiers.',
    Visual: PodiumVisual,
  },
  {
    kicker: 'Le barème',
    color: GREEN,
    glow: 'rgba(34,197,94,0.14)',
    title: ['Marque des ', 'points', '.'],
    text: 'Vise juste, ça paie. Enchaîne les victoires, ça paie encore plus.',
    Visual: PointsVisual,
  },
  {
    kicker: 'Le timing',
    color: AMBER,
    glow: 'rgba(245,158,11,0.14)',
    title: ['Les qualifs lancent le ', 'chrono', '.'],
    text: "Pronostique tôt, c'est le plus sûr.",
    Visual: TimingVisual,
  },
  {
    kicker: 'Les ligues',
    color: RED,
    glow: 'rgba(232,0,45,0.16)',
    title: ['Défie tes ', 'amis', '.'],
    text: "Crée ta ligue ou rejoins celle d'un ami avec son code. Retrouve les règles quand tu veux dans la section « Mon profil ».",
    Visual: LeaguesVisual,
  },
]

// Intro de bienvenue : 4 écrans qui se font défiler à la main (bande horizontale
// avec accrochage sur chaque écran), « Passer » en haut à droite sur les trois
// premiers, bouton « C'est parti » sur le dernier. Affichée une seule fois, juste
// après la création du profil (voir App.jsx) ; rien n'est stocké.
export default function Intro({ onDone }) {
  const scrollerRef = useRef(null)
  const [index, setIndex] = useState(0)
  const isLast = index === SLIDES.length - 1

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el || !el.clientWidth) return
    setIndex(Math.min(SLIDES.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))))
  }

  const goTo = (i) => {
    const el = scrollerRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="h-[100dvh] bg-bg flex flex-col safe-top overflow-hidden">
      <div className="flex justify-end px-3 pt-2 shrink-0">
        <button
          type="button"
          onClick={onDone}
          className={`min-h-[44px] px-3 text-xs font-bold tracking-wide text-muted hover:text-white ${isLast ? 'invisible' : ''}`}
          tabIndex={isLast ? -1 : 0}
        >
          Passer
        </button>
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="region"
        aria-roledescription="carrousel"
        aria-label="Bienvenue"
        className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map(({ kicker, color, glow, title, text, Visual }, i) => (
          <section
            key={kicker}
            role="group"
            aria-roledescription="écran"
            aria-label={`${i + 1} sur ${SLIDES.length}`}
            className="min-w-full snap-center flex flex-col justify-center px-[22px]"
          >
            {/* Visuel + textes forment un seul bloc centré verticalement : la
                hauteur du visuel est fixe pour que les titres restent à la même
                place d'un écran à l'autre. */}
            <div className="relative h-[min(300px,42dvh)] flex items-center justify-center -mx-[22px]">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 50%, ${glow} 0%, rgba(21,21,30,0) 65%)` }}
                aria-hidden="true"
              />
              <Visual />
            </div>
            <p
              className="text-center text-[11px] font-bold uppercase tracking-[0.2em] mt-3.5 mb-2"
              style={{ color }}
            >
              {kicker}
            </p>
            <h2 className="text-center text-[36px] font-black tracking-tight leading-none text-white">
              {title[0]}<span style={{ color }}>{title[1]}</span>{title[2]}
            </h2>
            <p className="text-center text-[14.5px] text-muted leading-normal mt-3 mx-1">{text}</p>
          </section>
        ))}
      </div>

      <div className="shrink-0 px-[22px] pt-4 pb-[max(28px,env(safe-area-inset-bottom))] flex flex-col items-center justify-end gap-3 min-h-[100px]">
        {isLast && (
          <button
            type="button"
            onClick={onDone}
            className="w-full bg-accent text-white rounded-xl py-3.5 text-[15px] font-black active:scale-95 transition-transform"
          >
            C'est parti
          </button>
        )}
        <div className="flex items-center gap-[7px]">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.kicker}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Aller à l'écran ${i + 1}`}
              aria-current={i === index}
              className={`relative block h-1.5 rounded-full transition-all after:absolute after:-inset-x-[3.5px] after:-inset-y-[19px] after:content-[''] ${
                i === index ? 'w-[18px] bg-accent' : 'w-1.5 bg-[#3A3A52]'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
