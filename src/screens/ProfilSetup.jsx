import { useState } from 'react'
import { upsertDoc } from '../hooks/useFirestore'
import { PROFILE_COLORS, PROFILE_AVATARS } from '../data/profileOptions'

export default function ProfilSetup({ user }) {
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(PROFILE_COLORS[0])
  const [avatar, setAvatar] = useState(PROFILE_AVATARS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!displayName.trim() || !user?.uid) return
    setSaving(true)
    setError('')
    try {
      await upsertDoc('profiles', user.uid, {
        displayName: displayName.trim(),
        color,
        avatar,
      })
    } catch {
      setError('Erreur lors de la création du profil. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col items-center justify-center px-5 py-10 safe-top">
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🏎️</div>
        <h1 className="text-4xl font-black tracking-tight mb-1">
          PRONO <span className="text-accent glow-text">F1</span>
        </h1>
        <p className="text-2xl font-black tracking-widest text-muted">2026</p>
        <div className="f1-stripe w-32 mx-auto mt-4" />
      </div>

      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-muted mb-5">
          Créez votre profil
        </p>

        <div className="card p-5 space-y-4">
          {/* Preview */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border"
            style={{ borderColor: color + '50', backgroundColor: color + '12' }}
          >
            <span className="text-3xl leading-none">{avatar}</span>
            <p className="font-black text-base leading-tight" style={{ color }}>
              {displayName || '…'}
            </p>
          </div>

          {/* Display name */}
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Pseudo</p>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="input-field"
              maxLength={20}
              placeholder="Votre pseudo"
              autoFocus
            />
          </div>

          {/* Color palette */}
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wide mb-2">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-all active:scale-90"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#fff' : 'transparent',
                    boxShadow: color === c ? `0 0 0 1px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Avatar picker */}
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wide mb-2">Avatar</p>
            <div className="flex flex-wrap gap-2">
              {PROFILE_AVATARS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setAvatar(emoji)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all active:scale-90 border ${
                    avatar === emoji
                      ? 'border-white bg-surfaceHigh'
                      : 'border-transparent bg-surfaceHigh/50'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-accent text-xs font-bold">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving || !displayName.trim()}
            className={`
              w-full py-4 rounded-xl font-black text-lg tracking-wide text-white
              transition-all duration-200 active:scale-95
              ${!saving && displayName.trim() ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'}
            `}
          >
            {saving ? 'Création…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
