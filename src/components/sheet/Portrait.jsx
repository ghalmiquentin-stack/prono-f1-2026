import { resolveDriver } from './driverUtils'

// Portrait rond d'un pilote (initiale si la photo manque). `ring` = couleur
// d'un anneau avec une discrète lueur (écurie ou rang).
export default function Portrait({ drivers, name, className = '', ring }) {
  const { photo } = resolveDriver(drivers, name)
  return (
    <div
      className={`rounded-full overflow-hidden bg-surfaceHigh shrink-0 ${className}`}
      style={ring ? { boxShadow: `0 0 0 3px ${ring}, 0 0 18px ${ring}55` } : undefined}
    >
      {photo
        ? <img src={photo} alt="" className="w-full h-full object-cover object-top" />
        : <span className="w-full h-full flex items-center justify-center text-xs font-bold text-muted">{name?.[0] ?? '?'}</span>}
    </div>
  )
}
