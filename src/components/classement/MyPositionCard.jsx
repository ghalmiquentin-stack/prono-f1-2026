import { ordinal } from '../../utils/sheetStats'
import { signedPoints, ptsLabel } from '../../utils/standings'

// Carte « Ma position » : complément de la carte « Classement général » de
// l'Accueil. Mon rang, mes points, et les deux joueurs les plus proches avec
// l'écart vu de mon côté (« à rattraper » devant, « d'avance » derrière).
function Neighbor({ label, other, gap, suffix, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(other)}
      className="w-full min-h-[44px] flex items-center gap-2 text-left active:opacity-70"
    >
      <span className="w-[70px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-lg leading-none">{other.avatar}</span>
      <span className="flex-1 min-w-0 text-sm font-bold truncate text-white/85">{other.displayName}</span>
      <span className="shrink-0 text-right">
        <span className="text-sm font-black tabular-nums">{ptsLabel(gap)}</span>
        <span className="text-xs text-muted ml-1">{suffix}</span>
      </span>
    </button>
  )
}

export default function MyPositionCard({ me, count, lastRace, onOpenPlayer }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-black leading-tight text-white">Ma position</h3>
        <span className="text-xs text-muted">sur {count} joueur{count > 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black leading-none">{ordinal(me.rank)}</span>
          {me.tied && <span className="text-xs font-bold text-muted">ex æquo</span>}
          {me.rank === 1 && !me.tied && <span className="text-xs font-bold text-gold">En tête</span>}
        </div>
        <div className="text-right leading-tight">
          <p className="text-3xl font-black leading-none" style={{ color: me.color }}>
            {me.total}<span className="text-sm text-muted font-bold ml-1">pts</span>
          </p>
          {lastRace && me.last !== null && (
            <p className="text-[11px] text-muted mt-1">{signedPoints(me.last)} au GP {lastRace.name}</p>
          )}
        </div>
      </div>
      {(me.ahead || me.behind) && (
        <div className="mt-3 pt-2 border-t border-border">
          {me.ahead && (
            <Neighbor label="Devant" other={me.ahead} gap={me.ahead.total - me.total} suffix="à rattraper" onOpen={onOpenPlayer} />
          )}
          {me.behind && (
            <Neighbor label="Derrière" other={me.behind} gap={me.total - me.behind.total} suffix="d'avance" onOpen={onOpenPlayer} />
          )}
        </div>
      )}
    </div>
  )
}
