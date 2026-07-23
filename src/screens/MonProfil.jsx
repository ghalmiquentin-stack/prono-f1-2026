import { useEffect, useState } from 'react'
import { LogOut, KeyRound, Trash2, BookOpen } from 'lucide-react'
import { sendPasswordResetEmail, deleteUser } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth, formatAuthError } from '../hooks/useAuth'
import { useCollection, useDocument, where, upsertDoc } from '../hooks/useFirestore'
import { PROFILE_COLORS, PROFILE_AVATARS } from '../data/profileOptions'
import BottomSheet from '../components/BottomSheet'
import Skeleton from '../components/Skeleton'

const DELETE_CONFIRM_WORD = 'SUPPRIMER'

export default function MonProfil({ addToast, setActiveTab }) {
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

  const [profileDraft, setProfileDraft] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const [resetSending, setResetSending] = useState(false)

  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const isPasswordAccount = user?.providerData?.some(p => p.providerId === 'password') ?? false

  // Initialize the draft once the profile has loaded
  useEffect(() => {
    if (profileDraft !== null || loading) return
    setProfileDraft({
      displayName: identity?.displayName ?? '',
      avatar: identity?.avatar ?? PROFILE_AVATARS[0],
      color: identity?.color ?? PROFILE_COLORS[0],
    })
  }, [identity, loading, profileDraft])

  const saveProfile = async () => {
    if (!profileDraft || !user?.uid) return
    setProfileSaving(true)
    try {
      await upsertDoc('profiles', user.uid, { ...profileDraft })
      addToast?.('Profil mis à jour !', 'success')
    } catch {
      addToast?.('Erreur lors de la sauvegarde', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

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

  const closeDeleteSheet = () => {
    setDeleteSheetOpen(false)
    setDeleteConfirmText('')
  }

  const handleDeleteAccount = async () => {
    if (!user) return
    if (deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD) return

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
      closeDeleteSheet()
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={2} height="h-28" />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">Mon Profil</h1>
      </div>

      <div className="px-5 space-y-4">
        {profileDraft && (
          <div className="card p-4 space-y-4">
            {/* Preview */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl border"
              style={{ borderColor: profileDraft.color + '50', backgroundColor: profileDraft.color + '12' }}
            >
              <span className="text-3xl leading-none">{profileDraft.avatar}</span>
              <div>
                <p className="font-black text-base leading-tight" style={{ color: profileDraft.color }}>
                  {profileDraft.displayName || '…'}
                </p>
                {user?.email && (
                  <p className="text-xs text-muted mt-0.5">{user.email}</p>
                )}
              </div>
            </div>

            {/* Display name */}
            <div>
              <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Pseudo</p>
              <input
                type="text"
                value={profileDraft.displayName}
                onChange={e => setProfileDraft(d => ({ ...d, displayName: e.target.value }))}
                className="input-field"
                maxLength={20}
                placeholder="Votre pseudo"
              />
            </div>

            {/* Color palette */}
            <div>
              <p className="text-xs text-muted font-bold uppercase tracking-wide mb-2">Couleur</p>
              <div className="flex flex-wrap gap-2">
                {PROFILE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setProfileDraft(d => ({ ...d, color: c }))}
                    className="w-8 h-8 rounded-full border-2 transition-all active:scale-90"
                    style={{
                      backgroundColor: c,
                      borderColor: profileDraft.color === c ? '#fff' : 'transparent',
                      boxShadow: profileDraft.color === c ? `0 0 0 1px ${c}` : 'none',
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
                    onClick={() => setProfileDraft(d => ({ ...d, avatar: emoji }))}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all active:scale-90 border ${
                      profileDraft.avatar === emoji
                        ? 'border-white bg-surfaceHigh'
                        : 'border-transparent bg-surfaceHigh/50'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <button
              onClick={saveProfile}
              disabled={profileSaving || !profileDraft.displayName.trim()}
              className={`w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 ${
                !profileSaving && profileDraft.displayName.trim()
                  ? 'bg-accent text-white'
                  : 'bg-surfaceHigh text-muted cursor-not-allowed'
              }`}
            >
              {profileSaving ? 'Sauvegarde...' : 'Sauvegarder le profil'}
            </button>
          </div>
        )}

        {isPasswordAccount && (
          <button
            onClick={handlePasswordReset}
            disabled={resetSending}
            className="card w-full p-4 flex items-center justify-center gap-2 font-bold text-sm active:opacity-70 disabled:opacity-50"
          >
            <KeyRound size={18} />
            {resetSending ? 'Envoi en cours…' : 'Changer le mot de passe'}
          </button>
        )}

        <button
          onClick={() => setActiveTab?.('reglages-du-jeu')}
          className="card w-full p-4 flex items-center justify-center gap-2 font-bold text-sm active:opacity-70 active:scale-95 transition-all duration-200"
        >
          <BookOpen size={18} />
          Règles du jeu
        </button>

        <button
          onClick={logout}
          className="card w-full p-4 flex items-center justify-center gap-2 font-black text-sm text-accent active:opacity-70 active:scale-95 transition-all duration-200"
        >
          <LogOut size={20} />
          Se déconnecter
        </button>

        {/* ── Zone dangereuse ── */}
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'rgba(127,0,0,0.12)', borderColor: 'rgba(200,0,0,0.25)' }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-red-400">⚠️ Sortie de piste</p>
          <button
            onClick={() => setDeleteSheetOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-700/30 bg-red-900/20 active:opacity-70 text-left"
          >
            <Trash2 size={20} className="text-red-400 shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-400">Supprimer mon compte</p>
              <p className="text-xs text-muted">Irréversible</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Confirmation de suppression ── */}
      <BottomSheet isOpen={deleteSheetOpen} onClose={closeDeleteSheet} title="Supprimer mon compte">
        <div className="p-5 pb-10 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Cette action est <strong className="text-red-400">irréversible</strong>. Votre compte de connexion
            sera supprimé et votre profil sera anonymisé (pseudo, avatar et couleur réinitialisés).
            Vos pronostics et pénalités resteront visibles dans vos ligues, pour ne pas fausser leurs classements.
          </p>
          <p className="text-sm">
            Tapez <strong className="text-white font-mono">{DELETE_CONFIRM_WORD}</strong> pour confirmer :
          </p>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            className="input-field"
            placeholder={DELETE_CONFIRM_WORD}
            autoCapitalize="characters"
          />
          <button
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD}
            className={`w-full py-4 rounded-xl font-black text-lg transition-all active:scale-95 ${
              !deleting && deleteConfirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD
                ? 'bg-red-600 text-white'
                : 'bg-surfaceHigh text-muted cursor-not-allowed'
            }`}
          >
            {deleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
