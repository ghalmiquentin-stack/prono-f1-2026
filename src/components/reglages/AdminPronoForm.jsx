import { useMemo, useState } from 'react'
import { UserCog, ArrowRight } from 'lucide-react'
import Portrait from '../sheet/Portrait'
import { PodiumCard } from '../sheet/PodiumSlots'
import DriverPicker from '../sheet/DriverPicker'
import { driverCode } from '../../utils/sheetStats'
import { getPenaltyAmount } from '../../utils/penalties'
import { podiumOf, samePodium, penaltyOptionFor, projectImpact } from '../../utils/adminInterventions'
import { formatAdminWhen } from '../AdminEntry'

const POSITIONS = ['P1', 'P2', 'P3']
const MIN_MOTIF = 5
const MOTIFS = ['Envoi perdu : application fermée avant la confirmation', 'Problème technique constaté', 'Erreur de saisie corrigée à sa demande']

function MiniPodium({ picks, drivers, dim }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${dim ? 'opacity-60' : ''}`}>
      {POSITIONS.map((pos, i) => (
        <span key={pos} className="flex items-center gap-1 rounded-md border border-border bg-surface/60 px-1.5 py-1">
          <span className="text-[11px] font-black" style={{ color: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }}>{i + 1}</span>
          <Portrait drivers={drivers} name={picks?.[pos]} className="w-5 h-5" />
          <span className="text-[11px] font-semibold">{driverCode(drivers, picks?.[pos])}</span>
        </span>
      ))}
    </div>
  )
}

function Radio({ on, onClick, title, sub }) {
  return (
    <button type="button" onClick={onClick} role="radio" aria-checked={on} className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-3 ${on ? 'border-white/60 bg-white/[0.07]' : 'border-border bg-surfaceHigh/40'}`} style={{ minHeight: 56 }}>
      <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-white' : 'border-muted'}`}>{on && <span className="w-2 h-2 rounded-full bg-white" />}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight">{title}</span>
        <span className="block text-[11px] text-muted leading-snug mt-0.5">{sub}</span>
      </span>
    </button>
  )
}

