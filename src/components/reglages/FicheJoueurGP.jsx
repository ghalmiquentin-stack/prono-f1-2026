import { Timer, RefreshCw, Clock, Check, Trash2 } from 'lucide-react'
import Portrait from '../sheet/Portrait'
import { driverCode } from '../../utils/sheetStats'
import { getPenaltyAmount, summarizePenalties } from '../../utils/penalties'
import { getModificationCount } from '../../utils/predictions'
import { formatPredTime, formatModifiedLine, formatHourMinute, toValidDate } from '../PredictionTimestamps'

const FREE = '#38BDF8' // modification gratuite (comme l'Accueil)
const PEN = '#E8002D'  // pénalisée (comme l'Accueil)
const OK = '#22C55E'
const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32']
const POSITIONS = ['P1', 'P2', 'P3']
const TYPE = {
  change: { label: 'Modification', Icon: RefreshCw, size: 18 },
  late: { label: 'Pronostic tardif', Icon: Timer, size: 19 },
}

function Section({ children, right }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <p className="text-xs font-black uppercase tracking-widest text-white">{children}</p>
      {right}
    </div>
  )
}

function Chip({ tone, children, icon }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 rounded-full whitespace-nowrap shrink-0" style={{ color: tone, background: `${tone}22`, minHeight: 26 }}>
      {icon}{children}
    </span>
  )
}

