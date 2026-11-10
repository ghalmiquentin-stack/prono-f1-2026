import { useState } from 'react'
import { Timer, RefreshCw, Plus } from 'lucide-react'

const TYPE = {
  change: { label: 'Modification', short: 'Modif.', Icon: RefreshCw, size: 18 },
  late: { label: 'Pronostic tardif', short: 'Tardif', Icon: Timer, size: 19 },
}

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`

// Montant proposé = celui des règles de la ligue (même valeur par défaut qu'avant si absent ou nul)
export function ruleAmount(rules, type) {
  const rule = type === 'late' ? rules?.postQualifsPenalty : rules?.modificationPenalty
  const fallback = type === 'late' ? 10 : 5
  return typeof rule?.amount === 'number' && rule.amount > 0 ? rule.amount : fallback
}

function ruleDisabled(rules, type) {
  const rule = type === 'late' ? rules?.postQualifsPenalty : rules?.modificationPenalty
  return rule?.enabled === false
}

// Règles de l'ajout (maquette validée le 9 nov. 2026) : chaque bouton dit pourquoi il est actif ou grisé.
//   Tardif : actif si le pronostic est arrivé après les qualifs ET n'est pas déjà pénalisé
//            (si l'heure des qualifs du GP est inconnue, on laisse l'admin juger)
//   Modif. : actif s'il reste au moins une modification gratuite (modifications - pénalités de modification)
//   Sans pronostic : rien à pénaliser
export function addRules({ pred, d, rules }) {
  if (!pred) {
    const text = 'pas de pronostic pour ce GP.'
    return { late: { off: true, text }, change: { off: true, text } }
  }
  const late = d.late === 'unpenalized'
    ? { off: false, text: 'envoi après les qualifs, sans pénalité.' }
    : d.late === 'penalized'
      ? { off: true, text: 'déjà pénalisé pour envoi après les qualifs.' }
      : d.late === 'unknown'
        ? { off: false, text: "heure des qualifs inconnue pour ce GP, à toi de juger." }
        : { off: true, text: 'pronostic envoyé avant les qualifs.' }

  const free = d.mods - d.pens.changeCount
  const change = free > 0
    ? { off: false, text: `${plural(free, 'modification')} gratuite${free > 1 ? 's' : ''} à pénaliser.` }
    : d.mods > 0
      ? { off: true, text: 'toutes ses modifications sont déjà pénalisées.' }
      : { off: true, text: "le podium n'a pas été modifié." }

  // Règle désactivée dans la ligue : la pénalité reste possible à la main, au montant des règles
  if (!late.off && ruleDisabled(rules, 'late')) late.text += ' Règle désactivée dans la ligue.'
  if (!change.off && ruleDisabled(rules, 'change')) change.text += ' Règle désactivée dans la ligue.'
  return { late, change }
}

// Deux boutons directs (avec « + »), puis une phrase par bouton qui explique la règle
export function AddPenaltyZone({ pred, d, rules, onPick }) {
  const r = addRules({ pred, d, rules })
  const Btn = ({ type }) => {
    const t = TYPE[type]
    const rule = r[type]
    return (
      <button
        onClick={() => onPick(type)}
        disabled={rule.off}
        className={`flex-1 min-w-0 rounded-lg border border-border bg-surfaceHigh text-sm font-bold flex items-center justify-center gap-1 px-2 ${rule.off ? 'text-muted opacity-50' : 'active:opacity-70'}`}
        style={{ minHeight: 44 }}
      >
        <Plus size={15} strokeWidth={3} />
        <t.Icon size={15} className={rule.off ? '' : 'text-accent'} />
        <span className="whitespace-nowrap">{t.short} −{ruleAmount(rules, type)}</span>
      </button>
    )
  }
  const Line = ({ type }) => (
    <p className="text-[11px] text-muted">
      <span className={`font-bold ${r[type].off ? '' : 'text-white'}`}>{TYPE[type].short}</span> · {r[type].text}
    </p>
  )
  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-widest text-white">Ajouter une pénalité</p>
      <div className="flex gap-2"><Btn type="late" /><Btn type="change" /></div>
      <div className="space-y-0.5"><Line type="late" /><Line type="change" /></div>
    </div>
  )
}

function PenaltyCard({ player, race, type, amount, sub }) {
  const t = TYPE[type] ?? TYPE.change
  return (
    <div className="card p-3 flex items-center gap-3">
      <span style={{ width: 36, height: 36 }} className="rounded-full bg-surfaceHigh flex items-center justify-center shrink-0"><t.Icon size={t.size} className="text-accent" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold"><span style={{ color: player.color }}>{player.name}</span> · {t.label}</p>
        <p className="text-[11px] text-muted">{race.flag} {race.name} · {sub}</p>
      </div>
      <span className="font-black text-sm text-accent shrink-0">−{amount}</span>
    </div>
  )
}

// Confirmation d'un ajout ou d'un retrait (même gabarit). `onConfirm(motif)` renvoie { ok, error }.
export function ConfirmPenalty({ kind, player, race, type, pen, amount, whenText, onCancel, onConfirm }) {
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const add = kind === 'add'

  const go = async () => {
    setBusy(true)
    setError('')
    const res = await onConfirm(motif.trim())
    setBusy(false)
    if (!res?.ok) setError(res?.error ?? 'Une erreur est survenue. Réessaie.')
  }

  return (
    <div className="px-5 py-4 space-y-4">
      {add
        ? <PenaltyCard player={player} race={race} type={type} amount={amount} sub="ajoutée par vous" />
        : <PenaltyCard player={player} race={race} type={pen.type} amount={amount} sub={`${pen.source === 'auto' ? 'Automatique' : 'Par un admin'}${whenText ? ` · ${whenText}` : ''}`} />}

      {add ? (
        <p className="text-sm">
          {player.name} perd {amount} pts.
          {type === 'change' ? ' Sa modification apparaîtra comme pénalisée sur son pronostic.' : ' Son envoi apparaîtra comme tardif sur son pronostic.'}
        </p>
      ) : (
        <p className="text-sm">
          Les −{amount} pts sont rendus à {player.name}.
          {pen.type === 'change'
            ? ' La modification reste visible sur son pronostic, comme gratuite.'
            : " L'heure d'envoi reste visible sur son pronostic."}
        </p>
      )}

      {add && (
        <div>
          <label className="text-xs font-bold text-muted block mb-1.5">Motif (facultatif)</label>
          <input
            value={motif}
            onChange={e => setMotif(e.target.value)}
            maxLength={120}
            className="input-field"
            placeholder="Ex. : envoi hors délai constaté"
            disabled={busy}
          />
          <p className="text-[11px] text-muted mt-1.5">Gardé avec la pénalité, visible dans la fiche du joueur.</p>
        </div>
      )}

      {error && <p className="text-accent text-xs font-bold">{error}</p>}

      <button
        onClick={go}
        disabled={busy}
        className={`w-full rounded-xl text-white font-black text-base active:scale-95 disabled:opacity-60 ${add ? 'bg-accent shadow-glow-red' : 'bg-red-700'}`}
        style={{ minHeight: 48 }}
      >
        {busy ? (add ? 'Ajout…' : 'Retrait…') : (add ? 'Ajouter la pénalité' : 'Retirer la pénalité')}
      </button>
      <button onClick={onCancel} disabled={busy} className="w-full rounded-xl text-sm font-bold text-muted active:bg-surfaceHigh disabled:opacity-50" style={{ minHeight: 44 }}>Annuler</button>
    </div>
  )
}

