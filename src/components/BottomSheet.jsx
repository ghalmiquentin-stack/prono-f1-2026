import { useEffect, useRef } from 'react'

export default function BottomSheet({ isOpen, onClose, title, children, fullHeight = false }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const main = document.getElementById('app-main')
    if (isOpen) {
      if (main) main.style.overflow = 'hidden'
    } else {
      if (main) main.style.overflow = ''
    }
    return () => { if (main) main.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`
          relative bg-surface rounded-t-2xl border-t border-border
          animate-slide-up
          ${fullHeight ? 'max-h-[90svh]' : 'max-h-[80svh]'}
          flex flex-col
        `}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 shrink-0 border-b border-border">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surfaceHigh text-muted hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 pb-safe">
          {children}
        </div>
      </div>
    </div>
  )
}
