import { useState } from 'react'
import { useCollection, updateDocument } from '../hooks/useFirestore'

const PLAYERS_ORDER = ['william', 'quentin', 'alex', 'romain']

const FALLBACKS = {
  william: { displayName: 'William', color: '#3B82F6', avatar: '🏎️' },
  quentin: { displayName: 'Quentin', color: '#22C55E', avatar: '🏁' },
  alex:    { displayName: 'Alex',    color: '#F97316', avatar: '🔥' },
  romain:  { displayName: 'Romain',  color: '#A855F7', avatar: '⚡' },
}

export default function ClaimProfile({ user }) {
  const { data: players, loading } = useCollection('players')
  const [claiming, setClaiming] = useState(null)
  const [error, setError] = useState('')

  const availablePlayers = PLAYERS_ORDER
    .map(pid => {
      const fb = players.find(p => p.id === pid)
      const fallback = FALLBACKS[pid]
      return {
        id: pid,
        displayName: fb?.displayName ?? fallback.displayName,
        color: fb?.color ?? fallback.color,
        avatar: fb?.avatar ?? fallback.avatar,
        authUid: fb?.authUid,
      }
    })
    .filter(p => !p.authUid)

  const handleClaim = async (pid) => {
    if (claiming) return
    setError('')
    setClaiming(pid)
    try {
      await updateDocument('players', pid, { authUid: user.uid })
    } catch (err) {
      setError("Impossible de rattacher ce profil. Réessayez.")
    } finally {
      setClaiming(null)
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
          Quel est votre profil ?
        </p>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {PLAYERS_ORDER.map(pid => (
              <div key={pid} className="card p-5 flex flex-col items-center gap-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-surfaceHigh" />
                <div className="h-4 w-16 rounded bg-surfaceHigh mt-1" />
              </div>
            ))}
          </div>
        ) : availablePlayers.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="font-bold text-sm">Tous les profils sont déjà rattachés.</p>
            <p className="text-xs text-muted mt-2">
              Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {availablePlayers.map(player => (
              <button
                key={player.id}
                onClick={() => handleClaim(player.id)}
                disabled={!!claiming}
                className="relative card p-5 flex flex-col items-center gap-2 border border-border hover:border-muted transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                <span className="text-4xl">{player.avatar}</span>
                <span className="text-lg font-black tracking-wide" style={{ color: player.color }}>
                  {player.displayName}
                </span>
                <div className="w-full h-0.5 rounded-full mt-1" style={{ backgroundColor: '#2E2E42' }} />
                {claiming === player.id && (
                  <span className="text-xs text-muted">Rattachement…</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-accent text-xs font-bold text-center mt-4">{error}</p>
        )}

        <p className="text-center text-xs text-muted mt-6">
          Ce rattachement est définitif pour votre compte.
        </p>
      </div>
    </div>
  )
}
