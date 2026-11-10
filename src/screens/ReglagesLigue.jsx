import { useState, useEffect, useMemo } from 'react'
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { db } from '../firebase'
import { useCollection, useDocument, where, upsertDoc, deleteDocument } from '../hooks/useFirestore'
import DeleteLeagueSheet from '../components/DeleteLeagueSheet'
import Skeleton from '../components/Skeleton'
import ReglagesHub from '../components/reglages/ReglagesHub'
import ReglagesJoueurs from '../components/reglages/ReglagesJoueurs'
import ReglagesRegles from '../components/reglages/ReglagesRegles'
import ReglagesSuivi from '../components/reglages/ReglagesSuivi'

export default function ReglagesLigue({ leagueId, activeLeagueId, onClearActiveLeague, setActiveTab, addToast }) {
  const { user } = useAuth()
  const { data: league, loading: leagueLoading } = useDocument(user ? 'leagues' : null, leagueId)

  const leagueConstraint = useMemo(() => [where('leagueId', '==', leagueId)], [leagueId])
  const { data: players, loading: playersLoading } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: predictions } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races } = useCollection(user ? 'races' : null)
  const { data: drivers } = useCollection(user ? 'drivers' : null)

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
  // Départ du Suivi des GP : GP et filtre demandés (liens du bloc « Prochain GP »), sinon le dernier GP couru
  const lastPlayedRace = useMemo(() => [...sortedRaces].reverse().find(r => r.status === 'completed') ?? null, [sortedRaces])
  const trackedRaces = useMemo(() => sortedRaces.filter(r => r.status !== 'cancelled'), [sortedRaces])
  const [suiviStart, setSuiviStart] = useState({ raceId: null, filter: 'all', n: 0 })
  const openView = (next, opts = {}) => {
    if (next === 'suivi') {
      setSuiviStart(prev => ({
        raceId: opts.raceId ?? lastPlayedRace?.id ?? nextRace?.id ?? trackedRaces[0]?.id ?? null,
        filter: opts.filter ?? 'all',
        n: prev.n + 1, // nouvelle clé : l'écran repart du GP et du filtre demandés
      }))
    }
    setView(next)
    window.scrollTo?.(0, 0)
  }

  const isLeagueAdmin = Array.isArray(league?.adminUids) && league.adminUids.includes(user?.uid)
  const isSoleAdmin = isLeagueAdmin && league.adminUids.length === 1
  const myActiveProfile = myProfiles.find(p => p.leagueId === leagueId && p.active !== false)

  // ── Pénalités à la main : ajout et retrait (depuis la fiche d'un joueur, dans Suivi des GP) ──
  // Le déverrouillage exceptionnel d'un pronostic (cadenas) n'existe plus dans l'interface (décision du
  // 9 nov. 2026). Les deux fonctions renvoient { ok, error } : la fiche affiche l'erreur et reste ouverte.
  const addPenalty = async ({ player, race, type, motif }) => {
    // Défense en profondeur : les règles Firestore refusent déjà tout non-admin ; on échoue vite côté interface.
    if (!isLeagueAdmin) return { ok: false, error: 'Réservé aux administrateurs de la ligue.' }
    const id = `pen_${type}_${player.id}_${race.id}_${Date.now()}`
    // On fige le montant des règles du moment : la pénalité garde ses points même si la règle change ensuite.
    const rule = type === 'late' ? league?.rules?.postQualifsPenalty : league?.rules?.modificationPenalty
    const fallback = type === 'late' ? 10 : 5
    const amount = typeof rule?.amount === 'number' && rule.amount > 0 ? rule.amount : fallback
    try {
      await upsertDoc('penalties', id, {
        playerId: player.id, raceId: race.id, type, leagueId, amount,
        createdAt: new Date(),
        addedBy: user?.uid ?? null,
        ...(motif ? { motif } : {}),
      })
      addToast?.('Pénalité ajoutée', 'warning')
      return { ok: true }
    } catch {
      return { ok: false, error: "Erreur lors de l'ajout de la pénalité. Réessaie." }
    }
  }

  const removePenalty = async (pen) => {
    if (!isLeagueAdmin) return { ok: false, error: 'Réservé aux administrateurs de la ligue.' }
    try {
      await deleteDocument('penalties', pen._id)
      addToast?.('Pénalité retirée', 'info')
      return { ok: true }
    } catch {
      return { ok: false, error: 'Erreur lors du retrait de la pénalité. Réessaie.' }
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
        <ReglagesSuivi
          key={suiviStart.n}
          league={league}
          players={players}
          predictions={predictions}
          penalties={penalties}
          profiles={profiles}
          races={trackedRaces}
          drivers={drivers}
          initialRaceId={suiviStart.raceId}
          initialFilter={suiviStart.filter}
          onBack={() => setView('hub')}
          canManage={isLeagueAdmin}
          onAddPenalty={addPenalty}
          onRemovePenalty={removePenalty}
        />
      )}

      <DeleteLeagueSheet
        isOpen={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        league={league}
        onDeleted={handleLeagueDeleted}
        addToast={addToast}
        counts={{
          players: players.filter(p => p.active !== false).length,
          races: new Set(predictions.map(p => p.raceId)).size,
          penalties: penalties.length,
        }}
      />
    </div>
  )
}
