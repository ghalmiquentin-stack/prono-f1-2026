import { useState, useMemo, useEffect } from 'react'
import { useCollection, upsertDoc, deleteDocument } from '../hooks/useFirestore'
import { seedDatabase, clearDatabase } from '../data/seed'
import { TEAMS } from '../data/drivers'
import BottomSheet from '../components/BottomSheet'

const ADMIN_PASSWORD = 'f1paris2026'

const PLAYERS_ORDER = ['william', 'quentin', 'alex', 'romain']

const PLAYER_COLORS_FALLBACK = {
  william: '#3B82F6',
  quentin: '#22C55E',
  alex: '#F97316',
  romain: '#A855F7',
}

const PLAYER_AVATARS_FALLBACK = {
  william: '🏎️',
  quentin: '🏁',
  alex: '🔥',
  romain: '⚡',
}

const PROFILE_COLORS = [
  '#3B82F6', '#22C55E', '#F97316', '#A855F7',
  '#EF4444', '#F59E0B', '#06B6D4', '#EC4899',
  '#14B8A6', '#E2E8F0',
]

const PROFILE_AVATARS = ['🏎️', '🏁', '🔥', '⚡', '🦅', '👑', '🐺', '🎯', '🚀', '💎', '🌪️', '🦁']

const NICKNAMES = [
  '', // empty = no nickname
  'Le Stratège', "L'Analyste", 'Le Tacticien', "L'Ingénieur",
  "L'Attaquant", 'Le Chasseur', 'Le Défenseur', 'Le Remontant',
  'Le Challenger', "L'Électrique", 'Le Sang-Froid', "L'Imprévisible",
  'Le Kamikaze', 'Le Régulier', 'Le Pilote', 'Le Champion',
  'Le Rookie', 'La Légende', 'Le Outsider', 'Le Dark Horse',
  'Le Chanceux', 'Le Prophète', "L'Oracle", 'Le Gambler', 'Le Bluffeur',
]

