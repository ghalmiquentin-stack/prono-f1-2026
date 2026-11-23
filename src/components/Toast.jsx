import { useEffect, useState } from 'react'

export function Toast({ message, type = 'info', onClose, duration = 3000 }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const colors = {
    success: 'bg-green-500/20 border-green-500 text-green-300',
    error:   'bg-accent/20 border-accent text-red-300',
    info:    'bg-blue-500/20 border-blue-500 text-blue-300',
    warning: 'bg-yellow-500/20 border-yellow-500 text-yellow-300',
  }

  const icons = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
    warning: '⚠',
  }

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm
        transition-all duration-300
        ${colors[type] ?? colors.info}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      <span className="text-lg font-bold">{icons[type]}</span>
      <span className="text-sm font-semibold flex-1">{message}</span>
      <button
        onClick={() => { setVisible(false); setTimeout(onClose, 300) }}
        className="text-current opacity-60 hover:opacity-100 transition-opacity ml-1"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    // Sous la zone de l'heure et de l'îlot : env(safe-area-inset-top) vaut 0 sur un navigateur ou un téléphone sans
    // encoche (Android compris), donc la position reste à 16 px comme avant ; elle descend seulement quand
    // l'application s'affiche sous la barre d'état (iPhone installé sur l'écran d'accueil, découpes Android).
    // Si le navigateur ne comprend pas cette valeur, il l'ignore et garde top-4.
    <div
      className="fixed top-4 left-4 right-4 z-50 space-y-2 pointer-events-none"
      style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 12px))' }}
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast
            message={t.message}
            type={t.type}
            duration={t.duration}
            onClose={() => removeToast(t.id)}
          />
        </div>
      ))}
    </div>
  )
}

let toastId = 0
export function createToastManager() {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return { toasts, addToast, removeToast }
}