// Formulaire de l'admin : saisir le prono d'un joueur qui n'en a pas, ou corriger le sien (maquette validée le
// 23 nov. 2026). Motif OBLIGATOIRE, choix de la pénalité (celle de la ligue ou aucune), aperçu de ce que toute
// la ligue verra, effet sur le classement. `onSave(params)` écrit le lot et renvoie { ok, error }.
export default function AdminPronoForm({
  player, race, pred, league, players, predictions, penalties, races, drivers, adminName, onSave, onCancel,
}) {
  const isEdit = !!pred
  const current = isEdit ? podiumOf(pred.prediction) : null
  const [draft, setDraft] = useState(current ?? { P1: null, P2: null, P3: null })
  const [position, setPosition] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [motif, setMotif] = useState('')
  const [choice, setChoice] = useState('applied')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  const complete = POSITIONS.every(p => draft[p])
  const changed = !isEdit || !samePodium(draft, current)
  const motifOk = motif.trim().length >= MIN_MOTIF
  const option = penaltyOptionFor({ league, race, isEdit, now })
  const askPenalty = option.applicable
  const penaltyChoice = askPenalty ? choice : 'none'
  const typeLabel = isEdit ? 'de modification' : 'de retard'

  // Même logique que la feuille de prono : on enchaîne les trois places, le pilote déjà pris ailleurs est déplacé.
  const selectDriver = (driver) => {
    if (!position) return
    const next = { ...draft }
    for (const pos of POSITIONS) if (next[pos] === driver && pos !== position) next[pos] = null
    next[position] = driver
    setDraft(next)
    const from = POSITIONS.indexOf(position)
    const nextPos = [1, 2, 3].map(i => POSITIONS[(from + i) % 3]).find(pos => !next[pos])
    if (nextPos) setPosition(nextPos)
  }
  const choosePicked = (driver) => {
    if (!position) return
    if (draft[position] === driver) { setDraft(d => ({ ...d, [position]: null })); return }
    selectDriver(driver)
  }
  const closePicker = () => { setPickerOpen(false); setPosition(null) }
  const openPicker = (pos) => { setPosition(pos); setPickerOpen(true) }

  const impact = useMemo(() => (complete && changed ? projectImpact({
    players, races, predictions, penalties, playerId: player.id, race, picks: draft,
    penalty: penaltyChoice === 'applied' ? { type: option.type, amount: option.amount } : null,
  }) : null), [complete, changed, players, races, predictions, penalties, player.id, race, draft, penaltyChoice, option.type, option.amount])

  // Pénalités déjà posées au joueur pour ce GP : on les rappelle (elles restent, l'intervention n'y touche pas).
  const existingPenalties = penalties.filter(p => p.playerId === player.id && p.raceId === race.id)
  const existingTotal = existingPenalties.reduce((s, p) => s + getPenaltyAmount(p), 0)

  const go = async () => {
    if (!complete || !changed || !motifOk || busy) return
    setBusy(true); setError('')
    const res = await onSave({
      leagueId: league?._id ?? pred?.leagueId, race, player: { id: player.id, name: player.name }, existing: pred ?? null,
      picks: draft, motif: motif.trim(), penaltyChoice, penalty: { type: option.type, amount: option.amount },
    })
    setBusy(false)
    if (!res?.ok) setError(res?.error ?? 'Une erreur est survenue. Réessaie.')
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <p className="font-black text-lg leading-tight"><span style={{ color: player.color }}>{player.name}</span> <span className="text-sm font-bold text-muted">· {race.flag} GP {race.name}</span></p>
        <p className="text-xs text-muted mt-1">{isEdit ? 'Corrige son prono : l\'ancien podium reste visible dans le journal de la ligue.' : 'Saisis le prono que ce joueur n\'a pas pu enregistrer.'}</p>
      </div>

      {isEdit && (
        <div>
          <p className="text-[11px] uppercase text-muted font-bold mb-1.5">Prono actuel</p>
          <MiniPodium picks={current} drivers={drivers} dim />
        </div>
      )}

      <div>
        <p className="text-[11px] uppercase text-muted font-bold mb-1.5">{isEdit ? 'Nouveau podium' : 'Podium'} · touche une place pour la changer</p>
        <PodiumCard values={draft} drivers={drivers} onTapPos={openPicker} />
      </div>

      {askPenalty && (
        <div role="radiogroup" aria-label={`Pénalité ${typeLabel}`} className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-white">Pénalité {typeLabel}</p>
          <Radio on={choice === 'applied'} onClick={() => setChoice('applied')} title={`Appliquer la pénalité de la ligue : −${option.amount} pts`} sub={isEdit ? 'Comme une modification faite après les qualifs.' : 'Comme un prono envoyé après les qualifs.'} />
          <Radio on={choice === 'waived'} onClick={() => setChoice('waived')} title="Ne pas l'appliquer" sub="Toute la ligue le verra, avec ton motif." />
          {option.qualifsStarted === null && <p className="text-[11px] text-muted">Heure des qualifs inconnue pour ce GP : à toi de juger.</p>}
        </div>
      )}
      {!askPenalty && option.enabled && option.qualifsStarted === false && (
        <p className="text-xs text-muted rounded-xl bg-surfaceHigh/60 px-3 py-2.5">Les qualifs n'ont pas commencé : aucune pénalité {typeLabel} à choisir.</p>
      )}

      <div>
        <label htmlFor="admin-motif" className="text-xs font-black uppercase tracking-widest text-white block mb-1.5">
          Motif <span className="text-accent">*</span> <span className="text-muted normal-case tracking-normal font-normal">visible par toute la ligue</span>
        </label>
        <textarea id="admin-motif" value={motif} onChange={e => setMotif(e.target.value)} rows={2} maxLength={200} disabled={busy}
          placeholder="Explique pourquoi tu interviens" className="w-full rounded-lg bg-surfaceHigh border border-border px-3 py-2 text-sm placeholder:text-muted outline-none focus:border-white/30" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {MOTIFS.map(m => (
            <button key={m} type="button" onClick={() => setMotif(m)} disabled={busy} className="text-[11px] font-bold rounded-full border border-border px-2.5 text-white/80" style={{ minHeight: 32 }}>{m}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase text-muted font-bold mb-1.5">Ce que la ligue verra</p>
        <div className="rounded-xl border border-white/30 bg-white/[0.05] p-3 space-y-2">
          <p className="text-sm font-bold flex items-start gap-2"><UserCog size={16} className="shrink-0 mt-px" />{adminName} (admin) a {isEdit ? 'corrigé' : 'saisi'} le prono de {player.name}</p>
          <p className="text-[11px] text-muted">{race.flag} GP {race.name} · {formatAdminWhen(new Date(now))}</p>
          <p className="text-sm italic break-words">{motif.trim() ? `« ${motif.trim()} »` : <span className="text-muted not-italic">Le motif apparaîtra ici.</span>}</p>
          {isEdit && (
            <div className="flex items-center gap-2 flex-wrap"><MiniPodium picks={current} drivers={drivers} dim /><ArrowRight size={14} className="text-muted" /><MiniPodium picks={draft} drivers={drivers} /></div>
          )}
          {penaltyChoice !== 'none' && (
            <p className="text-xs font-bold">{penaltyChoice === 'applied' ? `Pénalité ${typeLabel} appliquée : −${option.amount} pts` : `Pénalité ${typeLabel} non appliquée`}</p>
          )}
        </div>
        {existingTotal > 0 && <p className="text-[11px] text-muted mt-1.5">Ses pénalités déjà posées pour ce GP (−{existingTotal} pts) ne changent pas.</p>}
      </div>

      {impact && (
        <div className="rounded-xl bg-surfaceHigh/60 px-3 py-2.5 text-sm flex items-center justify-between gap-3">
          <span className="text-muted">Au classement</span>
          <span className="font-black text-right">
            {player.name} <span className="text-muted font-bold">{impact.before.total} pts · {impact.before.rank}e</span> <ArrowRight size={13} className="inline mx-0.5" />{' '}
            <span style={{ color: player.color }}>{impact.after.total} pts · {impact.after.rank}e</span>
          </span>
        </div>
      )}

      {error && <p className="text-accent text-xs font-bold" role="alert">{error}</p>}

      <button type="button" onClick={go} disabled={!complete || !changed || !motifOk || busy}
        className={`w-full rounded-xl font-black text-base ${complete && changed && motifOk && !busy ? 'bg-accent text-white shadow-glow-red active:scale-95' : 'bg-surfaceHigh text-muted cursor-not-allowed'}`} style={{ minHeight: 48 }}>
        {busy ? 'Enregistrement…'
          : !complete ? 'Complète le podium'
            : !changed ? 'Le podium est identique'
              : !motifOk ? 'Le motif est obligatoire'
                : 'Enregistrer et publier à la ligue'}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="w-full rounded-xl text-sm font-bold text-muted active:bg-surfaceHigh disabled:opacity-50" style={{ minHeight: 44 }}>Annuler</button>

      <DriverPicker
        isOpen={pickerOpen} onClose={closePicker} onValidate={closePicker} onSelectPosition={setPosition} position={position}
        draft={draft} drivers={drivers} races={races} onChoose={choosePicked}
        lastPodium={null} previousPodium={[]} previousYear={null} raceFlag={race.flag}
      />
    </div>
  )
}
