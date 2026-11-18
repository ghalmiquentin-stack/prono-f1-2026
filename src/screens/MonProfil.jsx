import { useState } from 'react'
import { ChevronLeft, ChevronRight, KeyRound, BookOpen, LogOut, Check, Pencil } from 'lucide-react'
import { sendPasswordResetEmail, deleteUser } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth, formatAuthError } from '../hooks/useAuth'
import { useCollection, useDocument, where, upsertDoc } from '../hooks/useFirestore'
import { PROFILE_COLORS, PROFILE_AVATARS } from '../data/profileOptions'
import BottomSheet from '../components/BottomSheet'
import Skeleton from '../components/Skeleton'
import EntryRow from '../components/EntryRow'
import DeleteAccountSheet from '../components/DeleteAccountSheet'

// Hauteur de la barre de navigation du bas : le bouton « Enregistrer » se pose juste au-dessus.
const NAV_HEIGHT = 71
const SECTION = 'text-xs font-black uppercase tracking-widest text-white'

function BackButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70"
      style={{ minHeight: 44 }}
    >
      <ChevronLeft size={18} />{label}
    </button>
  )
}

// Aperçu de l'identité : tuile d'avatar, pseudo dans la couleur choisie, e-mail.
function IdentityPreview({ identity, email, action }) {
  const Wrapper = action ? 'button' : 'div'
  return (
    <Wrapper
      {...(action ? { type: 'button', onClick: action } : {})}
      className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 ${action ? 'active:opacity-80' : ''}`}
      style={{ borderColor: identity.color + '50', backgroundColor: identity.color + '12' }}
    >
      <span
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 border"
        style={{ borderColor: identity.color, backgroundColor: identity.color + '1F' }}
      >
        {identity.avatar}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-black text-xl leading-tight break-words" style={{ color: identity.color }}>
          {identity.displayName.trim() || '…'}
        </p>
        {email && <p className="text-xs text-muted mt-0.5 break-all">{email}</p>}
        {action && (
          <p className="text-xs font-bold text-white mt-1.5 flex items-center gap-1">
            <Pencil size={12} />Modifier pseudo, couleur, avatar
          </p>
        )}
      </div>
      {action && <ChevronRight size={18} className="text-muted shrink-0" />}
    </Wrapper>
  )
}

export default function MonProfil({ addToast, setActiveTab, onBack }) {
  const { user, logout } = useAuth()

  // The players docs only carry league/game membership now (leagueId, authUid…) —
  // there can be zero, one, or several (one per league this account belongs to).
  const { data: myPlayers, loading: playerLoading } = useCollection(
    user?.uid ? 'players' : null,
    user?.uid ? [where('authUid', '==', user.uid)] : []
  )

  // Identity (displayName/avatar/color) lives in profiles/{authUid}
  const { data: identity, loading: identityLoading } = useDocument('profiles', user?.uid ?? null)
  const loading = playerLoading || identityLoading

  const [screen, setScreen] = useState('hub') // 'hub' | 'edit'
  const [draft, setDraft] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const [resetSending, setResetSending] = useState(false)

  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isPasswordAccount = user?.providerData?.some(p => p.providerId === 'password') ?? false

  // Identité enregistrée (avec les mêmes valeurs par défaut qu'avant quand le profil est incomplet)
  const saved = {
    displayName: String(identity?.displayName ?? ''),
    avatar: identity?.avatar ?? PROFILE_AVATARS[0],
    color: identity?.color ?? PROFILE_COLORS[0],
  }

  const openEdit = () => {
    setDraft({ ...saved })
    setScreen('edit')
  }

  const dirty = !!draft && (
    draft.displayName.trim() !== saved.displayName.trim()
    || draft.avatar !== saved.avatar
    || draft.color !== saved.color
  )
  const invalid = !!draft && !draft.displayName.trim()
  const canSave = dirty && !invalid && !profileSaving

  const saveProfile = async () => {
    if (!canSave || !user?.uid) return
    setProfileSaving(true)
    try {
      await upsertDoc('profiles', user.uid, { ...draft, displayName: draft.displayName.trim() })
      addToast?.('Profil mis à jour !', 'success')
    } catch {
      addToast?.('Erreur lors de la sauvegarde', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  const backFromEdit = () => (dirty ? setLeaveOpen(true) : setScreen('hub'))

  const handlePasswordReset = async () => {
    if (!user?.email) return
    setResetSending(true)
    try {
      await sendPasswordResetEmail(auth, user.email)
      addToast?.('Email envoyé, vérifie ta boîte de réception', 'success')
    } catch (err) {
      addToast?.(formatAuthError(err), 'error')
    } finally {
      setResetSending(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user || deleting) return

    setDeleting(true)
    try {
      // Unlink every player profile this account holds (across all leagues)
      // first, while still authenticated as their owner, so predictions/
      // penalties history stays intact for those leagues. No-op if none.
      // displayNameOverride lets getProfile() show a neutral "gone" identity
      // once authUid is null, instead of falling back to the raw doc id.
      for (const p of myPlayers) {
        await upsertDoc('players', p.id, { authUid: null, displayNameOverride: 'Joueur supprimé' })
      }
      // Anonymize the identity next.
      await upsertDoc('profiles', user.uid, {
        displayName: 'Joueur retiré',
        avatar: '❔',
        color: '#6B6B8A',
      })
      await deleteUser(user)
      // onAuthStateChanged fires with null → App.jsx redirects to Login.
    } catch (err) {
      addToast?.(formatAuthError(err), 'error')
    } finally {
      setDeleting(false)
      setDeleteSheetOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={2} height="h-28" />
      </div>
    )
  }

  // ── Sous-écran : Modifier mon profil ──
  if (screen === 'edit' && draft) {
    const label = profileSaving ? 'Enregistrement…' : !dirty ? 'Aucune modification' : invalid ? 'Le pseudo ne peut pas être vide' : 'Enregistrer les modifications'
    return (
      <div>
        <div className="px-5 pt-4 pb-3">
          <BackButton label="Mon profil" onClick={backFromEdit} />
          <h1 className="text-2xl font-black tracking-tight leading-tight">Modifier mon profil</h1>
        </div>

        <div className="px-5">
          <IdentityPreview identity={draft} email={user?.email} />

          <div className="flex items-baseline justify-between mt-6 mb-2">
            <p className={SECTION}>Pseudo</p>
            <p className="text-[11px] text-muted">{draft.displayName.length}/20</p>
          </div>
          <input
            type="text"
            value={draft.displayName}
            onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))}
            className="input-field"
            maxLength={20}
            placeholder="Ton pseudo"
            aria-label="Pseudo"
          />

          <p className={`${SECTION} mt-6 mb-2`}>Couleur</p>
          <div className="grid grid-cols-5 gap-y-2 justify-items-center" role="radiogroup" aria-label="Couleur">
            {PROFILE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draft.color === c}
                aria-label={`Couleur ${c}`}
                onClick={() => setDraft(d => ({ ...d, color: c }))}
                className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ backgroundColor: c, boxShadow: draft.color === c ? '0 0 0 2px #15151E, 0 0 0 4px #fff' : 'none' }}
              >
                {draft.color === c && <Check size={20} strokeWidth={3} className="text-bg" />}
              </button>
            ))}
          </div>

          <p className={`${SECTION} mt-6 mb-2`}>Avatar</p>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar">
            {PROFILE_AVATARS.map(emoji => (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={draft.avatar === emoji}
                aria-label={`Avatar ${emoji}`}
                onClick={() => setDraft(d => ({ ...d, avatar: emoji }))}
                className={`h-11 rounded-xl text-xl flex items-center justify-center border active:scale-90 transition-transform ${
                  draft.avatar === emoji ? 'border-white bg-surfaceHigh' : 'border-transparent bg-surfaceHigh/50'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Bouton unique, collé au-dessus de la barre de navigation */}
        <div className="sticky z-30 mt-6 px-5 py-3 bg-bg border-t border-border" style={{ bottom: NAV_HEIGHT }}>
          <button
            onClick={saveProfile}
            disabled={!canSave}
            className={`w-full rounded-xl font-black text-base transition-all ${canSave ? 'bg-accent text-white shadow-glow-red active:scale-95' : 'bg-surfaceHigh text-muted'}`}
            style={{ minHeight: 48 }}
          >
            {label}
          </button>
        </div>

        <BottomSheet isOpen={leaveOpen} onClose={() => setLeaveOpen(false)} title="Quitter sans enregistrer ?">
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted leading-relaxed">
              Tu as modifié ton profil sans l'enregistrer. Si tu quittes maintenant, ces modifications seront perdues.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setLeaveOpen(false)}
                className="flex-1 rounded-lg border border-border bg-surfaceHigh text-sm font-bold"
                style={{ minHeight: 44 }}
              >
                Rester ici
              </button>
              <button
                onClick={() => { setLeaveOpen(false); setScreen('hub') }}
                className="flex-1 rounded-lg bg-red-600 text-sm font-black text-white"
                style={{ minHeight: 44 }}
              >
                Quitter
              </button>
            </div>
          </div>
        </BottomSheet>
      </div>
    )
  }

  // ── Page : Mon profil ──
  return (
    <div className="pb-4">
      <div className="px-5 pt-4 pb-3">
        {onBack && <BackButton label="Retour" onClick={onBack} />}
        <h1 className={`text-2xl font-black tracking-tight leading-tight ${onBack ? '' : 'pt-1'}`}>Mon profil</h1>
      </div>

      <div className="px-5">
        <IdentityPreview identity={saved} email={user?.email} action={openEdit} />

        <div className="card divide-y divide-border overflow-hidden mt-5">
          {isPasswordAccount && (
            <EntryRow
              icon={<KeyRound size={18} />}
              title="Changer le mot de passe"
              sub={resetSending ? 'Envoi en cours…' : `Un e-mail est envoyé à ${user?.email}`}
              onClick={handlePasswordReset}
              disabled={resetSending}
              chevron={false}
            />
          )}
          <EntryRow
            icon={<BookOpen size={18} />}
            title="Règles du jeu"
            sub="Barème des points et week-end de course"
            onClick={() => setActiveTab?.('reglages-du-jeu')}
          />
        </div>

        <div className="card overflow-hidden mt-3">
          <EntryRow icon={<LogOut size={18} />} title="Se déconnecter" onClick={logout} chevron={false} />
        </div>

        <button
          onClick={() => setDeleteSheetOpen(true)}
          className="w-full mt-5 text-sm font-bold text-muted underline underline-offset-4 decoration-border active:opacity-70"
          style={{ minHeight: 44 }}
        >
          Supprimer mon compte
        </button>
      </div>

      <DeleteAccountSheet
        isOpen={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        onConfirm={handleDeleteAccount}
        deleting={deleting}
      />
    </div>
  )
}
