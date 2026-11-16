// Mini classement d'exemple avec un code d'invitation : utilisé par la dernière diapo
// de l'intro et par l'écran du joueur qui n'a encore jamais eu de ligue.
// Code d'invitation affiché à titre d'exemple sur le dernier écran. Valeur fixe,
// jamais lue dans la base : les vrais codes font 6 caractères lettres/chiffres
// (CODE_CHARS dans CreerLigue), le tiret ne peut donc jamais correspondre à un
// vrai code de ligue.
const EXAMPLE_INVITE_CODE = 'ABC-123'

const GREEN = '#22C55E'

export default function LeaguesVisual() {
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
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Code d'invitation</p>
        <p className="text-base font-black tracking-[0.18em]">{EXAMPLE_INVITE_CODE}</p>
      </div>
    </div>
  )
}
