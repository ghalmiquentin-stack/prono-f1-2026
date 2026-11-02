import { useState } from 'react'

// State machine behind "Valider" for an action that may be penalised.
//   request(): asks getContext() (called at click time, with the clock of that
//     instant) — no penalty -> save() straight away, as before; penalty -> the
//     context is held in `pending` so the caller opens its confirmation.
//   confirm(): closes the confirmation, then save().
//   cancel()/reset(): closes the confirmation and writes nothing; the caller's
//     own state (draft, open sheet) is untouched.
// `save` is the caller's own save function and is never wrapped or altered.
export function usePenaltyConfirm({ getContext, save }) {
  const [pending, setPending] = useState(null)

  const request = () => {
    const context = getContext()
    if (!context || context.kind == null) {
      save()
      return
    }
    setPending(context)
  }

  const confirm = () => {
    setPending(null)
    save()
  }

  const cancel = () => setPending(null)

  return { pending, request, confirm, cancel, reset: cancel }
}
