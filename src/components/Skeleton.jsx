export default function Skeleton({ className = '', rows = 1, height = 'h-10' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`skeleton rounded-lg ${height} w-full`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      <div className="skeleton h-5 w-1/3 rounded" />
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-2/3 rounded" />
    </div>
  )
}

export function SkeletonRow({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${className}`}>
      <div className="skeleton h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
      <div className="skeleton h-8 w-16 rounded-full" />
    </div>
  )
}
