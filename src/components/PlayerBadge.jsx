export default function PlayerBadge({ avatar, color, displayName, points, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border active:scale-95 transition-all duration-200 shrink-0"
      style={{ borderColor: color, backgroundColor: `${color}18` }}
    >
      <span className="text-base leading-none">{avatar}</span>
      <div className="flex flex-col items-end leading-none">
        <span className="text-xs font-black" style={{ color }}>
          {displayName}
        </span>
        <span className="text-[10px] text-muted font-bold mt-0.5">
          {points} pts
        </span>
      </div>
    </button>
  )
}
