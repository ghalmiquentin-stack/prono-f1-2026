import { Star, Flame } from 'lucide-react'
import StatsCard from './StatsCard'
import FaceLeague from './FaceLeague'
import { signedPoints } from '../../utils/standings'
import { rankLabel } from '../../utils/statsFormat'

// « Ma forme du moment » : mes derniers GP, la série de GP gagnés d'affilée, puis ma forme
// face à la ligue. Chaque carte de GP montre mes points et l'écart avec la moyenne de la ligue.

function Delta({ value }) {
  if (value === null) return <span className="text-[11px] text-muted">–</span>
  const cls = value > 0 ? 'text-green-400' : 'text-muted'
  return <span className={`text-[11px] font-black ${cls}`}>{value > 0 ? `▲ ${value}` : value < 0 ? `▼ ${-value}` : '='}</span>
}

export default function FormCard({ data }) {
  const { me, list, completed, avgNet, formFrom } = data
  const indexes = completed.map((_, k) => k).slice(formFrom)
  const count = indexes.length
  const scoreClass = v => (v === null ? 'text-muted' : v < 0 ? 'text-accent' : 'text-white')

  return (
    <StatsCard
      title="Ma forme du moment"
      sub={`Mes ${count > 1 ? `${count} derniers GP` : 'dernier GP'}`}
      right={
        <div className="text-right shrink-0">
          <p className="text-2xl font-black leading-none" style={{ color: me.color }}>{signedPoints(me.form)}</p>
          <p className="text-[11px] text-muted">{rankLabel(me.formRank, list.length)}</p>
        </div>
      }
    >
      <ul className="flex gap-2 justify-center">
        {indexes.map(k => {
          const net = me.net[k]
          const delta = net === null ? null : Math.round(net - avgNet[k])
          return (
            <li
              key={completed[k].id}
              className="relative flex-1 min-w-0 max-w-[110px] rounded-xl bg-surfaceHigh/60 border border-border/60 py-2 flex flex-col items-center gap-0.5"
              aria-label={`GP ${completed[k].name} : ${net === null ? 'pas de pronostic' : `${net} points`}`}
            >
              {me.wins[k] && <Star size={11} className="absolute top-1 right-1 text-gold fill-gold" aria-label="Meilleur score du GP" />}
              <span className="text-base leading-none" aria-hidden="true">{completed[k].flag}</span>
              <span className={`text-xl font-black leading-tight ${scoreClass(net)}`}>{net ?? '–'}</span>
              <Delta value={delta} />
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2 text-[11px] text-muted mt-1.5" aria-hidden="true">
        <span>plus ancien</span>
        <span className="flex-1 h-px bg-border" />
        <span>plus récent ›</span>
      </div>
      <p className="text-[11px] text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span><Star size={11} className="inline text-gold fill-gold -mt-0.5" /> meilleur du GP</span>
        <span><span className="text-green-400 font-black">▲▼</span> vs moyenne de la ligue</span>
      </p>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <Flame size={16} className={me.winStreak ? 'text-accent' : 'text-muted'} />
        {me.winStreak > 0 ? (
          <span>
            <b>{me.winStreak} GP gagné{me.winStreak > 1 ? 's' : ''} d'affilée</b>{' '}
            <span className="text-muted">· bonus à 3</span>
          </span>
        ) : (
          <span className="text-muted">Pas de série en cours</span>
        )}
      </div>
      <div className="border-t border-border/60 mt-3 pt-3">
        <FaceLeague players={list} me={me} formLength={count} />
      </div>
    </StatsCard>
  )
}
