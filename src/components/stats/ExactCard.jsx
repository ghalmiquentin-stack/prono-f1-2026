import StatsCard from './StatsCard'

// « Mes pronostics exacts » : à quelle place je vois juste (part de pronostics exacts),
// comparé à la moyenne de toute la ligue.

const PLACES = [
  { key: 'P1', label: 'Vainqueur' },
  { key: 'P2', label: '2e place' },
  { key: 'P3', label: 'Troisième' },
]

export default function ExactCard({ data }) {
  const { me, list } = data
  return (
    <StatsCard title="Mes pronostics exacts" sub="À quelle place je vois juste, comparé à la ligue.">
      <div className="grid grid-cols-3 gap-2">
        {PLACES.map(({ key, label }) => {
          const mine = me.place[key].n ? me.place[key].exact / me.place[key].n : 0
          const total = list.reduce((s, p) => s + p.place[key].n, 0)
          const league = total ? list.reduce((s, p) => s + p.place[key].exact, 0) / total : 0
          const gap = Math.round((mine - league) * 100)
          return (
            <div key={key} className="rounded-xl bg-surfaceHigh/60 p-2.5 text-center">
              <p className="text-[11px] text-muted font-bold">{label}</p>
              <p className="text-2xl font-black leading-tight" style={{ color: me.color }}>{Math.round(mine * 100)} %</p>
              <p className="text-[11px] text-muted">ligue {Math.round(league * 100)} %</p>
              <p className={`text-[11px] font-black ${gap >= 3 ? 'text-green-400' : 'text-muted'}`}>
                {gap >= 3 ? '▲ mieux' : gap <= -3 ? '▼ moins bien' : '= pareil'}
              </p>
            </div>
          )
        })}
      </div>
    </StatsCard>
  )
}
