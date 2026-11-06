import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import StatsCard from './StatsCard'
import { getDriverTeam, getTeamColor } from '../../data/drivers'
import { oneDecimal } from '../../utils/statsFormat'

// « Mes pilotes » : les pilotes que j'ai pronostiqués, classés par points rapportés (ordre strict).
// Quatre étiquettes, posées sur la ligne du pilote concerné :
//   Le plus rentable : celui qui m'a rapporté le plus de points ;
//   Le plus joué     : celui que j'ai le plus pronostiqué ;
//   Ma pépite        : la meilleure moyenne de points par pronostic (au moins 3 fois) ;
//   Mon chat noir    : la moins bonne moyenne (au moins 3 fois).
// Vue réduite : les 3 premiers, plus les pilotes étiquetés qui n'en font pas partie.

const MIN_PICKS = 3
const TAG_COLOR = { 'Le plus rentable': 'text-gold', 'Ma pépite': 'text-gold', 'Le plus joué': 'text-muted', 'Mon chat noir': 'text-accent' }

function buildRows(me, leagueDrivers) {
  const rows = Object.entries(me.drivers)
    .map(([name, o]) => {
      const league = leagueDrivers[name]
      return {
        name,
        count: o.n,
        points: o.pts,
        perPick: o.pts / o.n,
        leaguePerPick: league ? league.pts / league.n : 0,
        team: getDriverTeam(name)?.name ?? '',
        tags: [],
      }
    })
    .sort((a, b) => b.points - a.points || b.count - a.count)
  if (!rows.length) return rows

  rows[0].tags.push('Le plus rentable')
  const mostPicks = Math.max(...rows.map(r => r.count))
  rows.filter(r => r.count === mostPicks).sort((a, b) => b.points - a.points)[0].tags.push('Le plus joué')
  const eligible = rows.filter(r => r.count >= MIN_PICKS)
  const gem = [...eligible].sort((a, b) => b.perPick - a.perPick || b.count - a.count)[0]
  if (gem) gem.tags.push('Ma pépite')
  const cat = eligible.filter(r => r !== gem).sort((a, b) => a.perPick - b.perPick || b.count - a.count)[0]
  if (cat) cat.tags.push('Mon chat noir')
  return rows
}

export default function PilotsCard({ data }) {
  const { me, leagueDrivers } = data
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(() => buildRows(me, leagueDrivers), [me, leagueDrivers])
  if (!rows.length) return null

  const shown = showAll ? rows : rows.filter((r, i) => i < 3 || r.tags.length > 0)
  const hidden = rows.length - shown.length

  return (
    <StatsCard title="Mes pilotes" sub="Classés par points rapportés. La moyenne est en points par pronostic.">
      <ol className="divide-y divide-border/60">
        {shown.map(r => (
          <li key={r.name} className="flex items-center gap-3 py-2.5">
            <span className="w-5 text-center text-sm font-black text-muted">{rows.indexOf(r) + 1}</span>
            <span className="w-1 self-stretch rounded-full" style={{ background: getTeamColor(r.name) || '#9494AC' }} />
            <div className="flex-1 min-w-0">
              {r.tags.length > 0 && (
                <p className="text-[11px] uppercase font-bold tracking-wide flex flex-wrap gap-x-2 leading-snug">
                  {r.tags.map(t => <span key={t} className={TAG_COLOR[t]}>{t}</span>)}
                </p>
              )}
              <p className="font-black leading-tight">{r.name} <span className="text-[11px] text-muted font-normal">{r.team}</span></p>
              <p className="text-xs text-muted leading-snug">
                Joué {r.count} fois · <b className="text-white/90 font-bold">{oneDecimal(r.perPick)}</b> pts par pronostic
              </p>
              <p className="text-xs text-muted leading-snug">
                Moyenne de la ligue : <b className="text-white/90 font-bold">{oneDecimal(r.leaguePerPick)}</b>
              </p>
            </div>
            <p className="font-black text-lg tabular-nums">{r.points}<span className="text-[11px] text-muted font-normal"> pts</span></p>
          </li>
        ))}
      </ol>
      {(hidden > 0 || showAll) && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full min-h-[44px] flex items-center justify-center gap-1 text-sm font-bold text-muted"
        >
          {showAll ? 'Réduire' : `Voir les ${hidden} autres pilotes`}
          <ChevronDown size={16} className={showAll ? 'rotate-180' : ''} />
        </button>
      )}
    </StatsCard>
  )
}
