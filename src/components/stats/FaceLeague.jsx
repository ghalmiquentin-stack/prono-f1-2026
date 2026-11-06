import { useState } from 'react'
import { signedPoints } from '../../utils/standings'

// « Face à la ligue » : la forme de chacun sur une ligne, du moins en forme (à gauche)
// au plus en forme (à droite). Quatre repères cliquables au plus : moi, le moins en forme,
// la moyenne, le plus en forme. Les autres joueurs sont de petits points gris, non cliquables.
// Le repère touché est mis en avant (moi par défaut), son détail s'écrit sous la ligne.

const LINE = 39 // hauteur de la ligne dans le bloc de 56 px

const mean = list => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0)

export default function FaceLeague({ players, me, formLength }) {
  const [selected, setSelected] = useState('me')
  const sorted = [...players].sort((a, b) => b.form - a.form)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const forms = players.map(p => p.form)
  const lo = Math.min(...forms)
  const hi = Math.max(...forms)
  const avg = mean(forms)
  const pos = v => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100)

  const marks = [{ key: 'me', value: me.form, player: me }]
  if (best.id !== me.id) marks.push({ key: 'best', value: best.form, player: best })
  if (worst.id !== me.id && worst.id !== best.id) marks.push({ key: 'worst', value: worst.form, player: worst })
  marks.push({ key: 'avg', value: avg })
  const keyIds = new Set(marks.filter(m => m.player).map(m => m.player.id))
  const others = players.filter(p => !keyIds.has(p.id))

  // Valeurs écrites au-dessus des repères : on alterne les étages quand deux repères se touchent.
  const byValue = [...marks].sort((a, b) => a.value - b.value)
  const row = {}
  byValue.forEach((m, i) => {
    const prev = byValue[i - 1]
    row[m.key] = prev && Math.abs(pos(m.value) - pos(prev.value)) < 12 ? 1 - row[prev.key] : 0
  })

  const meRole = me.id === best.id ? ', le plus en forme' : me.id === worst.id ? ', le moins en forme' : ''
  const label = m => {
    if (m.key === 'me') return `Toi${meRole}`
    if (m.key === 'avg') return 'Moyenne de la ligue'
    return m.key === 'best' ? `Le plus en forme : ${m.player.name}` : `Le moins en forme : ${m.player.name}`
  }
  const current = marks.find(m => m.key === selected) ?? marks[0]
  const small = players.length > 8

  return (
    <div>
      <p className="text-sm font-bold">
        Face à la ligue{' '}
        <span className="text-muted font-normal text-xs">sur {formLength === 1 ? 'le dernier GP' : `les ${formLength} derniers GP`}</span>
      </p>
      <div className="px-2 mt-1">
        <div className="relative h-14">
          <div className="absolute left-0 right-0 h-[2px] bg-border rounded-full" style={{ top: LINE - 1 }} />
          {others.map(p => (
            <span
              key={p.id}
              className="absolute rounded-full bg-muted -translate-x-1/2 pointer-events-none"
              style={{ left: `${pos(p.form)}%`, top: LINE - (small ? 2.5 : 3.5), width: small ? 5 : 7, height: small ? 5 : 7, opacity: small ? 0.4 : 0.6 }}
            />
          ))}
          {/* La moyenne est un trait : il reste visible même sous un autre repère. */}
          <span
            className="absolute -translate-x-1/2 rounded bg-white pointer-events-none"
            style={{ left: `${pos(avg)}%`, top: LINE - 9, height: 18, width: current.key === 'avg' ? 4 : 2, opacity: current.key === 'avg' ? 1 : 0.8, zIndex: 1 }}
          />
          {marks.map(m => {
            const on = current.key === m.key
            return (
              <span key={m.key}>
                <button
                  onClick={() => setSelected(m.key)}
                  aria-label={`${label(m)} : ${signedPoints(Math.round(m.value))}`}
                  aria-pressed={on}
                  className="absolute -translate-x-1/2 w-11 h-[14px] flex items-center justify-center text-[11px] leading-none tabular-nums after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
                  style={{ left: `${pos(m.value)}%`, top: row[m.key] ? 0 : 15, zIndex: on ? 6 : 5, fontWeight: on ? 900 : 700, color: on ? '#fff' : '#9494AC' }}
                >
                  <span style={m.key === 'me' && on ? { color: me.color } : undefined}>{signedPoints(Math.round(m.value))}</span>
                </button>
                {m.key !== 'avg' && (
                  <button
                    onClick={() => setSelected(m.key)}
                    aria-label={label(m)}
                    aria-pressed={on}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center"
                    style={{ left: `${pos(m.value)}%`, top: LINE, zIndex: on ? 4 : 3 }}
                  >
                    <span
                      className={`block rounded-full ${on ? 'ring-2 ring-white' : ''}`}
                      style={{ width: m.key === 'me' ? 16 : 14, height: m.key === 'me' ? 16 : 14, background: m.player.color }}
                    />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>le moins en forme</span>
        <span>le plus en forme</span>
      </div>
      <p className="text-[11px] text-muted mt-2 min-h-[16px]" aria-live="polite">
        <b className="text-white">{label(current)}</b> : {signedPoints(Math.round(current.value))} pts sur{' '}
        {formLength === 1 ? 'le dernier GP' : `les ${formLength} derniers GP`}
      </p>
    </div>
  )
}
