// Carte de la page Stats : grand titre blanc, sous-titre gris, zone libre à droite du titre.
export default function StatsCard({ title, sub, right = null, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-tight">{title}</h2>
          {sub && <p className="text-xs text-muted mt-0.5 leading-snug">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
