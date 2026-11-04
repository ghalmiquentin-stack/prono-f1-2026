export default function PlayerBadge({ avatar, color, displayName, points, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border active:scale-95 transition-all duration-200 shrink-0 min-w-0 max-w-[calc(100%-108px)] after:absolute after:-inset-y-1 after:inset-x-0"
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
