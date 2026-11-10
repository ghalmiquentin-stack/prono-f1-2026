import { useState, useEffect, useMemo } from 'react'
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { db } from '../firebase'
import { useCollection, useDocument, where, upsertDoc, deleteDocument } from '../hooks/useFirestore'
import { getProfile } from '../utils/profiles'
import { hasRaceStarted } from '../utils/races'
import { getPenaltyAmount, summarizePenalties } from '../utils/penalties'
import BottomSheet from '../components/BottomSheet'
import DeleteLeagueSheet from '../components/DeleteLeagueSheet'
import ConfirmModal from '../components/ConfirmModal'
import Skeleton from '../components/Skeleton'
import ReglagesHub from '../components/reglages/ReglagesHub'
import ReglagesJoueurs from '../components/reglages/ReglagesJoueurs'
import ReglagesRegles from '../components/reglages/ReglagesRegles'

function formatSubmittedDate(ts) {
  if (!ts) return '—'
  const date = ts?.toDate?.() ?? new Date(ts)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Same "Xh_MM" time formatting convention as "Soumis le…" on the Accueil
// card (see formatPredTime there), applied to a single short date+time —
// no dual-timezone flags here, this is for the compact admin penalty row.
// Returns null (not '—') when absent, so the caller can omit it entirely.
// No explicit timeZone on either part — resolves to the viewer's own
// browser timezone, same as the date part right next to it.
function formatPenaltyDate(ts) {
  if (!ts) return null
  const date = ts?.toDate?.() ?? new Date(ts)
  const datePart = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${datePart}, ${h}h${m}`
}

// Heure serveur de l'événement pénalisé (pénalités automatiques, champ
// eventTime), même format jour + heure à la minute que formatPenaltyDate.
// Retourne null si le champ est absent ou illisible : l'appelant retombe alors
// sur l'affichage habituel (createdAt) au lieu de faire planter l'écran.
function formatServerEventTime(ts) {
  if (!ts) return null
  try {
    const date = ts?.toDate?.() ?? new Date(ts)
    if (Number.isNaN(date.getTime())) return null
    return formatPenaltyDate(date)
  } catch {
    return null
  }
}

export default function ReglagesLigue({ leagueId, activeLeagueId, onClearActiveLeague, setActiveTab, addToast }) {
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
  // Prochain GP : le premier « à venir », comme l'Accueil et Mes ligues.
  const nextRace = useMemo(() => sortedRaces.find(r => r.status === 'upcoming') ?? null, [sortedRaces])

  // Écran affiché : l'entrée (hub) ou un sous-écran. Pas d'adresse propre (l'app navigue par onglets).
  const [view, setView] = useState('hub') // 'hub' | 'suivi' | 'joueurs' | 'regles'
  useEffect(() => { setView('hub') }, [leagueId])
  const openView = (next, opts = {}) => {
    if (opts.tab) setTab(opts.tab)
    setView(next)
    window.scrollTo?.(0, 0)
  }

  const isLeagueAdmin = Array.isArray(league?.adminUids) && league.adminUids.includes(user?.uid)
  const isSoleAdmin = isLeagueAdmin && league.adminUids.length === 1
  const myActiveProfile = myProfiles.find(p => p.leagueId === leagueId && p.active !== false)

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
    // Defense in depth — this action is only ever reachable today because
    // MesLigues.jsx gates navigation to this screen to league admins, but
    // that's a navigation-level guard, not a per-action one. Firestore rules
    // also enforce isLeagueAdmin server-side; this just fails fast in the UI.
    if (!isLeagueAdmin) {
      addToast?.('Réservé aux administrateurs de la ligue', 'error')
      return
    }
    try {
      // `_id` is a client-only artifact injected by useCollection ({ _id:
      // d.id, ...d.data() }) — never a real Firestore field. Strip it before
      // spreading, so it never gets written back into the document.
      const { _id, ...predFields } = pred
      await upsertDoc('predictions', pred._id, { ...predFields, manualUnlockOverride: !pred.manualUnlockOverride })
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
    // Defense in depth — see toggleManualUnlock's comment above.
    if (!isLeagueAdmin) {
      addToast?.('Réservé aux administrateurs de la ligue', 'error')
      return
    }
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
    // Defense in depth — see toggleManualUnlock's comment above.
    if (!isLeagueAdmin) {
      addToast?.('Réservé aux administrateurs de la ligue', 'error')
      setDeletePenaltyTarget(null)
      return
    }
    try {
      await deleteDocument('penalties', deletePenaltyTarget)
      addToast?.('Pénalité supprimée', 'info')
    } catch {
      addToast?.('Erreur', 'error')
    } finally {
      setDeletePenaltyTarget(null)
    }
  }

  // ── Retirer / bannir / réintégrer ────────────────────────────────────────
  // Mêmes écritures qu'avant ; l'écran Joueurs (ReglagesJoueurs) gère les feuilles de
  // confirmation et lit le résultat { ok, error } pour afficher l'erreur dans la feuille.
  const removePlayer = async (player) => {
    try {
      // Same mechanism as "Quitter la ligue" — active: false. If this was
      // the player's active league, the existing App.jsx effects switch
      // them off it the next time they open the app, no extra handling here.
      await upsertDoc('players', player._id, { active: false })
      addToast?.('Joueur retiré de la ligue', 'info')
      return { ok: true }
    } catch {
      return { ok: false, error: 'Erreur lors du retrait du joueur. Réessaie.' }
    }
  }

  // Si le joueur banni est lui-même admin, on doit aussi le retirer de
  // adminUids dans la MÊME opération — sinon il resterait capable de
  // s'auto-réintégrer via le chemin admin (isLeagueAdmin() sur players,
  // qui autorise déjà l'écriture de n'importe quel champ et qu'on ne peut
  // pas restreindre "sauf sur soi-même" sans casser la gestion légitime de
  // son propre profil). On utilise un writeBatch plutôt que deux upsertDoc
  // séquentiels : Firestore garantit qu'un batch est tout-ou-rien, donc
  // aucun état intermédiaire (banni mais encore admin) n'est jamais commis.
  const banPlayer = async (player) => {
    const wasAdmin = !!player.authUid
      && Array.isArray(league?.adminUids)
      && league.adminUids.includes(player.authUid)
    try {
      const batch = writeBatch(db)
      batch.set(
        doc(db, 'players', player._id),
        { active: false, banned: true, updatedAt: serverTimestamp() },
        { merge: true }
      )
      if (wasAdmin) {
        batch.set(
          doc(db, 'leagues', leagueId),
          { adminUids: league.adminUids.filter(uid => uid !== player.authUid), updatedAt: serverTimestamp() },
          { merge: true }
        )
      }
      await batch.commit()
      addToast?.(wasAdmin ? 'Joueur banni et retiré des administrateurs' : 'Joueur banni', 'info')
      return { ok: true }
    } catch {
      return { ok: false, error: 'Erreur lors du bannissement : aucune modification appliquée. Réessaie.' }
    }
  }

  const reinstatePlayer = async (player) => {
    try {
      await upsertDoc('players', player._id, { banned: false })
      addToast?.('Joueur réintégré', 'info')
    } catch {
      addToast?.('Erreur lors de la réintégration. Réessayez.', 'error')
    }
  }

  // ── Co-administration (nommer / démettre) ────────────────────────────────
  // Même mécanisme que "Retirer" : upsertDoc directement sur le document
  // concerné (ici leagues/{leagueId}, champ adminUids). La règle Firestore
  // interdit déjà l'auto-démotion et la suppression du dernier admin ; le
  // catch ci-dessous ne sert qu'à prévenir plutôt que d'échouer en silence
  // si jamais le bouton était affiché dans un état incohérent.
  const promoteToAdmin = async (player) => {
    if (!league || !player?.authUid) return
    try {
      await upsertDoc('leagues', leagueId, { adminUids: [...league.adminUids, player.authUid] })
      addToast?.('Co-administrateur nommé', 'info')
    } catch {
      addToast?.('Erreur lors de la nomination. Réessayez.', 'error')
    }
  }

  const demoteAdmin = async (player) => {
    if (!league || !player?.authUid) return
    try {
      await upsertDoc('leagues', leagueId, {
        adminUids: league.adminUids.filter(uid => uid !== player.authUid),
      })
      addToast?.('Administrateur démis', 'info')
    } catch {
      addToast?.("Erreur : impossible de démettre cet administrateur.", 'error')
    }
  }

  // ── Supprimer la ligue ───────────────────────────────────────────────────
  // (« Quitter la ligue » et le code d'invitation vivent sur Mes ligues : plus ici.)
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)

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

  const subHead = (title, sub) => (
    <div className="px-5 pt-4 pb-3">
      <button onClick={() => setView('hub')} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
        <ChevronLeft size={18} />Réglages
      </button>
      <h1 className="text-2xl font-black tracking-tight leading-tight">{title}</h1>
      {sub && <p className="text-sm text-muted mt-0.5 break-words">{sub}</p>}
    </div>
  )

  return (
    <div className="pb-4">
      {view === 'hub' && (
        <ReglagesHub
          league={league}
          players={players}
          predictions={predictions}
          penalties={penalties}
          profiles={profiles}
          nextRace={nextRace}
          onBack={() => setActiveTab?.('leagues')}
          onOpen={openView}
          onDelete={() => setDeleteSheetOpen(true)}
          canDelete={isLeagueAdmin}
        />
      )}

      {view === 'regles' && (
        <ReglagesRegles
          key={leagueId}
          league={league}
          leagueId={leagueId}
          isLeagueAdmin={isLeagueAdmin}
          onBack={() => setView('hub')}
          addToast={addToast}
        />
      )}

      {view === 'joueurs' && (
        <ReglagesJoueurs
          league={league}
          players={players}
          profiles={profiles}
          myPlayerId={myActiveProfile?._id}
          isLeagueAdmin={isLeagueAdmin}
          isSoleAdmin={isSoleAdmin}
          onBack={() => setView('hub')}
          onPromote={promoteToAdmin}
          onDemote={demoteAdmin}
          onRemove={removePlayer}
          onBan={banPlayer}
          onReinstate={reinstatePlayer}
        />
      )}

      {view === 'suivi' && (
        <>
          {subHead('Suivi des GP')}
          <div className="px-5 space-y-5">
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
                              race.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                              race.status === 'completed' ? 'bg-muted/20 text-muted' : 'bg-accent/20 text-accent'
                            }`}>
                              {race.status === 'cancelled' ? 'Annulé' : race.status === 'completed' ? 'Terminé' : 'À venir'}
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
                              const penaltySummary = summarizePenalties(penalties, player.id, race.id)
                              return (
                                <div key={player.id} className="flex items-center gap-2 py-1">
                                  <span className="text-sm">{avatar}</span>
                                  <span className="text-xs font-bold flex-1" style={{ color }}>
                                    {identity?.displayName ?? player.id}
                                  </span>
                                  {hideActive ? (
                                    <span className="text-xs text-muted text-right">
                                      Soumis {formatSubmittedDate(pred.submittedAt)}
                                      {penaltySummary.label ? <> · {penaltySummary.label}</> : null}
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
                                const isAuto = pen.source === 'auto'
                                const serverTimeLabel = isAuto ? formatServerEventTime(pen.eventTime) : null
                                const createdAtLabel = serverTimeLabel ? null : formatPenaltyDate(pen.createdAt)
                                return (
                                  <div key={pen._id} className="flex items-center gap-3 pt-2">
                                    <p className="text-xs text-muted flex-1">
                                      GP {race?.name ?? pen.raceId} · {pen.type === 'late' ? 'Tardif' : 'Modification'}
                                      {isAuto && (
                                        <span className="ml-1.5 text-[9px] font-bold tracking-wide bg-muted/20 text-muted px-1.5 py-0.5 rounded-full">
                                          auto
                                        </span>
                                      )}
                                      {serverTimeLabel && ` · ${serverTimeLabel}`}
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
          </div>
        </>
      )}

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
