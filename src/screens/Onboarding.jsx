import { useState, useEffect } from 'react'
import { useCollection } from '../hooks/useFirestore'

const PLAYERS_ORDER = ['william', 'quentin', 'alex', 'romain']

// Fallback values for when Firebase data isn't available yet
const FALLBACKS = {
  william: { displayName: 'William', color: '#3B82F6', avatar: '🏎️', nickname: 'Le Stratège' },
  quentin: { displayName: 'Quentin', color: '#22C55E', avatar: '🏁', nickname: 'Le Challenger' },
  alex:    { displayName: 'Alex',    color: '#F97316', avatar: '🔥', nickname: "L'Attaquant" },
  romain:  { displayName: 'Romain',  color: '#A855F7', avatar: '⚡', nickname: "L'Électrique" },
}

function getPinAttempts(pid) {
  try { return JSON.parse(localStorage.getItem(`pin_attempts_${pid}`)) ?? { count: 0, blockedUntil: null } }
  catch { return { count: 0, blockedUntil: null } }
}

function setPinAttempts(pid, data) {
  localStorage.setItem(`pin_attempts_${pid}`, JSON.stringify(data))
}

export default function Onboarding({ onSelectPlayer }) {
  const { data: players, loading } = useCollection('players')
  const [selected, setSelected] = useState(null)

  // PIN states
  const [pinStep, setPinStep] = useState(null) // null | 'entry' | 'blocked'
  const [pinInput, setPinInput] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [pinError, setPinError] = useState('')
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0)

  // Countdown timer when blocked
  useEffect(() => {
    if (pinStep !== 'blocked' || !selected) return
    const att = getPinAttempts(selected)
    if (!att.blockedUntil) return

    const update = () => {
      const left = Math.max(0, Math.ceil((att.blockedUntil - Date.now()) / 1000))
      setBlockSecondsLeft(left)
      if (left === 0) {
        setPinAttempts(selected, { count: 0, blockedUntil: null })
        setPinStep(null)
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [pinStep, selected])

  // Build ordered player list, merging Firebase data with fallbacks
  const playerList = PLAYERS_ORDER.map(pid => {
    const fb = players.find(p => p.id === pid)
    const fb_ = FALLBACKS[pid]
    return {
      id: pid,
      displayName: String(fb?.displayName ?? fb_.displayName),
      color:       String(fb?.color       ?? fb_.color),
      avatar:      String(fb?.avatar      ?? fb_.avatar),
      nickname:    String(fb?.nickname    ?? fb_.nickname),
      pin:         fb?.pin ?? null,
    }
  })

  const selectedPlayer = playerList.find(p => p.id === selected)

  const handleConfirm = () => {
    if (!selected || loading) return
    const player = playerList.find(p => p.id === selected)
    if (player?.pin) {
      const att = getPinAttempts(selected)
      if (att.blockedUntil && Date.now() < att.blockedUntil) {
        setPinStep('blocked')
        return
      }
      setPinInput('')
      setPinError('')
      setPinStep('entry')
    } else {
      onSelectPlayer(selected)
    }
  }

  const handlePinSubmit = () => {
    if (!selected || !selectedPlayer || pinInput.length !== 4) return
    const att = getPinAttempts(selected)

    if (pinInput === String(selectedPlayer.pin)) {
      setPinAttempts(selected, { count: 0, blockedUntil: null })
      onSelectPlayer(selected)
    } else {
      const newCount = att.count + 1
      if (newCount >= 3) {
        const blockedUntil = Date.now() + 5 * 60 * 1000
        setPinAttempts(selected, { count: newCount, blockedUntil })
        setPinStep('blocked')
        setPinInput('')
      } else {
        setPinAttempts(selected, { count: newCount, blockedUntil: null })
        setPinError(`PIN incorrect — ${3 - newCount} tentative${3 - newCount > 1 ? 's' : ''} restante${3 - newCount > 1 ? 's' : ''}`)
        setPinInput('')
      }
    }
  }

  const closePinModal = () => {
    setPinStep(null)
    setPinInput('')
    setPinError('')
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
        <p className="text-muted text-sm mt-4">Saison 2026 · 24 Grands Prix</p>
      </div>

      {/* Player selection */}
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-muted mb-5">
          Choisissez votre pilote
        </p>

        {loading ? (
          // Skeleton while Firebase loads
          <div className="grid grid-cols-2 gap-3">
            {PLAYERS_ORDER.map(pid => (
              <div
                key={pid}
                className="card p-5 flex flex-col items-center gap-2 animate-pulse"
              >
                <div className="w-10 h-10 rounded-full bg-surfaceHigh" />
                <div className="h-4 w-16 rounded bg-surfaceHigh mt-1" />
                <div className="h-3 w-20 rounded bg-surfaceHigh/60" />
                <div className="w-full h-0.5 rounded-full bg-surfaceHigh mt-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {playerList.map(player => {
              const isSelected = selected === player.id
              return (
                <button
                  key={player.id}
                  onClick={() => setSelected(player.id)}
                  className={`
                    relative card p-5 flex flex-col items-center gap-2
                    transition-all duration-200 active:scale-95
                    ${isSelected
                      ? 'border-2 shadow-glow-red'
                      : 'border border-border hover:border-muted'
                    }
                  `}
                  style={isSelected ? { borderColor: player.color, boxShadow: `0 0 20px ${player.color}40` } : {}}
                >
                  {isSelected && (
                    <div
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ backgroundColor: player.color }}
                    >
                      ✓
                    </div>
                  )}
                  {player.pin && (
                    <div className="absolute top-2 left-2 text-xs text-muted">🔒</div>
                  )}
                  <span className="text-4xl">{player.avatar}</span>
                  <span
                    className="text-lg font-black tracking-wide"
                    style={isSelected ? { color: player.color } : {}}
                  >
                    {player.displayName}
                  </span>
                  <span className="text-xs text-muted text-center leading-tight">{player.nickname}</span>
                  <div
                    className="w-full h-0.5 rounded-full mt-1"
                    style={{ backgroundColor: isSelected ? player.color : '#2E2E42' }}
                  />
                </button>
              )
            })}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!selected || loading}
          className={`
            w-full mt-6 py-4 rounded-xl font-black text-lg tracking-wide
            transition-all duration-200 active:scale-95
            ${selected && !loading
              ? 'shadow-glow-red text-white'
              : 'bg-surfaceHigh text-muted cursor-not-allowed'
            }
          `}
          style={selected && selectedPlayer ? {
            backgroundColor: selectedPlayer.color,
            boxShadow: `0 0 20px ${selectedPlayer.color}40`,
          } : {}}
        >
          {selected && selectedPlayer
            ? `Jouer en tant que ${selectedPlayer.displayName}`
            : 'Sélectionnez un joueur'
          }
        </button>

        <p className="text-center text-xs text-muted mt-4">
          Votre choix est sauvegardé localement
        </p>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted/50">Prono F1 2026 · Fait avec ❤️ pour les fans</p>
      </div>

      {/* ── PIN Modal ── */}
      {pinStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            {pinStep === 'blocked' ? (
              /* Blocked state */
              <>
                <div className="text-center mb-5">
                  <span className="text-5xl block mb-3">🔒</span>
                  <h3 className="font-black text-lg">Trop de tentatives</h3>
                  <p className="text-sm text-muted mt-1">Compte temporairement bloqué</p>
                </div>
                <div className="bg-surfaceHigh rounded-xl p-4 text-center mb-5">
                  <p className="text-xs text-muted mb-1">Réessaie dans</p>
                  <p className="text-2xl font-black text-white">
                    {Math.floor(blockSecondsLeft / 60)}:{String(blockSecondsLeft % 60).padStart(2, '0')}
                  </p>
                </div>
                <button
                  onClick={closePinModal}
                  className="w-full py-3 rounded-xl border border-border font-bold text-sm"
                >
                  Retour
                </button>
              </>
            ) : (
              /* PIN entry */
              <>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-3xl">{selectedPlayer?.avatar}</span>
                  <div>
                    <h3 className="font-black text-base" style={{ color: selectedPlayer?.color }}>
                      {selectedPlayer?.displayName}
                    </h3>
                    <p className="text-xs text-muted">Saisir votre code PIN</p>
                  </div>
                </div>

                <div className="relative mb-1">
                  <input
                    type={pinVisible ? 'text' : 'password'}
                    value={pinInput}
                    onChange={e => {
                      setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                      setPinError('')
                    }}
                    onKeyDown={e => e.key === 'Enter' && pinInput.length === 4 && handlePinSubmit()}
                    className="input-field pr-12 text-center text-2xl tracking-[0.5em] font-black"
                    placeholder="••••"
                    inputMode="numeric"
                    autoFocus
                    maxLength={4}
                  />
                  <button
                    type="button"
                    onClick={() => setPinVisible(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-lg"
                  >
                    {pinVisible ? '🙈' : '👁️'}
                  </button>
                </div>

                {pinError && (
                  <p className="text-accent text-xs font-bold mb-2">{pinError}</p>
                )}

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={closePinModal}
                    className="flex-1 py-3 rounded-xl border border-border font-bold text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handlePinSubmit}
                    disabled={pinInput.length !== 4}
                    className="flex-1 py-3 rounded-xl font-black text-sm text-white transition-all active:scale-95"
                    style={pinInput.length === 4 && selectedPlayer
                      ? { backgroundColor: selectedPlayer.color }
                      : { backgroundColor: '#2A2A3E', color: '#6B6B8A' }
                    }
                  >
                    Valider
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