function ConfirmModal({ isOpen, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
              danger ? 'bg-red-600' : 'bg-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Administration({ currentPlayerId, addToast, onChangePlayer }) {
  // ── Profile (no auth required) ──────────────────────────────────────────
  const [profileDraft, setProfileDraft] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)

  // ── Admin auth ───────────────────────────────────────────────────────────
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState(false)

  // ── Admin tabs ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState('races')

  // ── Result sheet ─────────────────────────────────────────────────────────
  const [resultSheetOpen, setResultSheetOpen] = useState(false)
  const [selectedRace, setSelectedRace] = useState(null)
  const [resultDraft, setResultDraft] = useState({ P1: null, P2: null, P3: null })
  const [resultPosition, setResultPosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Penalty sheet ────────────────────────────────────────────────────────
  const [penaltySheetOpen, setPenaltySheetOpen] = useState(false)
  const [penaltyRaceId, setPenaltyRaceId] = useState(null)
  const [penaltyPlayerId, setPenaltyPlayerId] = useState(null)
  const [penaltyType, setPenaltyType] = useState('late')

  // ── Admin player management ───────────────────────────────────────────────
  const [adminSelectedPid, setAdminSelectedPid] = useState(PLAYERS_ORDER[0])
  const [adminPlayerDraft, setAdminPlayerDraft] = useState(null)
  const [adminPlayerSaving, setAdminPlayerSaving] = useState(false)

  // ── Danger zone confirm modals ───────────────────────────────────────────
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)

  // ── Firestore ────────────────────────────────────────────────────────────
  const { data: races } = useCollection('races')
  const { data: predictions } = useCollection('predictions')
  const { data: penalties } = useCollection('penalties')
  const { data: players } = useCollection('players')

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  // Initialize profile draft once player data loads
  useEffect(() => {
    if (profileDraft !== null) return
    const player = players.find(p => p.id === currentPlayerId)
    if (!player) return
    setProfileDraft({
      displayName: player.displayName ?? '',
      nickname: player.nickname ?? '',
      color: player.color ?? PROFILE_COLORS[0],
      avatar: player.avatar ?? '🏎️',
    })
  }, [players, currentPlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Profile handlers ──────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!profileDraft || !currentPlayerId) return
    setProfileSaving(true)
    try {
      const existing = players.find(p => p.id === currentPlayerId) ?? {}
      await upsertDoc('players', currentPlayerId, { ...existing, ...profileDraft })
      addToast('Profil mis à jour !', 'success')
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  // Sync admin player draft when selected player changes or players load
  useEffect(() => {
    const player = players.find(p => p.id === adminSelectedPid)
    setAdminPlayerDraft(player ? {
      displayName: player.displayName ?? '',
      nickname: player.nickname ?? '',
      color: player.color ?? PROFILE_COLORS[0],
      avatar: player.avatar ?? '🏎️',
    } : null)
  }, [adminSelectedPid, players])

  const saveAdminPlayerProfile = async () => {
    if (!adminPlayerDraft || !adminSelectedPid) return
    setAdminPlayerSaving(true)
    try {
      const existing = players.find(p => p.id === adminSelectedPid) ?? {}
      await upsertDoc('players', adminSelectedPid, { ...existing, ...adminPlayerDraft })
      addToast(`Profil de ${adminPlayerDraft.displayName || adminSelectedPid} mis à jour !`, 'success')
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setAdminPlayerSaving(false)
    }
  }

  // ── Admin handlers ────────────────────────────────────────────────────────
  const tryLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setAuthError(false)
    } else {
      setAuthError(true)
      setPassword('')
    }
  }

  const openResultSheet = (race) => {
    setSelectedRace(race)
    setResultDraft(race.result ?? { P1: null, P2: null, P3: null })
    setResultSheetOpen(true)
  }

  const closeResultSheet = () => {
    setResultSheetOpen(false)
    setSelectedRace(null)
    setResultPosition(null)
    setDriverPickerOpen(false)
  }

  const selectDriver = (driver) => {
    const newResult = { ...resultDraft }
    for (const pos of ['P1', 'P2', 'P3']) {
      if (newResult[pos] === driver && pos !== resultPosition) newResult[pos] = null
    }
    newResult[resultPosition] = driver
    setResultDraft(newResult)
    setDriverPickerOpen(false)
    setResultPosition(null)
  }

  const saveResult = async () => {
    if (!resultDraft.P1 || !resultDraft.P2 || !resultDraft.P3 || !selectedRace) return
    setSaving(true)
    try {
      await upsertDoc('races', String(selectedRace.id), {
        ...selectedRace,
        result: resultDraft,
        status: 'completed',
      })
      addToast(`Résultat GP ${selectedRace.name} enregistré !`, 'success')
      closeResultSheet()
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetRaceResult = async (race) => {
    if (!confirm(`Réinitialiser le résultat de ${race.name} ?`)) return
    try {
      await upsertDoc('races', String(race.id), { ...race, result: null, status: 'upcoming' })
      addToast('Résultat supprimé', 'info')
    } catch {
      addToast('Erreur', 'error')
    }
  }

  const handleSeedDatabase = async () => {
    setSeeding(true)
    try {
      await seedDatabase()
      addToast('Base de données initialisée !', 'success')
    } catch (err) {
      addToast('Erreur : ' + err.message, 'error')
    } finally {
      setSeeding(false)
      setConfirmSeed(false)
    }
  }

  const handleClearDatabase = async () => {
    setClearing(true)
    try {
      await clearDatabase()
      addToast('Base de données vidée', 'warning')
    } catch {
      addToast('Erreur', 'error')
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  const addPenalty = async () => {
    if (!penaltyRaceId || !penaltyPlayerId) return
    const id = `pen_${penaltyType}_${penaltyPlayerId}_${penaltyRaceId}_${Date.now()}`
    try {
      await upsertDoc('penalties', id, { playerId: penaltyPlayerId, raceId: penaltyRaceId, type: penaltyType })
      addToast('Pénalité ajoutée', 'warning')
      setPenaltySheetOpen(false)
    } catch {
      addToast('Erreur', 'error')
    }
  }

  const removePenalty = async (penId) => {
    if (!confirm('Supprimer cette pénalité ?')) return
    try {
      await deleteDocument('penalties', penId)
      addToast('Pénalité supprimée', 'info')
    } catch {
      addToast('Erreur', 'error')
    }
  }

  const lockPrediction = async (pred) => {
    try {
      await upsertDoc('predictions', pred._id, { ...pred, locked: !pred.locked })
      addToast(`Pronostic ${pred.locked ? 'déverrouillé' : 'verrouillé'}`, 'info')
    } catch {
      addToast('Erreur', 'error')
    }
  }

  // ── Current player display values ─────────────────────────────────────────
  const currentPlayerData = useMemo(() =>
    players.find(p => p.id === currentPlayerId),
    [players, currentPlayerId]
  )
  const displayColor = profileDraft?.color ?? currentPlayerData?.color ?? PLAYER_COLORS_FALLBACK[currentPlayerId] ?? '#6B6B8A'
  const displayAvatar = profileDraft?.avatar ?? currentPlayerData?.avatar ?? PLAYER_AVATARS_FALLBACK[currentPlayerId] ?? '🏎️'
  const displayName = profileDraft?.displayName || currentPlayerData?.displayName || currentPlayerId

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">Administration</h1>
      </div>

      {/* ── MON PROFIL (no auth required) ── */}
      <div className="px-5 mb-6">
        <p className="section-title">Mon Profil</p>
        <div className="card p-4 space-y-4">
          {/* Preview */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border"
            style={{ borderColor: displayColor + '50', backgroundColor: displayColor + '12' }}
          >
            <span className="text-3xl leading-none">{displayAvatar}</span>
            <div>
              <p className="font-black text-base leading-tight" style={{ color: displayColor }}>
                {displayName}
              </p>
              {profileDraft?.nickname && (
                <p className="text-xs text-muted">{profileDraft.nickname}</p>
              )}
            </div>
          </div>

          {profileDraft ? (
            <>
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

              {/* Nickname */}
              <div>
                <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Surnom</p>
                <select
                  value={profileDraft.nickname}
                  onChange={e => setProfileDraft(d => ({ ...d, nickname: e.target.value }))}
                  className="input-field bg-surfaceHigh text-white appearance-none"
                >
                  {NICKNAMES.map(n => (
                    <option key={n} value={n}>{n || '— Aucun surnom —'}</option>
                  ))}
                </select>
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
            </>
          ) : (
            <p className="text-sm text-muted text-center py-4">Chargement du profil…</p>
          )}
        </div>
      </div>

      {/* ── SECTION ADMIN (password gated) ── */}
      <div className="px-5 mb-5">
        <p className="section-title">Section Admin</p>

        {!authenticated ? (
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔐</span>
              <p className="text-sm text-muted">Accès réservé à l'administrateur</p>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && tryLogin()}
              placeholder="Mot de passe admin"
              className={`input-field ${authError ? 'border-accent' : ''}`}
            />
            {authError && (
              <p className="text-accent text-sm font-bold">Mot de passe incorrect</p>
            )}
            <button onClick={tryLogin} className="btn-primary w-full text-center">
              Connexion
            </button>
          </div>
        ) : (
          <>
            {/* Auth header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-green-400 font-bold">✓ Authentifié</p>
              <button
                onClick={() => setAuthenticated(false)}
                className="text-xs text-muted border border-border rounded-lg px-3 py-1.5"
              >
                Déconnexion
              </button>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                onClick={() => setPenaltySheetOpen(true)}
                className="card p-4 text-left active:opacity-70"
              >
                <span className="text-2xl">⚠️</span>
                <p className="font-bold text-sm mt-2">Ajouter une pénalité</p>
                <p className="text-xs text-muted mt-0.5">Tardif / Changement</p>
              </button>
              <button
                onClick={onChangePlayer}
                className="card p-4 text-left active:opacity-70"
              >
                <span className="text-2xl">🔄</span>
                <p className="font-bold text-sm mt-2">Changer le joueur</p>
                <p className="text-xs text-muted mt-0.5">Cet appareil</p>
              </button>
            </div>

            {/* ── Gestion des joueurs ── */}
            <div className="card p-4 mb-5 space-y-4">
              <p className="section-title">Gestion des joueurs</p>

              {/* Player selector */}
              <div className="flex gap-2">
                {PLAYERS_ORDER.map(pid => {
                  const p = players.find(pl => pl.id === pid)
                  const avatar = String(p?.avatar ?? PLAYER_AVATARS_FALLBACK[pid])
                  const color = String(p?.color ?? PLAYER_COLORS_FALLBACK[pid])
                  return (
                    <button
                      key={pid}
                      onClick={() => setAdminSelectedPid(pid)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all ${
                        adminSelectedPid === pid ? 'border-white/40 bg-surfaceHigh' : 'border-border'
                      }`}
                      style={adminSelectedPid === pid ? { borderColor: color + '80' } : {}}
                    >
                      <span className="text-lg leading-none">{avatar}</span>
                      <span className="text-[9px] font-bold truncate w-full text-center" style={{ color: adminSelectedPid === pid ? color : undefined }}>
                        {p?.displayName ?? pid}
                      </span>
                    </button>
                  )
                })}
              </div>

              {adminPlayerDraft ? (
                <>
                  {/* Preview */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-xl border"
                    style={{
                      borderColor: adminPlayerDraft.color + '50',
                      backgroundColor: adminPlayerDraft.color + '12',
                    }}
                  >
                    <span className="text-2xl leading-none">{adminPlayerDraft.avatar}</span>
                    <div>
                      <p className="font-black text-sm leading-tight" style={{ color: adminPlayerDraft.color }}>
                        {adminPlayerDraft.displayName || '…'}
                      </p>
                      {adminPlayerDraft.nickname && (
                        <p className="text-xs text-muted">{adminPlayerDraft.nickname}</p>
                      )}
                    </div>
                  </div>

                  {/* Display name */}
                  <div>
                    <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Pseudo</p>
                    <input
                      type="text"
                      value={adminPlayerDraft.displayName}
                      onChange={e => setAdminPlayerDraft(d => ({ ...d, displayName: e.target.value }))}
                      className="input-field"
                      maxLength={20}
                    />
                  </div>

                  {/* Nickname */}
                  <div>
                    <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Surnom</p>
                    <select
                      value={adminPlayerDraft.nickname}
                      onChange={e => setAdminPlayerDraft(d => ({ ...d, nickname: e.target.value }))}
                      className="input-field bg-surfaceHigh text-white appearance-none"
                    >
                      {NICKNAMES.map(n => (
                        <option key={n} value={n}>{n || '— Aucun surnom —'}</option>
                      ))}
                    </select>
                  </div>

                  {/* Color */}
                  <div>
                    <p className="text-xs text-muted font-bold uppercase tracking-wide mb-2">Couleur</p>
                    <div className="flex flex-wrap gap-2">
                      {PROFILE_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setAdminPlayerDraft(d => ({ ...d, color: c }))}
                          className="w-8 h-8 rounded-full border-2 transition-all active:scale-90"
                          style={{
                            backgroundColor: c,
                            borderColor: adminPlayerDraft.color === c ? '#fff' : 'transparent',
                            boxShadow: adminPlayerDraft.color === c ? `0 0 0 1px ${c}` : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Avatar */}
                  <div>
                    <p className="text-xs text-muted font-bold uppercase tracking-wide mb-2">Avatar</p>
                    <div className="flex flex-wrap gap-2">
                      {PROFILE_AVATARS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setAdminPlayerDraft(d => ({ ...d, avatar: emoji }))}
                          className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all active:scale-90 border ${
                            adminPlayerDraft.avatar === emoji
                              ? 'border-white bg-surfaceHigh'
                              : 'border-transparent bg-surfaceHigh/50'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={saveAdminPlayerProfile}
                    disabled={adminPlayerSaving || !adminPlayerDraft.displayName.trim()}
                    className={`w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 ${
                      !adminPlayerSaving && adminPlayerDraft.displayName.trim()
                        ? 'bg-accent text-white'
                        : 'bg-surfaceHigh text-muted cursor-not-allowed'
                    }`}
                  >
                    {adminPlayerSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted text-center py-2">Chargement…</p>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-surfaceHigh rounded-xl p-1 mb-4">
              {[
                { id: 'races', label: 'Courses' },
                { id: 'predictions', label: 'Pronos' },
                { id: 'penalties', label: 'Pénalités' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    tab === t.id ? 'bg-accent text-white' : 'text-muted'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Races tab */}
            {tab === 'races' && (
              <div className="space-y-2">
                {sortedRaces.map(race => (
                  <div key={race.id} className="card p-3 flex items-center gap-3">
                    <span className="text-xl">{race.flag}</span>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{race.name}</p>
                      <p className="text-xs text-muted">
                        {new Date(race.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                      {race.result && (
                        <p className="text-xs text-green-400 font-bold mt-0.5">
                          {race.result.P1} · {race.result.P2} · {race.result.P3}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => openResultSheet(race)}
                        className="text-xs bg-accent/20 text-accent font-bold px-3 py-1.5 rounded-lg"
                      >
                        {race.result ? 'Modifier' : 'Résultat'}
                      </button>
                      {race.result && (
                        <button
                          onClick={() => resetRaceResult(race)}
                          className="text-xs text-muted font-bold px-3 py-1.5 rounded-lg border border-border"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Predictions tab */}
            {tab === 'predictions' && (
              <div className="space-y-3">
                {sortedRaces
                  .filter(r => r.status === 'completed' || predictions.some(p => p.raceId === r.id))
                  .map(race => {
                    const racePreds = predictions.filter(p => p.raceId === race.id)
                    if (!racePreds.length) return null
                    return (
                      <div key={race.id} className="card p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span>{race.flag}</span>
                          <p className="font-bold text-sm">GP {race.name}</p>
                          <span className={`text-xs font-bold ml-auto px-2 py-0.5 rounded-full ${
                            race.status === 'completed' ? 'bg-muted/20 text-muted' : 'bg-accent/20 text-accent'
                          }`}>
                            {race.status === 'completed' ? 'Terminé' : 'À venir'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {PLAYERS_ORDER.map(pid => {
                            const player = players.find(p => p.id === pid)
                            const avatar = String(player?.avatar ?? PLAYER_AVATARS_FALLBACK[pid])
                            const color = String(player?.color ?? PLAYER_COLORS_FALLBACK[pid])
                            const pred = racePreds.find(p => p.playerId === pid)
                            if (!pred) return (
                              <div key={pid} className="flex items-center gap-2 py-1 opacity-40">
                                <span className="text-sm">{avatar}</span>
                                <span className="text-xs text-muted flex-1">
                                  {player?.displayName ?? pid} — pas de prono
                                </span>
                              </div>
                            )
                            return (
                              <div key={pid} className="flex items-center gap-2 py-1">
                                <span className="text-sm">{avatar}</span>
                                <span className="text-xs font-bold flex-1" style={{ color }}>
                                  {player?.displayName ?? pid}
                                </span>
                                <span className="text-xs text-muted">
                                  {pred.prediction?.P1} · {pred.prediction?.P2} · {pred.prediction?.P3}
                                </span>
                                <button
                                  onClick={() => lockPrediction(pred)}
                                  className={`text-xs px-2 py-1 rounded font-bold ml-1 ${
                                    pred.locked ? 'bg-accent/20 text-accent' : 'bg-green-500/20 text-green-400'
                                  }`}
                                >
                                  {pred.locked ? '🔒' : '🔓'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Penalties tab */}
            {tab === 'penalties' && (
              <div className="space-y-3">
                {penalties.length === 0 ? (
                  <div className="text-center py-10 text-muted">
                    <span className="text-4xl block mb-3">✅</span>
                    <p className="font-bold">Aucune pénalité</p>
                  </div>
                ) : (
                  penalties.map(pen => {
                    const race = races.find(r => r.id === pen.raceId)
                    const player = players.find(p => p.id === pen.playerId)
                    return (
                      <div key={pen._id} className="card p-3 flex items-center gap-3">
                        <span>{String(player?.avatar ?? PLAYER_AVATARS_FALLBACK[pen.playerId])}</span>
                        <div className="flex-1">
                          <p className="font-bold text-sm">{player?.displayName ?? pen.playerId}</p>
                          <p className="text-xs text-muted">
                            GP {race?.name ?? pen.raceId} · {pen.type === 'late' ? 'Tardif (-10)' : 'Modification (-5)'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          pen.type === 'late' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                        }`}>
                          -{pen.type === 'late' ? 10 : 5}
                        </span>
                        <button
                          onClick={() => removePenalty(pen._id)}
                          className="text-muted text-sm p-1 hover:text-white transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    )
                  })
                )}
                <button
                  onClick={() => setPenaltySheetOpen(true)}
                  className="w-full btn-primary text-center"
                >
                  + Ajouter une pénalité
                </button>
              </div>
            )}

            {/* ── ZONE DANGEREUSE ── */}
            <div
              className="mt-8 rounded-2xl border p-4 space-y-3"
              style={{ backgroundColor: 'rgba(127,0,0,0.12)', borderColor: 'rgba(200,0,0,0.25)' }}
            >
              <p className="text-xs font-black uppercase tracking-widest text-red-400">⚠️ Zone Dangereuse</p>
              <button
                onClick={() => setConfirmSeed(true)}
                disabled={seeding}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 active:opacity-70 text-left"
              >
                <span className="text-xl">🌱</span>
                <div>
                  <p className="font-bold text-sm">{seeding ? 'Initialisation…' : 'Initialiser les données'}</p>
                  <p className="text-xs text-muted">Réinitialise Race 1 + joueurs</p>
                </div>
              </button>
              <button
                onClick={() => setConfirmClear(true)}
                disabled={clearing}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-700/30 bg-red-900/20 active:opacity-70 text-left"
              >
                <span className="text-xl">🗑️</span>
                <div>
                  <p className="font-bold text-sm text-red-400">{clearing ? 'Suppression…' : 'Vider la BDD'}</p>
                  <p className="text-xs text-muted">Supprime tout — irréversible</p>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── CONFIRM MODALS ── */}
      <ConfirmModal
        isOpen={confirmSeed}
        title="Initialiser les données ?"
        message="Cette action va réinitialiser les données de la saison avec les valeurs de démo (Race 1, joueurs, pronos). Es-tu sûr ?"
        confirmLabel={seeding ? 'En cours…' : 'Initialiser'}
        danger={false}
        onConfirm={handleSeedDatabase}
        onCancel={() => setConfirmSeed(false)}
      />
      <ConfirmModal
        isOpen={confirmClear}
        title="Vider la base de données ?"
        message="⚠️ Cette action supprimera définitivement tous les pronos, résultats et scores de la saison. IRRÉVERSIBLE. Es-tu sûr ?"
        confirmLabel={clearing ? 'Suppression…' : 'Tout supprimer'}
        danger
        onConfirm={handleClearDatabase}
        onCancel={() => setConfirmClear(false)}
      />

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet
        isOpen={resultSheetOpen}
        onClose={closeResultSheet}
        title={selectedRace ? `Résultat : GP ${selectedRace.name} ${selectedRace.flag}` : ''}
        fullHeight
      >
        {selectedRace && (
          <div className="p-5 pb-10 space-y-5">
            <p className="section-title">Podium officiel</p>
            <div className="space-y-3">
              {['P1', 'P2', 'P3'].map((pos, i) => {
                const driver = resultDraft[pos]
                return (
                  <button
                    key={pos}
                    onClick={() => { setResultPosition(pos); setDriverPickerOpen(true) }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98]
                      ${driver ? 'border-accent/60 bg-accent/10' : 'border-dashed border-border'}
                    `}
                  >
                    <div className={`position-badge text-bg font-black text-sm shrink-0 ${
                      i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                    }`}>
                      {i + 1}
                    </div>
                    {driver ? (
                      <>
                        <span className="font-bold flex-1 text-left">{driver}</span>
                        <span className="text-muted text-sm" onClick={e => { e.stopPropagation(); setResultDraft(p => ({ ...p, [pos]: null })) }}>✕</span>
                      </>
                    ) : (
                      <span className="text-muted text-sm flex-1 text-left">Sélectionner le {pos}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={saveResult}
              disabled={!resultDraft.P1 || !resultDraft.P2 || !resultDraft.P3 || saving}
              className={`w-full py-4 rounded-xl font-black text-lg transition-all active:scale-95 ${
                resultDraft.P1 && resultDraft.P2 && resultDraft.P3 && !saving
                  ? 'bg-accent text-white shadow-glow-red'
                  : 'bg-surfaceHigh text-muted cursor-not-allowed'
              }`}
            >
              {saving ? 'Enregistrement...' : 'Valider le résultat'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={driverPickerOpen}
        onClose={() => { setDriverPickerOpen(false); setResultPosition(null) }}
        title={`Sélectionner ${resultPosition}`}
        fullHeight
      >
        <div className="p-4 pb-10">
          {TEAMS.map(team => (
            <div key={team.name} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                <span className="text-xs font-bold text-muted uppercase tracking-wide">{team.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {team.drivers.map(driver => {
                  const isSelected = Object.values(resultDraft).includes(driver)
                  const isCurrent = resultDraft[resultPosition] === driver
                  return (
                    <button
                      key={driver}
                      onClick={() => selectDriver(driver)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        isCurrent ? 'border-accent bg-accent/20' :
                        isSelected ? 'border-muted/30 bg-surfaceHigh/30 opacity-50' :
                        'border-border bg-surfaceHigh hover:border-muted'
                      }`}
                    >
                      <p className="font-bold text-sm">{driver}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                        <p className="text-xs text-muted">{team.name}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={penaltySheetOpen}
        onClose={() => setPenaltySheetOpen(false)}
        title="Ajouter une pénalité"
      >
        <div className="p-5 pb-10 space-y-4">
          <div>
            <p className="section-title">Joueur</p>
            <div className="grid grid-cols-2 gap-2">
              {PLAYERS_ORDER.map(pid => {
                const player = players.find(p => p.id === pid)
                const avatar = String(player?.avatar ?? PLAYER_AVATARS_FALLBACK[pid])
                return (
                  <button
                    key={pid}
                    onClick={() => setPenaltyPlayerId(pid)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      penaltyPlayerId === pid ? 'border-accent bg-accent/20' : 'border-border'
                    }`}
                  >
                    <span className="text-xl">{avatar}</span>
                    <p className="font-bold text-sm mt-1">{player?.displayName ?? pid}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="section-title">Course</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {sortedRaces.map(race => (
                <button
                  key={race.id}
                  onClick={() => setPenaltyRaceId(race.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    penaltyRaceId === race.id ? 'border-accent bg-accent/20' : 'border-border hover:border-muted'
                  }`}
                >
                  <span>{race.flag}</span>
                  <span className="text-sm font-bold">{race.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="section-title">Type de pénalité</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPenaltyType('late')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  penaltyType === 'late' ? 'border-accent bg-accent/20' : 'border-border'
                }`}
              >
                <p className="font-bold text-sm">Tardif</p>
                <p className="text-accent font-black">-10 pts</p>
              </button>
              <button
                onClick={() => setPenaltyType('change')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  penaltyType === 'change' ? 'border-accent bg-accent/20' : 'border-border'
                }`}
              >
                <p className="font-bold text-sm">Modification</p>
                <p className="text-accent font-black">-5 pts</p>
              </button>
            </div>
          </div>

          <button
            onClick={addPenalty}
            disabled={!penaltyPlayerId || !penaltyRaceId}
            className={`w-full py-4 rounded-xl font-black text-lg transition-all ${
              penaltyPlayerId && penaltyRaceId
                ? 'bg-accent text-white shadow-glow-red'
                : 'bg-surfaceHigh text-muted cursor-not-allowed'
            }`}
          >
            Ajouter la pénalité
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
