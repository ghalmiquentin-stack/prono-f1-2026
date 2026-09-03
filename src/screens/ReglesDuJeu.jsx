import {
  POINTS_EXACT,
  POINTS_PODIUM,
  PERFECT_PODIUM_BONUS,
  STREAK_LENGTH,
  STREAK_BONUS,
} from '../utils/scoring'

const SCORING_RULES = [
  {
    label: 'Position exacte',
    detail: 'Le pilote pronostiqué est exactement à la bonne position (P1, P2 ou P3).',
    points: `+${POINTS_EXACT} pts`,
    color: '#22C55E',
  },
  {
    label: 'Mauvaise position sur le podium',
    detail: 'Le pilote pronostiqué termine sur le podium, mais pas à la position annoncée.',
    points: `+${POINTS_PODIUM} pts`,
    color: '#F59E0B',
  },
  {
    label: 'Hors podium',
    detail: "Le pilote pronostiqué ne termine pas sur le podium.",
    points: '0 pt',
    color: '#6B6B8A',
  },
  {
    label: 'Bonus Podium Parfait',
    detail: 'Les 3 positions (P1, P2, P3) sont toutes exactes.',
    points: `+${PERFECT_PODIUM_BONUS} pts`,
    color: '#FFD700',
  },
  {
    label: 'Bonus Série',
    detail: `Le joueur avec le meilleur score net sur ${STREAK_LENGTH} Grands Prix consécutifs gagne ce bonus. En cas d'égalité en tête, tous les joueurs ex-aequo comptent comme gagnants. Si la série est interrompue, le compteur repart à zéro.`,
    points: `+${STREAK_BONUS} pts`,
    color: '#FFD700',
  },
]

export default function ReglesDuJeu() {
  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">Règles du jeu</h1>
        <p className="text-sm text-muted">Comment les points sont calculés</p>
      </div>

      <div className="px-5 space-y-3">
        {SCORING_RULES.map(rule => (
          <div key={rule.label} className="card p-4 flex items-center gap-3">
            <div
              className="w-2 h-10 rounded-full shrink-0"
              style={{ backgroundColor: rule.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm">{rule.label}</p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">{rule.detail}</p>
            </div>
            <p className="font-black text-lg shrink-0" style={{ color: rule.color }}>
              {rule.points}
            </p>
          </div>
        ))}
      </div>

      <div className="px-5 mt-6">
        <div className="card p-4">
          <p className="section-title mb-2">Bon à savoir</p>
          <p className="text-xs text-muted leading-relaxed">
            Le score net d'une course correspond à la somme des points marqués sur P1, P2 et P3,
            plus le bonus Podium Parfait si les 3 positions sont exactes, moins d'éventuelles pénalités.
          </p>
        </div>
      </div>
    </div>
  )
}
