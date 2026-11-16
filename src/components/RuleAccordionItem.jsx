import { useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import Switch from './Switch'

// Montant d'une pénalité : au plus 3 chiffres, entier.
const MAX_AMOUNT = 999
const PILL = 'inline-flex items-center px-2.5 h-6 rounded-full border text-xs font-bold leading-none'
const PILL_OFF = `${PILL} border-border bg-surfaceHigh text-muted`
const PILL_ON = `${PILL} border-green-500/40 bg-green-500/15 text-green-400`

// État sous le titre : montant rouge en gras quand une pénalité est activée (comme partout dans l'app),
// pastille verte « Activé » pour une option sans montant, pastille grise quand c'est désactivé.
function Status({ hasAmount, checked, amount }) {
  if (hasAmount) {
    return checked
      ? <p className="text-base font-black text-accent mt-0.5">−{amount || 0} pts</p>
      : <div className="mt-1"><span className={PILL_OFF}>Désactivée</span></div>
  }
  return (
    <div className="mt-1">
      {checked ? <span className={PILL_ON}>Activé</span> : <span className={PILL_OFF}>Désactivé</span>}
    </div>
  )
}

// Vrais boutons « − » et « + » (zone de 44 px) ; le nombre reste modifiable au clavier numérique.
function AmountStepper({ value, onChange }) {
  const n = Number(value) || 0
  const set = (v) => onChange(String(Math.max(0, Math.min(MAX_AMOUNT, v))))
  const btn = 'w-11 h-11 rounded-lg border border-border bg-surfaceHigh flex items-center justify-center active:opacity-70 disabled:text-muted/40'
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => set(n - 1)} disabled={n <= 1} aria-label="Diminuer le montant" className={btn}>
        <Minus size={18} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
        aria-label="Montant en points"
        className="input-field !w-16 !px-0 text-center text-lg font-black"
      />
      <button type="button" onClick={() => set(n + 1)} disabled={n >= MAX_AMOUNT} aria-label="Augmenter le montant" className={btn}>
        <Plus size={18} />
      </button>
      <span className="text-xs text-muted ml-1">points</span>
    </div>
  )
}

export default function RuleAccordionItem({
  title,
  description,
  checked,
  onToggle,
  amount,
  onAmountChange,
  amountInvalid,
}) {
  const [open, setOpen] = useState(false)
  const hasAmount = onAmountChange != null

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <Status hasAmount={hasAmount} checked={checked} amount={amount} />
        </div>
        <div onClick={e => e.stopPropagation()}>
          <Switch checked={checked} onChange={onToggle} />
        </div>
        <ChevronDown
          size={16}
          className={`text-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="pb-4 space-y-3">
          <p className="text-xs text-muted leading-relaxed">{description}</p>
          {hasAmount && checked && (
            <div>
              <AmountStepper value={amount} onChange={onAmountChange} />
              {amountInvalid && (
                <p className="text-accent text-xs font-bold mt-1.5">
                  Le montant doit être supérieur à 0 si la pénalité est activée
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
