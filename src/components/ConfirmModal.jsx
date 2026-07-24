// Generic lightweight confirm/cancel dialog — for simple confirmations that
// don't need the strict typed-confirmation flow (see DeleteLeagueSheet for
// that heavier case, e.g. deleting a league).
export default function ConfirmModal({ isOpen, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
              danger ? 'bg-red-600' : 'bg-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
