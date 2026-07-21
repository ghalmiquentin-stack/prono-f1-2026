import { useState } from 'react'
import { useAuth, formatAuthError } from '../hooks/useAuth'

export default function Login() {
  const { signUpWithEmail, signInWithEmail, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col items-center justify-center px-5 py-10 safe-top">
      {/* Logo / Header */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🏎️</div>
        <h1 className="text-4xl font-black tracking-tight mb-1">
          PRONO <span className="text-accent glow-text">F1</span>
        </h1>
        <p className="text-2xl font-black tracking-widest text-muted">2026</p>
        <div className="f1-stripe w-32 mx-auto mt-4" />
      </div>

      <div className="w-full max-w-sm">
        {/* Toggle Se connecter / Créer un compte */}
        <div className="card p-1 flex mb-6">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError('') }}
            className={`flex-1 py-3 rounded-xl font-black text-sm tracking-wide transition-all duration-200 ${
              mode === 'signin' ? 'bg-accent text-white shadow-glow-red' : 'text-muted'
            }`}
          >
            Se connecter
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError('') }}
            className={`flex-1 py-3 rounded-xl font-black text-sm tracking-wide transition-all duration-200 ${
              mode === 'signup' ? 'bg-accent text-white shadow-glow-red' : 'text-muted'
            }`}
          >
            Créer un compte
          </button>
        </div>

        {/* Formulaire email / mot de passe */}
        <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted mb-1 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
              placeholder="vous@exemple.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted mb-1 block">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field pr-12"
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-lg"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-accent text-xs font-bold">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className={`
              w-full mt-2 py-4 rounded-xl font-black text-lg tracking-wide text-white
              transition-all duration-200 active:scale-95
              ${!loading && email && password ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'}
            `}
          >
            {loading
              ? 'Patientez…'
              : mode === 'signup' ? 'Créer mon compte' : 'Se connecter'
            }
          </button>
        </form>

        {/* Séparateur */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted uppercase tracking-widest">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="card w-full py-4 flex items-center justify-center gap-3 font-bold text-sm active:scale-95 transition-all duration-200 disabled:opacity-50"
        >
          <span className="text-xl">🔎</span>
          Continuer avec Google
        </button>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted/50">Prono F1 2026 · Fait avec ❤️ pour les fans</p>
      </div>
    </div>
  )
}
