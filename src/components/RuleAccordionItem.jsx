import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Switch from './Switch'

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
          <p className="text-xs text-muted mt-0.5">
            {hasAmount
              ? (checked ? `-${amount || 0} pts` : 'Désactivée')
              : (checked ? 'Activé' : 'Désactivé')}
          </p>
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
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={e => onAmountChange(e.target.value)}
                  className="input-field w-24"
                />
                <span className="text-xs text-muted">points</span>
              </div>
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