// « 7 nov. à 12h31 » : heure du serveur pour une pénalité automatique, sinon date de création
export function formatPenaltyWhen(pen) {
  const date = toValidDate(pen.source === 'auto' ? (pen.eventTime ?? pen.createdAt) : pen.createdAt)
  if (!date) return null
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${day} à ${formatHourMinute(date)}`
}

// Ce qu'on sait du pronostic d'un joueur pour un GP (mêmes sources que l'Accueil)
export function describeProno({ pred, penalties, playerId, race }) {
  const mods = getModificationCount(pred)
  const pens = summarizePenalties(penalties, playerId, race.id)
  const autoPens = penalties.filter(p => p.source === 'auto' && p.playerId === playerId && p.raceId === race.id)
  const latestServerDate = (list) => list.map(p => toValidDate(p.eventTime)).filter(Boolean).sort((a, b) => b - a)[0] ?? null
  const latePens = autoPens.filter(p => p.type === 'late')
  const changePens = autoPens.filter(p => p.type === 'change')

  const submittedDate = latestServerDate(latePens) ?? toValidDate(pred.submittedAt)
  const modifiedDate = latestServerDate(changePens) ?? toValidDate(pred.modifiedAt)
  const qualStart = toValidDate(race.qualifyingStartAt)

  // tardif : pénalisé (une pénalité tardive existe), non pénalisé (envoi après les qualifs sans pénalité), ou à temps
  const late = pens.lateCount > 0 ? 'penalized'
    : !qualStart ? 'unknown' // heure des qualifs inconnue : on ne dit ni « à temps » ni « tardif »
      : (submittedDate && submittedDate >= qualStart ? 'unpenalized' : 'none')

  const changed = POSITIONS.map(pos => mods > 0 && !!pred.initialPrediction && pred.prediction?.[pos] !== pred.initialPrediction?.[pos])
  return {
    mods, pens, late, changed,
    submitted: formatPredTime(submittedDate),
    modLine: formatModifiedLine(mods, changePens.length, modifiedDate ? formatHourMinute(modifiedDate) : null),
    penalizedMod: pens.changeTotal > 0,
  }
}

function PodiumCards({ pred, d, drivers }) {
  const tone = d.penalizedMod ? PEN : FREE
  return (
    <div className="grid grid-cols-3 gap-2">
      {POSITIONS.map((pos, i) => (
        <div key={pos} className="relative rounded-lg border bg-surface/60 py-2 flex flex-col items-center gap-1 min-w-0" style={{ borderColor: d.changed[i] ? tone : '#2E2E42' }}>
          <span className="text-[11px] font-black" style={{ color: MEDAL[i] }}>{i + 1}</span>
          <Portrait drivers={drivers} name={pred.prediction?.[pos]} className="w-10 h-10" />
          <span className="text-[11px] font-bold truncate w-full text-center">{driverCode(drivers, pred.prediction?.[pos])}</span>
          {d.changed[i] && (
            <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-bg" style={{ background: tone }}>
              <RefreshCw size={11} />
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Pronostic({ pred, d, drivers, hidden }) {
  const late = d.late === 'penalized' || d.late === 'unpenalized'
  const tone = d.penalizedMod ? PEN : FREE
  return (
    <div className="space-y-3">
      {hidden ? (
        <p className="rounded-lg border border-border bg-surface/60 px-3 py-3 text-sm text-muted">Podium masqué jusqu'au départ de la course, comme pour les joueurs.</p>
      ) : (
        <>
          <PodiumCards pred={pred} d={d} drivers={drivers} />
          {d.changed.some(Boolean) && (
            <p className="text-xs text-muted">Premier podium : {POSITIONS.map(pos => driverCode(drivers, pred.initialPrediction?.[pos])).join(' · ')}</p>
          )}
        </>
      )}

      {d.submitted && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {late ? <Timer size={17} className="shrink-0" style={{ color: PEN }} /> : <Clock size={17} className="shrink-0 text-white" />}
          <p className="min-w-0 text-sm font-bold" style={{ flex: '1 1 150px', ...(late ? { color: PEN } : {}) }}>
            Soumis le {d.submitted}
          </p>
          {late
            ? <Chip tone={PEN}>{d.late === 'penalized' ? 'Tardif' : 'Tardif, non pénalisé'}</Chip>
            : d.late === 'none' && <Chip tone={OK} icon={<Check size={12} />}>À temps</Chip>}
        </div>
      )}

      {d.modLine && (
        <div className="flex items-start gap-2">
          <RefreshCw size={17} className="shrink-0 mt-px" style={{ color: tone }} />
          <p className="flex-1 min-w-0 text-sm font-bold" style={{ color: tone }}>{d.modLine}</p>
        </div>
      )}
    </div>
  )
}

function PenaltyList({ list, onRemove }) {
  const total = list.reduce((t, p) => t + getPenaltyAmount(p), 0)
  return (
    <div>
      <Section right={total > 0 ? <span className="text-lg font-black text-accent">−{total} pts</span> : null}>Pénalités</Section>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucune pénalité.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map(pen => {
            const t = TYPE[pen.type] ?? TYPE.change
            const when = formatPenaltyWhen(pen)
            return (
              <div key={pen._id} className="flex items-center gap-3 py-2" style={{ minHeight: 60 }}>
                <span style={{ width: 36, height: 36 }} className="rounded-full bg-surfaceHigh flex items-center justify-center shrink-0"><t.Icon size={t.size} className="text-accent" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{t.label}</p>
                  <p className="text-[11px] text-muted">{pen.source === 'auto' ? 'Automatique' : 'Par un admin'}{when ? ` · ${when}` : ''}</p>
                  {pen.motif && <p className="text-[11px] italic break-words">« {pen.motif} »</p>}
                </div>
                <span className="font-black text-sm text-accent shrink-0">−{getPenaltyAmount(pen)}</span>
                {onRemove && (
                  <button onClick={() => onRemove(pen)} aria-label="Retirer la pénalité" className="shrink-0 rounded-lg border border-border flex items-center justify-center text-muted active:bg-surfaceHigh" style={{ width: 44, height: 44 }}>
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Fiche d'un joueur pour un GP (maquette validée le 9 nov. 2026) : pronostic (podium, soumission,
// modifications), pénalités, et en dessous les actions de l'admin (`children`, ajoutées plus tard).
// Si les pronostics sont masqués jusqu'au départ, le podium n'est jamais montré, même à l'admin.
export default function FicheJoueurGP({ player, race, pred, penalties, drivers, hidden, onRemovePenalty, children }) {
  const list = penalties.filter(p => p.playerId === player.id && p.raceId === race.id)
  const d = pred ? describeProno({ pred, penalties, playerId: player.id, race }) : null
  return (
    <div className="px-5 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none shrink-0">{player.avatar}</span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-lg leading-tight break-words" style={{ color: player.color }}>{player.name}</p>
          <p className="text-xs text-muted">{race.flag} GP {race.name}</p>
        </div>
      </div>

      <div>
        <Section>Pronostic</Section>
        {pred
          ? <Pronostic pred={pred} d={d} drivers={drivers} hidden={hidden} />
          : <p className="text-sm text-muted">Pas de pronostic pour ce GP.</p>}
      </div>

      <PenaltyList list={list} onRemove={onRemovePenalty} />

      {children}
    </div>
  )
}
