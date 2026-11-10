import { useMemo, useState } from 'react'
import { ChevronLeft, Crown, Search, X, ShieldCheck, ShieldOff, UserMinus, Ban, UserCheck } from 'lucide-react'
import BottomSheet from '../BottomSheet'
import { getProfile } from '../../utils/profiles'
import { normalizeText } from '../../utils/standings'

const NEUTRAL_COLOR = '#6B6B8A'
// La recherche n'apparaît qu'à partir de 8 joueurs (maquette validée le 9 nov. 2026)
const SEARCH_FROM = 8

// Écran « Joueurs » de Réglages de ligue (maquette validée) : liste, un seul bouton « Gérer » par
// ligne, feuille d'actions, confirmations de « Retirer » et « Bannir ». Les écritures restent dans
// ReglagesLigue (mêmes actions qu'avant) : ici on appelle seulement les fonctions reçues.

function SearchField({ value, onChange }) {
  return (
    <div className="relative px-5 mt-3">
      <Search size={15} style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-50%)' }} className="text-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Rechercher un joueur"
        aria-label="Rechercher un joueur"
        className="w-full bg-bg border border-border rounded-xl pl-9 pr-10 text-sm placeholder:text-muted outline-none focus:border-white/30 [&::-webkit-search-cancel-button]:hidden"
        style={{ minHeight: 44 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Effacer la recherche" style={{ position: 'absolute', right: 20, top: 0, width: 44, height: 44 }} className="flex items-center justify-center text-muted">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

function RoleLine({ p }) {
  if (p.status === 'banni') return <span className="text-red-400 font-bold">Banni</span>
  if (p.status === 'parti') return <span>A quitté la ligue</span>
  return (
    <>
      {p.admin
        ? <span className="inline-flex items-center gap-1 font-bold text-white"><Crown size={11} />Admin</span>
        : <span>Joueur</span>}
      {p.me && <span>· c'est vous</span>}
    </>
  )
}

function PlayerRow({ p, onManage }) {
  const former = p.status !== 'actif'
  return (
    <div className="flex items-center gap-3 px-4 py-2" style={{ minHeight: 64 }}>
      <span className="text-xl leading-none shrink-0" style={former ? { opacity: 0.6 } : undefined}>{p.avatar}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm truncate" style={{ color: p.color, opacity: former ? 0.7 : 1 }}>{p.name}</p>
        <p className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap"><RoleLine p={p} /></p>
      </div>
      {!p.me && (
        <button
          onClick={() => onManage(p)}
          className="shrink-0 rounded-lg border border-border bg-surfaceHigh text-sm font-bold active:opacity-70"
          style={{ minHeight: 44, minWidth: 76, paddingLeft: 12, paddingRight: 12 }}
        >
          Gérer
        </button>
      )}
    </div>
  )
}

function Action({ icon, title, desc, danger, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-start gap-3 px-5 py-3 text-left active:bg-surfaceHigh/50 disabled:opacity-50" style={{ minHeight: 64 }}>
      <span className={`mt-0.5 shrink-0 ${danger ? 'text-red-400' : 'text-white'}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block font-bold text-sm ${danger ? 'text-red-400' : ''}`}>{title}</span>
        <span className="block text-xs text-muted mt-0.5">{desc}</span>
      </span>
    </button>
  )
}

function ManageBody({ p, soleAdmin, busy, onPromote, onDemote, onRemove, onBan, onReinstate }) {
  const sub = p.status === 'banni' ? 'Banni de la ligue' : p.status === 'parti' ? 'A quitté la ligue' : p.admin ? 'Administrateur' : 'Joueur'
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-2xl">{p.avatar}</span>
        <div className="min-w-0">
          <p className="font-black truncate" style={{ color: p.color }}>{p.name}</p>
          <p className="text-xs text-muted">{sub}</p>
        </div>
      </div>
      <div className="border-t border-border">
        {p.status === 'banni' && (
          <Action disabled={busy} onClick={onReinstate} icon={<UserCheck size={20} />} title="Réintégrer" desc="Il peut de nouveau rejoindre la ligue avec le code. Son historique est conservé." />
        )}
        {p.status === 'parti' && (
          <Action disabled={busy} onClick={onBan} icon={<Ban size={20} />} danger title="Bannir" desc="Il ne pourra plus revenir avec le code, tant que tu ne l'as pas réintégré." />
        )}
        {p.status === 'actif' && (
          <>
            {p.admin
              ? !soleAdmin && <Action disabled={busy} onClick={onDemote} icon={<ShieldOff size={20} />} title="Retirer le rôle d'admin" desc="Il redevient un simple joueur, sans accès à ces réglages." />
              : p.canBeAdmin && <Action disabled={busy} onClick={onPromote} icon={<ShieldCheck size={20} />} title="Nommer admin" desc="Il pourra modifier les règles, les pénalités et les joueurs." />}
            {(p.admin ? !soleAdmin : p.canBeAdmin) && <div className="border-t border-border" />}
            <Action disabled={busy} onClick={onRemove} icon={<UserMinus size={20} />} title="Retirer de la ligue" desc="Il ne joue plus, son historique reste. Il peut revenir avec le code." />
            <Action disabled={busy} onClick={onBan} icon={<Ban size={20} />} danger title="Bannir" desc={p.admin ? "Il ne pourra plus revenir avec le code et perd son rôle d'admin." : "Il ne pourra plus revenir avec le code, tant que tu ne l'as pas réintégré."} />
          </>
        )}
      </div>
    </div>
  )
}

function ConfirmBody({ p, kind, busy, error, onCancel, onConfirm }) {
  const ban = kind === 'ban'
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{p.avatar}</span>
        <p className="font-black truncate min-w-0" style={{ color: p.color }}>{p.name}</p>
      </div>
      {ban ? (
        <>
          <p className="text-sm text-muted leading-relaxed">Il ne pourra plus revenir avec le code d'invitation. Il restera bloqué jusqu'à ce que tu le réintègres.{p.admin ? " Il perdra aussi son rôle d'admin." : ''}</p>
          <p className="text-sm text-muted leading-relaxed">Son historique de pronostics reste visible dans le classement.</p>
        </>
      ) : (
        <p className="text-sm text-muted leading-relaxed">Son historique de pronostics reste visible dans le classement, mais il ne joue plus. Il peut revenir en rejoignant à nouveau avec le code.</p>
      )}
      {error && <p className="text-accent text-xs font-bold">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onCancel} disabled={busy} className="flex-1 rounded-lg border border-border bg-surfaceHigh text-sm font-bold disabled:opacity-50" style={{ minHeight: 44 }}>Annuler</button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 rounded-lg text-sm font-black text-white disabled:opacity-60 ${ban ? 'bg-red-700' : 'bg-red-600'}`}
          style={{ minHeight: 44 }}
        >
          {busy ? (ban ? 'Bannissement…' : 'Retrait…') : (ban ? 'Bannir' : 'Retirer')}
        </button>
      </div>
    </div>
  )
}

export default function ReglagesJoueurs({
  league, players, profiles, myPlayerId, isLeagueAdmin, isSoleAdmin,
  onBack, onPromote, onDemote, onRemove, onBan, onReinstate,
}) {
  const [query, setQuery] = useState('')
  const [managed, setManaged] = useState(null) // joueur dont on ouvre « Gérer »
  const [confirm, setConfirm] = useState(null) // { kind: 'remove' | 'ban', p }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const list = useMemo(() => {
    const adminUids = Array.isArray(league?.adminUids) ? league.adminUids : []
    return players
      .map(player => {
        const identity = getProfile(profiles, player)
        const status = player.banned === true ? 'banni' : player.active === false ? 'parti' : 'actif'
        return {
          raw: player,
          id: player._id ?? player.id,
          name: String(identity?.displayName ?? player.id),
          avatar: String(identity?.avatar ?? '🏎️'),
          color: String(identity?.color ?? NEUTRAL_COLOR),
          status,
          admin: !!player.authUid && adminUids.includes(player.authUid),
          canBeAdmin: !!player.authUid,
          me: player._id === myPlayerId,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }, [players, profiles, league, myPlayerId])

  const active = list.filter(p => p.status === 'actif')
  const former = list.filter(p => p.status !== 'actif')
  const adminCount = active.filter(p => p.admin).length
  const searchable = list.length >= SEARCH_FROM || query.trim() !== ''
  const q = normalizeText(query.trim())
  const match = p => !q || normalizeText(p.name).includes(q)
  const shownActive = active.filter(match)
  const shownFormer = former.filter(match)
  const empty = shownActive.length === 0 && shownFormer.length === 0

  const closeManage = () => { if (!busy) setManaged(null) }
  const closeConfirm = () => { if (!busy) { setConfirm(null); setError('') } }

  // Actions directes (sans confirmation, comme avant) : la feuille se ferme une fois l'action lancée
  const runDirect = async (fn, p) => {
    if (!isLeagueAdmin || busy) return
    setBusy(true)
    try { await fn(p.raw) } finally { setBusy(false); setManaged(null) }
  }
  const askConfirm = (kind, p) => { setManaged(null); setError(''); setConfirm({ kind, p }) }

  const doConfirm = async () => {
    if (!confirm || !isLeagueAdmin) return
    setBusy(true)
    setError('')
    const result = await (confirm.kind === 'ban' ? onBan(confirm.p.raw) : onRemove(confirm.p.raw))
    setBusy(false)
    if (result?.ok) setConfirm(null)
    else setError(result?.error ?? 'Une erreur est survenue. Réessaie.')
  }

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
          <ChevronLeft size={18} />Réglages
        </button>
        <h1 className="text-2xl font-black tracking-tight leading-tight">Joueurs</h1>
        <p className="text-sm text-muted mt-0.5 break-words">{active.length} joueur{active.length > 1 ? 's' : ''} · {adminCount} admin{adminCount > 1 ? 's' : ''}</p>
      </div>

      {searchable && <SearchField value={query} onChange={setQuery} />}

      <div className="px-5 mt-3 space-y-5">
        {empty && <p className="text-sm text-muted text-center py-6">Aucun joueur ne correspond à « {query.trim()} ».</p>}
        {shownActive.length > 0 && (
          <div className="card divide-y divide-border overflow-hidden">
            {shownActive.map(p => <PlayerRow key={p.id} p={p} onManage={isLeagueAdmin ? setManaged : () => {}} />)}
          </div>
        )}
        {shownFormer.length > 0 && (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-white mb-2">Anciens joueurs</p>
            <div className="card divide-y divide-border overflow-hidden">
              {shownFormer.map(p => <PlayerRow key={p.id} p={p} onManage={isLeagueAdmin ? setManaged : () => {}} />)}
            </div>
          </div>
        )}
      </div>

      <BottomSheet isOpen={!!managed} onClose={closeManage} title="Gérer">
        {managed && (
          <ManageBody
            p={managed}
            soleAdmin={isSoleAdmin}
            busy={busy}
            onPromote={() => runDirect(onPromote, managed)}
            onDemote={() => runDirect(onDemote, managed)}
            onReinstate={() => runDirect(onReinstate, managed)}
            onRemove={() => askConfirm('remove', managed)}
            onBan={() => askConfirm('ban', managed)}
          />
        )}
      </BottomSheet>

      <BottomSheet isOpen={!!confirm} onClose={closeConfirm} title={confirm?.kind === 'ban' ? 'Bannir ce joueur ?' : 'Retirer ce joueur ?'}>
        {confirm && <ConfirmBody p={confirm.p} kind={confirm.kind} busy={busy} error={error} onCancel={closeConfirm} onConfirm={doConfirm} />}
      </BottomSheet>
    </div>
  )
}
