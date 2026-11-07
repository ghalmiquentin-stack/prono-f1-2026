import { useEffect, useRef, useState } from 'react'
import { Copy, Share2, Check } from 'lucide-react'
import { inviteShareText } from '../../utils/leagueSummary'

// Copie dans le presse-papiers ; repli pour les navigateurs sans l'API moderne
// (page non sécurisée, vieux Safari).
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* repli ci-dessous */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

const BTN = 'h-11 px-3 rounded-lg border border-border bg-surfaceHigh text-xs font-bold flex items-center gap-1.5 active:opacity-70'

// Code d'invitation d'une ligue : « Copier » met le code seul dans le presse-papiers ;
// « Partager » ouvre le partage du téléphone avec une phrase d'invitation, et copie
// cette phrase à la place quand le partage n'existe pas (ordinateur).
export default function InviteCode({ league }) {
  const [feedback, setFeedback] = useState(null) // 'code' | 'share' | 'error'
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = (value) => {
    setFeedback(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedback(null), 1800)
  }

  const handleCopy = async () => flash((await copyText(league.code)) ? 'code' : 'error')

  const handleShare = async () => {
    const text = inviteShareText(league)
    const url = window.location.origin
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Prono F1 2026', text, url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // l'utilisateur a fermé le partage
      }
    }
    flash((await copyText(`${text} ${url}`)) ? 'share' : 'error')
  }

  return (
    <div>
      <p className="text-[11px] uppercase text-muted font-bold">Code d'invitation</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-lg font-mono font-black tracking-widest">{league.code}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCopy} className={BTN}>
            {feedback === 'code' ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
            {feedback === 'code' ? 'Copié' : 'Copier'}
          </button>
          <button type="button" onClick={handleShare} className={BTN}>
            {feedback === 'share' ? <Check size={15} className="text-green-400" /> : <Share2 size={15} />}
            {feedback === 'share' ? 'Copié' : 'Partager'}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {feedback === 'error' && <p className="text-xs mt-1 text-accent font-bold">Copie impossible, note le code à la main.</p>}
      </div>
    </div>
  )
}
