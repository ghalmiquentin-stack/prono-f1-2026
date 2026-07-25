import { useState, useEffect, useMemo } from 'react'
import { LogOut, Trash2, Copy, Check, ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, useDocument, where, upsertDoc, deleteDocument } from '../hooks/useFirestore'
import { getProfile } from '../utils/profiles'
import { parseAmount } from '../utils/leagues'
import { hasRaceStarted } from '../utils/races'
import { getPenaltyAmount } from '../utils/penalties'
import LeagueRulesFields from '../components/LeagueRulesFields'
import BottomSheet from '../components/BottomSheet'
import LeaveLeagueSheet from '../components/LeaveLeagueSheet'
import DeleteLeagueSheet from '../components/DeleteLeagueSheet'
import ConfirmModal from '../components/ConfirmModal'
import Skeleton from '../components/Skeleton'

function formatSubmittedDate(ts) {
  if (!ts) return '—'
  const date = ts?.toDate?.() ?? new Date(ts)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Same "Xh_MM" time formatting convention as "Soumis le…" on the Accueil
// card (see formatPredTime there), applied to a single short date+time —
// no dual-timezone flags here, this is for the compact admin penalty row.
// Returns null (not '—') when absent, so the caller can omit it entirely.
function formatPenaltyDate(ts) {
  if (!ts) return null
  const date = ts?.toDate?.() ?? new Date(ts)
  const datePart = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${datePart}, ${h}h${m}`
}

export default function ReglagesLigue({ leagueId, activeLeagueId, onSelectLeague, onClearActiveLeague, setActiveTab, addToast }) {
  const { user } = useAuth()
  const { data: league, loading: leagueLoading } = useDocument(user ? 'leagues' : null, leagueId)

  const leagueConstraint = useMemo(() => [where('leagueId', '==', leagueId)], [leagueId])
  const { data: players, loading: playersLoading } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: predictions } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races } = useCollection(user ? 'races' : null)

  const { data: myProfiles } = useCollection(
    user?.uid ? 'players' : null,
    user?.uid ? [where('authUid', '==', user.uid)] : []
  )

  const sortedRaces = useMemo(() => [...races].sort((a, b) => a.id - b.id), [races])

  const isLeagueAdmin = Array.isArray(league?.adminUids) && league.adminUids.includes(user?.uid)
  const isSoleAdmin = isLeagueAdmin && league.adminUids.length === 1
  const myActiveProfile = myProfiles.find(p => p.leagueId === leagueId && p.active !== false)

  // ── Édition du nom de la ligue ───────────────────────────────────────────
  const [nameDraft, setNameDraft] = useState('')
  const [nameLoaded, setNameLoaded] = useState(false)
  const [savingName, setSavingName] = useState(false)

  // Reset so the field re-syncs from Firestore if the viewed league changes.
  useEffect(() => { setNameLoaded(false) }, [leagueId])

  useEffect(() => {
    if (!league || nameLoaded) return
    setNameDraft(league.name ?? '')
    setNameLoaded(true)
  }, [league, nameLoaded])

  const nameInvalid = !nameDraft.trim()
  const nameChanged = nameDraft.trim() !== (league?.name ?? '').trim()

  const saveLeagueName = async () => {
    if (nameInvalid || !nameChanged) return
    setSavingName(true)
    try {
      await upsertDoc('leagues', leagueId, { name: nameDraft.trim() })
      addToast?.('Nom de la ligue mis à jour', 'success')
    } catch {
      addToast?.('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSavingName(false)
    }
  }

  // ── Édition des règles ───────────────────────────────────────────────────
  const [modEnabled, setModEnabled] = useState(true)
  const [modAmount, setModAmount] = useState('5')
  const [postQualEnabled, setPostQualEnabled] = useState(true)
  const [postQualAmount, setPostQualAmount] = useState('10')
  const [hideEnabled, setHideEnabled] = useState(true)
  const [rulesLoaded, setRulesLoaded] = useState(false)
  const [savingRules, setSavingRules] = useState(false)

  // Reset so the form re-syncs from Firestore if the viewed league changes.
  useEffect(() => { setRulesLoaded(false) }, [leagueId])

  useEffect(() => {
    if (!league || rulesLoaded) return
    const rules = league.rules ?? {}
    setModEnabled(rules.modificationPenalty?.enabled ?? true)
    setModAmount(String(rules.modificationPenalty?.amount ?? 5))
    setPostQualEnabled(rules.postQualifsPenalty?.enabled ?? true)
    setPostQualAmount(String(rules.postQualifsPenalty?.amount ?? 10))
    setHideEnabled(rules.hidePredictionsBeforeRace?.enabled ?? true)
    setRulesLoaded(true)
  }, [league, rulesLoaded])

  const modAmountNum = parseAmount(modAmount)
  const postQualAmountNum = parseAmount(postQualAmount)
  const modAmountInvalid = modEnabled && modAmountNum <= 0
  const postQualAmountInvalid = postQualEnabled && postQualAmountNum <= 0
  const rulesHaveError = modAmountInvalid || postQualAmountInvalid

  const saveRules = async () => {
    if (rulesHaveError) return
    setSavingRules(true)
    try {
      await upsertDoc('leagues', leagueId, {
        rules: {
          modificationPenalty: { enabled: modEnabled, amount: modAmountNum },
          postQualifsPenalty: { enabled: postQualEnabled, amount: postQualAmountNum },
          hidePredictionsBeforeRace: { enabled: hideEnabled },
        },
      })
      addToast?.('Règles mises à jour', 'success')
    } catch {
      addToast?.('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSavingRules(false)
    }
  }

  // ── Onglets Pronos / Pénalités ───────────────────────────────────────────
  const [tab, setTab] = useState('pronos')
  const [penaltySheetOpen, setPenaltySheetOpen] = useState(false)
  const [penaltyRaceId, setPenaltyRaceId] = useState(null)
  const [penaltyPlayerId, setPenaltyPlayerId] = useState(null)
  const [penaltyType, setPenaltyType] = useState('late')
  const [expandedPenaltyPlayer, setExpandedPenaltyPlayer] = useState(null) // player.id

  // Exceptional manual override — lets a player edit their prediction again
  // even after the race has started (see PredictionSheet's pencil button on
  // Accueil). Default is off; the admin turns it on per-prediction here.
  const toggleManualUnlock = async (pred) => {
    try {
      await upsertDoc('predictions', pred._id, { ...pred, manualUnlockOverride: !pred.manualUnlockOverride })
      addToast?.(
        pred.manualUnlockOverride
          ? 'Déverrouillage exceptionnel désactivé'
          : 'Déverrouillage exceptionnel activé — modification possible même après le départ',
        'info'
      )
    } catch {
      addToast?.('Erreur', 'error')
    }
  }

  const addPenalty = async () => {
    if (!penaltyRaceId || !penaltyPlayerId) return
    const id = `pen_${penaltyType}_${penaltyPlayerId}_${penaltyRaceId}_${Date.now()}`
    // Snapshot the currently configured amount so the penalty's own points
    // stay fixed even if the league's rule amount changes later.
    const amount = penaltyType === 'late'
      ? (league?.rules?.postQualifsPenalty?.amount ?? 10)
      : (league?.rules?.modificationPenalty?.amount ?? 5)
    try {
      await upsertDoc('penalties', id, {
        playerId: penaltyPlayerId, raceId: penaltyRaceId, type: penaltyType, leagueId, amount,
        createdAt: new Date(),
      })
      addToast?.('Pénalité ajoutée', 'warning')
      setPenaltySheetOpen(false)
      setPenaltyRaceId(null)
      setPenaltyPlayerId(null)
    } catch {
      addToast?.('Erreur', 'error')
    }
  }

  const [deletePenaltyTarget, setDeletePenaltyTarget] = useState(null) // penId

  const confirmRemovePenalty = async () => {
    if (!deletePenaltyTarget) return
    try {
      await deleteDocument('penalties', deletePenaltyTarget)
      addToast?.('Pénalité supprimée', 'info')
    } catch {
      addToast?.('Erreur', 'error')
    } finally {
      setDeletePenaltyTarget(null)
    }
  }

  // ── Retirer un joueur ────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState(null) // player doc
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  const openRemoveSheet = (player) => {
    setRemoveError('')
    setRemoveTarget(player)
  }

  const closeRemoveSheet = () => {
    setRemoveTarget(null)
    setRemoveError('')
  }

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return
    setRemoving(true)
    setRemoveError('')
    try {
      // Same mechanism as "Quitter la ligue" — active: false. If this was
      // the player's active league, the existing App.jsx effects switch
      // them off it the next time they open the app, no extra handling here.
      await upsertDoc('players', removeTarget._id, { active: false })
      addToast?.('Joueur retiré de la ligue', 'info')
      closeRemoveSheet()
    } catch {
      setRemoveError('Erreur lors du retrait du joueur. Réessayez.')
    } finally {
      setRemoving(false)
    }
  }

  // ── Quitter / supprimer la ligue ─────────────────────────────────────────
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false)
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)

  // ── Copie du code d'invitation ───────────────────────────────────────────
  const [codeCopied, setCodeCopied] = useState(false)

  const copyInviteCode = async () => {
    if (!league?.code) return
    try {
      await navigator.clipboard.writeText(league.code)
      setCodeCopied(true)
      addToast?.('Code copié !', 'success')
      setTimeout(() => setCodeCopied(false), 1500)
    } catch {
      addToast?.('Impossible de copier le code', 'error')
    }
  }

  const handleLeagueLeft = () => {
    if (activeLeagueId === leagueId) {
      const remaining = myProfiles.filter(p => p.active !== false && p.leagueId !== leagueId)
      if (remaining.length > 0) {
        onSelectLeague?.(remaining[0].leagueId)
      } else {
        onClearActiveLeague?.()
        setActiveTab?.('leagues')
      }
    } else {
      setActiveTab?.('leagues')
    }
  }

  const handleLeagueDeleted = () => {
    if (activeLeagueId === leagueId) onClearActiveLeague?.()
    setActiveTab?.('leagues')
  }

  if (leagueLoading || playersLoading) {
    return (
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Skeleton rows={2} height="h-28" />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">
          Réglages · {league?.name ?? 'Ligue'}
        </h1>
      </div>

      <div className="px-5 space-y-5">
        {/* ── Code d'invitation ── */}
        <div className="card p-4">
          <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1.5">Code d'invitation</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-black tracking-widest text-lg flex-1">{league?.code}</p>
            <button
              onClick={copyInviteCode}
              className="p-1.5 rounded-lg text-muted hover:text-white transition-colors"
              aria-label="Copier le code d'invitation"
            >
              {codeCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* ── Nom de la ligue ── */}
        {isLeagueAdmin && (
          <div className="card p-5 space-y-3">
            <p className="section-title">Nom de la ligue</p>
            <input
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="input-field"
              maxLength={30}
              placeholder="Nom de la ligue"
            />
            <button
              onClick={saveLeagueName}
              disabled={nameInvalid || !nameChanged || savingName}
              className={`w-full py-3.5 rounded-xl font-black text-base transition-all active:scale-95 ${
                !nameInvalid && nameChanged && !savingName
                  ? 'bg-accent text-white shadow-glow-red'
                  : 'bg-surfaceHigh text-muted cursor-not-allowed'
              }`}
            >
              {savingName ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}

        {/* ── Règles ── */}
        <div className="card p-5 space-y-4">
          <p className="section-title">Règles de la ligue</p>

          <LeagueRulesFields
            modEnabled={modEnabled} setModEnabled={setModEnabled}
            modAmount={modAmount} setModAmount={setModAmount} modAmountInvalid={modAmountInvalid}
            postQualEnabled={postQualEnabled} setPostQualEnabled={setPostQualEnabled}
            postQualAmount={postQualAmount} setPostQualAmount={setPostQualAmount} postQualAmountInvalid={postQualAmountInvalid}
            hideEnabled={hideEnabled} setHideEnabled={setHideEnabled}
          />

          <button
            onClick={saveRules}
            disabled={rulesHaveError || savingRules}
            className={`w-full py-3.5 rounded-xl font-black text-base transition-all active:scale-95 ${
              !rulesHaveError && !savingRules
                ? 'bg-accent text-white shadow-glow-red'
                : 'bg-surfaceHigh text-muted cursor-not-allowed'
            }`}
          >
            {savingRules ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {/* ── Joueurs de la ligue ── */}
        <div className="card p-5 space-y-3">
          <p className="section-title">Joueurs de la ligue</p>
          <div className="space-y-2">
            {players.filter(p => p.active !== false).map(player => {
              const identity = getProfile(profiles, player)
              const avatar = String(identity?.avatar ?? '🏎️')
              const color = String(identity?.color ?? '#6B6B8A')
              const displayName = String(identity?.displayName ?? player.id)
              const isSelf = player._id === myActiveProfile?._id
              return (
                <div key={player._id} className="flex items-center gap-3 p-2 rounded-lg bg-surfaceHigh/30">
                  <span className="text-xl leading-none">{avatar}</span>
                  <span className="flex-1 font-bold text-sm truncate" style={{ color }}>
                    {displayName}
                    {isSelf && <span className="text-xs text-muted font-normal ml-1">(vous)</span>}
                  </span>
                  {isLeagueAdmin && !isSelf && (
                    <button
                      onClick={() => openRemoveSheet(player)}
                      className="text-xs font-bold text-red-400 px-3 py-1.5 rounded-lg border border-red-700/30 hover:bg-red-900/20 transition-colors shrink-0"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Onglets Pronos / Pénalités ── */}
        <div>
          <div className="flex gap-2 bg-surfaceHigh rounded-xl p-1 mb-4">
            {[
              { id: 'pronos', label: 'Pronos' },
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

          {tab === 'pronos' && (
            <div className="space-y-3">
              {sortedRaces
                .filter(r => r.status === 'completed' || predictions.some(p => p.raceId === r.id))
                .map(race => {
                  const racePreds = predictions.filter(p => p.raceId === race.id)
                  if (!racePreds.length) return null
                  // Same league rule as Accueil — lifts automatically once
                  // the GP has actually started, no admin exemption.
                  const hideActive = !!league?.rules?.hidePredictionsBeforeRace?.enabled && !hasRaceStarted(race)
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
                        {players.map(player => {
                          const identity = getProfile(profiles, player)
                          const avatar = String(identity?.avatar ?? '🏎️')
                          const color = String(identity?.color ?? '#6B6B8A')
                          const pred = racePreds.find(p => p.playerId === player.id)
                          if (!pred) return (
                            <div key={player.id} className="flex items-center gap-2 py-1 opacity-40">
                              <span className="text-sm">{avatar}</span>
                              <span className="text-xs text-muted flex-1">
                                {identity?.displayName ?? player.id} — pas de prono
                              </span>
                            </div>
                          )
                          return (
                            <div key={player.id} className="flex items-center gap-2 py-1">
                              <span className="text-sm">{avatar}</span>
                              <span className="text-xs font-bold flex-1" style={{ color }}>
                                {identity?.displayName ?? player.id}
                              </span>
                              {hideActive ? (
                                <span className="text-xs text-muted text-right">
                                  Soumis {formatSubmittedDate(pred.submittedAt)} ·{' '}
                                  {penalties.filter(p => p.playerId === player.id && p.raceId === race.id && p.type === 'change').length} modif.
                                </span>
                              ) : (
                                <span className="text-xs text-muted">
                                  {pred.prediction?.P1} · {pred.prediction?.P2} · {pred.prediction?.P3}
                                </span>
                              )}
                              <button
                                onClick={() => toggleManualUnlock(pred)}
                                title={pred.manualUnlockOverride
                                  ? 'Déverrouillage exceptionnel actif — cliquer pour revenir au verrouillage normal'
                                  : 'Verrouillage normal — cliquer pour activer le déverrouillage exceptionnel'}
                                className={`text-xs px-2 py-1 rounded font-bold ml-1 ${
                                  pred.manualUnlockOverride ? 'bg-green-500/20 text-green-400' : 'bg-surfaceHigh text-muted'
                                }`}
                              >
                                {pred.manualUnlockOverride ? '🔓' : '🔒'}
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

          {tab === 'penalties' && (
            <div className="space-y-3">
              <button
                onClick={() => setPenaltySheetOpen(true)}
                className="w-full btn-primary text-center"
              >
                + Ajouter une pénalité
              </button>
              {players.length === 0 ? (
                <div className="text-center py-10 text-muted">
                  <span className="text-4xl block mb-3">✅</span>
                  <p className="font-bold">Aucune pénalité</p>
                </div>
              ) : (
                players.map(player => {
                  const identity = getProfile(profiles, player)
                  const avatar = String(identity?.avatar ?? '🏎️')
                  const displayName = String(identity?.displayName ?? player.id)
                  const playerPenalties = penalties.filter(p => p.playerId === player.id)
                  const count = playerPenalties.length
                  const total = playerPenalties.reduce((sum, p) => sum + getPenaltyAmount(p), 0)
                  const hasPenalties = count > 0
                  const isExpanded = expandedPenaltyPlayer === player.id

                  return (
                    <div key={player.id} className="card overflow-hidden">
                      <button
                        onClick={() => hasPenalties && setExpandedPenaltyPlayer(isExpanded ? null : player.id)}
                        disabled={!hasPenalties}
                        className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                          hasPenalties ? 'hover:bg-surfaceHigh/50' : 'opacity-50 cursor-default'
                        }`}
                      >
                        <span>{avatar}</span>
                        <div className="flex-1">
                          <p className="font-bold text-sm">{displayName}</p>
                          <p className="text-xs text-muted">
                            {count} pénalité{count > 1 ? 's' : ''} · {total > 0 ? `-${total}` : '0'} pt{total > 1 ? 's' : ''}
                          </p>
                        </div>
                        {hasPenalties && (
                          <ChevronDown
                            size={16}
                            className={`text-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        )}
                      </button>

                      {isExpanded && hasPenalties && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                          {playerPenalties.map(pen => {
                            const race = races.find(r => r.id === pen.raceId)
                            const createdAtLabel = formatPenaltyDate(pen.createdAt)
                            return (
                              <div key={pen._id} className="flex items-center gap-3 pt-2">
                                <p className="text-xs text-muted flex-1">
                                  GP {race?.name ?? pen.raceId} · {pen.type === 'late' ? 'Tardif' : 'Modification'}
                                  {createdAtLabel && ` · ${createdAtLabel}`}
                                </p>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  pen.type === 'late' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                                }`}>
                                  -{getPenaltyAmount(pen)}
                                </span>
                                <button
                                  onClick={() => setDeletePenaltyTarget(pen._id)}
                                  className="text-muted text-sm p-1 hover:text-white transition-colors"
                                >
                                  🗑️
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* ── ZONE DANGEREUSE ── */}
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'rgba(127,0,0,0.12)', borderColor: 'rgba(200,0,0,0.25)' }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-red-400">⚠️ Zone Dangereuse</p>

          <button
            onClick={() => setLeaveSheetOpen(true)}
            disabled={isSoleAdmin}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              isSoleAdmin
                ? 'border-border bg-surfaceHigh/30 opacity-50 cursor-not-allowed'
                : 'border-red-700/30 bg-red-900/20 active:opacity-70'
            }`}
          >
            <LogOut size={20} className="text-red-400 shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-400">Quitter la ligue</p>
              <p className="text-xs text-muted">
                {isSoleAdmin ? "Tu es l'unique administrateur, tu ne peux pas quitter" : 'Ton historique reste visible'}
              </p>
            </div>
          </button>

          {isLeagueAdmin && (
            <button
              onClick={() => setDeleteSheetOpen(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-700/30 bg-red-900/20 active:opacity-70 text-left"
            >
              <Trash2 size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="font-bold text-sm text-red-400">Supprimer la ligue</p>
                <p className="text-xs text-muted">Supprime tout — irréversible</p>
              </div>
            </button>
          )}
        </div>
      </div>

      <BottomSheet isOpen={!!removeTarget} onClose={closeRemoveSheet} title="Retirer ce joueur ?">
        <div className="p-5 pb-10 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Retirer{' '}
            <strong className="text-white">
              {String(getProfile(profiles, removeTarget)?.displayName ?? removeTarget?.id)}
            </strong>{' '}
            de la ligue ? Son historique de pronostics restera visible dans le classement, mais il ne
            pourra plus participer tant qu'il n'aura pas rejoint à nouveau avec le code.
          </p>
          {removeError && (
            <p className="text-accent text-xs font-bold">{removeError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={closeRemoveSheet}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
            >
              Annuler
            </button>
            <button
              onClick={handleRemoveConfirm}
              disabled={removing}
              className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
                removing ? 'bg-surfaceHigh text-muted cursor-not-allowed' : 'bg-red-600'
              }`}
            >
              {removing ? 'Retrait…' : 'Retirer'}
            </button>
          </div>
        </div>
      </BottomSheet>

      <LeaveLeagueSheet
        isOpen={leaveSheetOpen}
        onClose={() => setLeaveSheetOpen(false)}
        profileId={myActiveProfile?._id}
        isSoleAdmin={isSoleAdmin}
        onLeft={handleLeagueLeft}
      />

      <DeleteLeagueSheet
        isOpen={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        league={league}
        onDeleted={handleLeagueDeleted}
        addToast={addToast}
      />

      <ConfirmModal
        isOpen={!!deletePenaltyTarget}
        title="Supprimer cette pénalité ?"
        message="Cette pénalité sera définitivement supprimée."
        confirmLabel="Supprimer"
        danger
        onConfirm={confirmRemovePenalty}
        onCancel={() => setDeletePenaltyTarget(null)}
      />

      <BottomSheet
        isOpen={penaltySheetOpen}
        onClose={() => setPenaltySheetOpen(false)}
        title="Ajouter une pénalité"
      >
        <div className="p-5 pb-10 space-y-4">
          <div>
            <p className="section-title">Joueur</p>
            <div className="grid grid-cols-2 gap-2">
              {players.map(player => {
                const identity = getProfile(profiles, player)
                const avatar = String(identity?.avatar ?? '🏎️')
                return (
                  <button
                    key={player.id}
                    onClick={() => setPenaltyPlayerId(player.id)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      penaltyPlayerId === player.id ? 'border-accent bg-accent/20' : 'border-border'
                    }`}
                  >
                    <span className="text-xl">{avatar}</span>
                    <p className="font-bold text-sm mt-1">{identity?.displayName ?? player.id}</p>
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
                <p className="text-accent font-black">-{league?.rules?.postQualifsPenalty?.amount ?? 10} pts</p>
                {league?.rules?.postQualifsPenalty?.enabled === false && (
                  <p className="text-[10px] text-muted mt-0.5">Désactivée dans les règles</p>
                )}
              </button>
              <button
                onClick={() => setPenaltyType('change')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  penaltyType === 'change' ? 'border-accent bg-accent/20' : 'border-border'
                }`}
              >
                <p className="font-bold text-sm">Modification</p>
                <p className="text-accent font-black">-{league?.rules?.modificationPenalty?.amount ?? 5} pts</p>
                {league?.rules?.modificationPenalty?.enabled === false && (
                  <p className="text-[10px] text-muted mt-0.5">Désactivée dans les règles</p>
                )}
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
