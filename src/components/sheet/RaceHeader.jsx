import { Lock } from 'lucide-react'
import CircuitTrack from '../CircuitTrack'
import { CIRCUIT_FACTS } from '../../data/circuitFacts'
import { formatRaceLocalTimeWithTz, raceStartInstant } from '../../utils/races'
import { circuitLabel, countdownParts, formatKm, formatLongDate, ordinal } from '../../utils/sheetStats'

// En-tête de la feuille de GP : identité (macaron, drapeau, nom), puis deux
// encadrés alignés : à gauche le départ (ou le résultat du joueur / le statut),
// à droite le circuit (tracé, lieu, longueur, tours, record du tour).
//
// mode : 'upcoming' | 'cancelled' | 'completed'
// started : le départ du GP est passé (déjà calculé par la feuille avec useRaceTiming)
// result : (completed) { none, net, raw, bonus, pen, perfect, rank, tied, total, color }
// compact : version carte (Courses) : marges réduites, pas de filet en bas, colonne circuit plus étroite.
export default function RaceHeader({ race, round, mode, started, now, result, compact = false }) {
  const facts = CIRCUIT_FACTS[race.name]
  const timeWithTz = mode === 'cancelled' ? null : formatRaceLocalTimeWithTz(race)
  const [time, ...tzRest] = (timeWithTz ?? '').split(' ')
  const parts = mode === 'upcoming' && !started
    ? countdownParts(raceStartInstant(race).getTime() - now)
    : []
  const title = `GP ${race.name}`

  return (
    <div className={compact ? 'px-3 pb-3' : 'px-5 pt-1 pb-3 border-b border-border'}>
      <div className="flex items-center gap-2.5 min-h-[30px]">
        {round != null && (
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[13px] font-black shrink-0">{round}</div>
        )}
        <span className="text-2xl leading-none shrink-0">{race.flag}</span>
        <h2 className={`${title.length > 14 ? 'text-xl' : 'text-2xl'} font-black leading-tight min-w-0`}>{title}</h2>
      </div>

      <div className={`mt-2 grid ${compact ? 'grid-cols-[1fr_146px]' : 'grid-cols-[1fr_164px]'} gap-2`}>
        {/* Zone gauche */}
        <div className="rounded-xl bg-bg/50 border border-border/70 flex flex-col overflow-hidden">
          {mode === 'completed' ? (
            <CompletedLeft race={race} result={result} />
          ) : (
            <>
              <div className="flex-1 px-3 pt-2.5 flex flex-col justify-center">
                <p className={`text-[13px] font-bold leading-tight whitespace-nowrap ${mode === 'cancelled' ? 'line-through text-muted' : ''}`}>
                  {formatLongDate(race.date)}
                </p>
                {time && (
                  <p className="leading-none mt-1.5">
                    <span className="text-[32px] font-black">{time}</span>{' '}
                    <span className="text-xs text-muted">{tzRest.join(' ')}</span>
                  </p>
                )}
                {mode === 'cancelled' && (
                  <p className="text-xs text-muted mt-1.5 leading-snug">Date initiale, sans horaire</p>
                )}
              </div>
              <div className="px-3 py-1.5 border-t border-border/60 h-[48px] flex flex-col justify-center">
                {mode === 'cancelled' ? (
                  <>
                    <p className="text-[11px] text-muted leading-tight">Statut</p>
                    <p className="text-[13px] font-black leading-tight text-accent">Grand Prix annulé</p>
                  </>
                ) : started ? (
                  <>
                    <p className="text-[11px] text-muted leading-tight">Statut</p>
                    <p className="flex items-center gap-1.5 text-[13px] font-black leading-tight"><Lock size={12} className="text-muted" />Départ donné</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-muted leading-tight">Départ dans</p>
                    <div className="flex gap-1 mt-1">
                      {parts.map(p => (
                        <span key={p.unit} className="bg-surfaceHigh rounded-md px-1.5 py-px text-[13px] font-black tabular-nums leading-tight">
                          {p.n}<span className="text-[11px] text-muted font-bold ml-0.5">{p.unit}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Zone droite : circuit */}
        <div className="rounded-xl bg-bg/50 border border-border/70 flex flex-col overflow-hidden">
          <div className="flex-1 px-3 pt-1.5 pb-2.5 flex flex-col items-center">
            <CircuitTrack race={race} size={42} className="mb-0.5" />
            <p className="text-xs font-bold leading-tight text-center line-clamp-2">{circuitLabel(race)}</p>
            {facts && (
              <p className="text-[11px] text-muted leading-tight mt-0.5">{formatKm(facts.km)} · {facts.laps} tours</p>
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-border/60 h-[48px] flex flex-col justify-center text-center">
            {/* Carte étroite : l'année passe dans l'intitulé pour que la ligne du record tienne */}
            <p className="text-[11px] text-muted leading-tight">Record du tour{compact && facts?.record ? ` · ${facts.record.year}` : ''}</p>
            {facts?.record ? (
              <p className="text-[12px] leading-tight whitespace-nowrap">
                <span className="font-black tabular-nums">{facts.record.time}</span>{' '}
                <span className="text-muted">· {facts.record.driver}{compact ? '' : ` ${facts.record.year}`}</span>
              </p>
            ) : (
              <p className="text-[12px] leading-tight text-muted">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Zone gauche d'une course terminée : date, total du joueur en grand, son
// classement, puis le détail « Pronostic / Bonus / Pénalité ».
function CompletedLeft({ race, result }) {
  const r = result ?? { none: true }
  const showPen = r.pen > 0 || !r.perfect
  const three = r.perfect && showPen
  return (
    <>
      <div className="flex-1 px-3 py-2.5 flex flex-col justify-between">
        <p className="text-[13px] font-bold leading-tight whitespace-nowrap">{formatLongDate(race.date)}</p>
        <div>
          <p className="text-[11px] text-muted leading-tight">Ton total</p>
          <div className="flex items-end justify-between gap-1 mt-1">
            <p className="leading-none">
              <span className={`text-[32px] font-black ${r.none ? 'text-muted' : ''}`} style={r.none ? undefined : { color: r.color }}>{r.none ? '—' : r.net}</span>{' '}
              {!r.none && <span className="text-xs text-muted">pts</span>}
            </p>
            {!r.none && (
              <p className="text-[11px] text-muted leading-tight text-right pb-0.5">
                <span className="font-black text-white text-[13px]">{ordinal(r.rank)}</span><br />
                {r.tied ? 'ex æquo' : `sur ${r.total}`}
              </p>
            )}
          </div>
        </div>
      </div>
      {r.none ? (
        <div className="border-t border-border/60 h-[48px] px-3 flex flex-col justify-center">
          <p className="text-[11px] text-muted leading-tight">Ton pronostic</p>
          <p className="text-[13px] font-black leading-tight text-muted">Aucun pour ce GP</p>
        </div>
      ) : (
        <div className={`border-t border-border/60 h-[48px] grid divide-x divide-border/60 ${three ? 'grid-cols-[60px_42px_1fr]' : 'grid-cols-2'}`}>
          <div className={`${three ? 'pl-2.5 pr-0.5' : 'px-3'} flex flex-col justify-center`}>
            <p className="text-[11px] text-muted leading-tight">Pronostic</p>
            <p className="text-[13px] font-black leading-tight text-green-400">+{r.raw}</p>
          </div>
          {r.perfect && (
            <div className={`${three ? 'px-1.5' : 'px-3'} flex flex-col justify-center`}>
              <p className="text-[11px] text-muted leading-tight">Bonus</p>
              <p className="text-[13px] font-black leading-tight text-gold">+{r.bonus}</p>
            </div>
          )}
          {showPen && (
            <div className={`${three ? 'pl-2 pr-1' : 'px-3'} flex flex-col justify-center`}>
              <p className="text-[11px] text-muted leading-tight">Pénalité</p>
              <p className={`text-[13px] font-black leading-tight ${r.pen > 0 ? 'text-accent' : 'text-muted'}`}>{r.pen > 0 ? `-${r.pen}` : '0'}</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
