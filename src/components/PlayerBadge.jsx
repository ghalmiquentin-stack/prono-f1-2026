// `className` : contraintes de largeur propres au contexte (l'en-tête des écrans
// principaux plafonne la largeur, voir HeaderBadges). Pas de plafond en pourcentage
// par défaut : dans un parent qui s'ajuste à son contenu (Mes ligues), il
// s'écraserait.
export default function PlayerBadge({ avatar, color, displayName, points, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl border active:scale-95 transition-all duration-200 shrink-0 min-w-0 after:absolute after:-inset-y-1 after:inset-x-0 ${className}`}
      style={{ borderColor: color, backgroundColor: `${color}18` }}
    >
      <span className="text-base leading-none shrink-0">{avatar}</span>
      <div className="flex flex-col items-end leading-none min-w-0">
        <span className="text-xs font-black max-w-full truncate" style={{ color }}>
          {displayName}
        </span>
        <span className="text-[10px] text-muted font-bold mt-0.5 whitespace-nowrap">
          {points} pts
        </span>
      </div>
    </button>
  )
}
