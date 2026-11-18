import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { formatAuthError } from '../hooks/useAuth'

// Hauteur de la barre de navigation du bas : le bouton se pose juste au-dessus.
const NAV_HEIGHT = 71
const MIN_LENGTH = 6
const SECTION = 'text-xs font-black uppercase tracking-widest text-white'

// Message affiché pour une erreur Firebase de changement de mot de passe. « Mot de passe actuel »
// incorrect = `wrong-password` ou `invalid-credential` (Firebase renvoie l'un ou l'autre).
function passwordErrorMessage(err) {
  const code = err?.code
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return { field: 'current', text: 'Mot de passe actuel incorrect.' }
  }
  if (code === 'auth/too-many-requests') {
    return { field: 'current', text: 'Trop de tentatives. Réessaie dans quelques minutes.' }
  }
  if (code === 'auth/weak-password') {
    return { field: 'next', text: `${MIN_LENGTH} caractères minimum` }
  }
  return { field: 'form', text: formatAuthError(err) }
}

function PasswordField({ label, value, onChange, onBlur, shown, onToggle, autoComplete, hint, error, autoFocus }) {
  return (
    <div>
      <p className={`${SECTION} mb-2`}>{label}</p>
      <div className="relative">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          className={`input-field !pr-12 ${shown ? '' : 'pwd-mask'} ${error ? '!border-accent' : ''}`}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute right-0 top-0 w-11 h-full flex items-center justify-center text-muted active:opacity-70"
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error
        ? <p className="text-accent text-xs font-bold mt-1.5" role="alert">{error}</p>
        : hint ? <p className="text-xs text-muted mt-1.5">{hint}</p> : null}
    </div>
  )
}

// Formulaire « Changer le mot de passe » (comptes e-mail) : mot de passe actuel, nouveau, confirmation.
// `onSubmit(current, next)` fait le vrai travail (ré-authentification puis changement) et lance l'erreur
// Firebase en cas d'échec ; `onDone` est appelé au succès. `onResetEmail` : secours pour celui qui ne
// connaît plus son mot de passe actuel (e-mail de réinitialisation).
export default function ChangePasswordForm({ onSubmit, onDone, onResetEmail, resetSending = false }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState({ current: false, next: false, confirm: false })
  const [touched, setTouched] = useState({ next: false, confirm: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState({ field: null, text: '' })

  // Les erreurs de saisie n'apparaissent qu'une fois le champ quitté (pas pendant la frappe).
  const tooShort = touched.next && next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next && (touched.confirm || confirm.length >= next.length)
  const same = next.length > 0 && next === current
  const valid = current.length > 0 && next.length >= MIN_LENGTH && confirm === next && !same
  const toggle = key => setShown(s => ({ ...s, [key]: !s[key] }))

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError({ field: null, text: '' })
    try {
      await onSubmit(current, next)
      onDone?.()
    } catch (err) {
      setError(passwordErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="px-5 space-y-5">
        <div>
          <PasswordField
            label="Mot de passe actuel"
            value={current}
            onChange={v => { setCurrent(v); setError({ field: null, text: '' }) }}
            shown={shown.current}
            onToggle={() => toggle('current')}
            autoComplete="current-password"
            error={error.field === 'current' ? error.text : ''}
            autoFocus
          />
          {onResetEmail && (
            <button
              type="button"
              onClick={onResetEmail}
              disabled={resetSending}
              className="mt-1 text-xs font-bold text-white underline underline-offset-2 decoration-muted/60 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {resetSending ? 'Envoi en cours…' : 'Tu ne le connais plus ? Recevoir un e-mail'}
            </button>
          )}
        </div>

        <PasswordField
          label="Nouveau mot de passe"
          value={next}
          onChange={setNext}
          onBlur={() => setTouched(t => ({ ...t, next: true }))}
          shown={shown.next}
          onToggle={() => toggle('next')}
          autoComplete="new-password"
          hint={`${MIN_LENGTH} caractères minimum`}
          error={tooShort ? `${MIN_LENGTH} caractères minimum` : error.field === 'next' ? error.text : ''}
        />

        <PasswordField
          label="Confirmer le nouveau mot de passe"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
          shown={shown.confirm}
          onToggle={() => toggle('confirm')}
          autoComplete="new-password"
          error={mismatch ? 'Les deux mots de passe ne sont pas identiques' : ''}
        />

        {error.field === 'form' && <p className="text-accent text-xs font-bold" role="alert">{error.text}</p>}
      </div>

      {/* Bouton unique, collé au-dessus de la barre de navigation */}
      <div className="sticky z-30 mt-6 px-5 py-3 bg-bg border-t border-border" style={{ bottom: NAV_HEIGHT }}>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className={`w-full rounded-xl font-black text-base transition-all ${valid && !busy ? 'bg-accent text-white shadow-glow-red active:scale-95' : 'bg-surfaceHigh text-muted'}`}
          style={{ minHeight: 48 }}
        >
          {busy ? 'Modification…' : same ? 'Choisis un mot de passe différent' : 'Changer le mot de passe'}
        </button>
      </div>
    </>
  )
}
