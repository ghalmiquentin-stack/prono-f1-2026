import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import StatsCard from './StatsCard'
import { signedPoints } from '../../utils/standings'

// « Changer d'avis, ça paie ? » : je compare mon premier podium à mon podium final, pénalités
// comprises. Les 3 dernières modifications ; le reste est replié. La carte n'existe pas pour
// un joueur qui n'a jamais modifié un pronostic (rien à montrer).

const netOf = m => m.delta - m.pen
const balance = p => p.mods.reduce((s, m) => s + netOf(m), 0)
const tone = v => (v > 0 ? 'text-green-400' : v < 0 ? 'text-accent' : 'text-muted')

export default function ModsCard({ data }) {
  const { me, list, completed } = data
  const [showAll, setShowAll] = useState(false)
  if (me.mods.length === 0) return null

  const mods = [...me.mods].sort((a, b) => b.k - a.k)
  const gain = mods.reduce((s, m) => s + m.delta, 0)
  const penalties = mods.reduce((s, m) => s + m.pen, 0)
  const net = gain - penalties
  const shown = showAll ? mods : mods.slice(0, 3)

  const changed = list.filter(p => p.mods.length > 0)
  const average = changed.length ? Math.round(changed.reduce((s, p) => s + balance(p), 0) / changed.length) : 0

  return (
    <StatsCard title="Changer d'avis, ça paie ?" sub="Je compare mon premier podium à mon podium final.">
      <div className="text-center">
        <p className={`text-4xl font-black ${net >= 0 ? 'text-green-400' : 'text-accent'}`}>{signedPoints(net)} pts</p>
        <p className="text-xs text-muted mt-0.5">en changeant d'avis sur {mods.length} GP</p>
      </div>
      <p className="text-sm text-center mt-2 leading-snug text-muted">
        Tes modifications {gain >= 0
          ? <>t'ont rapporté <b className="text-white">+{gain} pts</b></>
          : <>t'ont fait perdre <b className="text-white">{-gain} pts</b></>}
        {penalties > 0 ? <> et t'ont coûté <b className="text-white">{penalties} pts</b> de pénalités</> : ' sans aucune pénalité'}.
      </p>

      <p className="text-[11px] uppercase text-muted font-bold mt-4">{mods.length > 3 && !showAll ? 'Mes 3 dernières modifications' : 'Mes modifications'}</p>
      <ul className="divide-y divide-border/60">
        {shown.map(m => {
          const value = netOf(m)
          const paid = m.pen > 0
          return (
            <li key={m.k} className="py-2.5 flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">{completed[m.k].flag}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">GP {completed[m.k].name}</p>
                <p className="text-[11px] text-muted leading-snug">Premier podium : {m.before} pts · Podium final : {m.after} pts</p>
                <p className={`text-[11px] leading-snug font-bold ${paid ? 'text-accent' : 'text-muted'}`}>
                  {paid ? `Après le départ des qualifs · pénalité −${m.pen}` : 'Avant les qualifs · gratuit'}
                </p>
              </div>
              <span className={`font-black text-sm w-10 text-right ${tone(value)}`}>{signedPoints(value)}</span>
            </li>
          )
        })}
      </ul>
      {mods.length > 3 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full min-h-[44px] flex items-center justify-center gap-1 text-sm font-bold text-muted"
        >
          {showAll ? 'Réduire' : `Voir les ${mods.length - 3} autres`}
          <ChevronDown size={16} className={showAll ? 'rotate-180' : ''} />
        </button>
      )}
      {changed.length > 1 && (
        <p className="text-xs text-muted mt-1">
          Moyenne de ceux qui ont modifié : <b className="text-white">{signedPoints(average)} pts</b> (toi {signedPoints(net)})
        </p>
      )}
    </StatsCard>
  )
}
