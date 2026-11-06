import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from './hooks/useAuth'
import { useCollection, useDocument } from './hooks/useFirestore'
import BottomNav from './components/BottomNav'
import { ToastContainer } from './components/Toast'
import Login from './screens/Login'
import ProfilSetup from './screens/ProfilSetup'
import Accueil from './screens/Accueil'
import Courses from './screens/Courses'
import Classement from './screens/Classement'
import Stats from './screens/Stats'
import MesLigues from './screens/MesLigues'
import MonProfil from './screens/MonProfil'
import CreerLigue from './screens/CreerLigue'
import RejoindreLigue from './screens/RejoindreLigue'
import ReglagesLigue from './screens/ReglagesLigue'
import ReglagesSuperAdmin from './screens/ReglagesSuperAdmin'
import ReglesDuJeu from './screens/ReglesDuJeu'
import Intro from './screens/Intro'

let _toastId = 0
const ACTIVE_LEAGUE_STORAGE_KEY = 'prono_f1_active_league_id'

export default function App() {
  const { user, authLoading } = useAuth()
  const { data: identity, loading: identityLoading } = useDocument('profiles', user?.uid ?? null)
  const { data: players, loading: playersLoading } = useCollection(user ? 'players' : null)
  const { data: leagues } = useCollection(user ? 'leagues' : null)
  const [activeTab, setActiveTab] = useState('accueil')
  const [selectedLeagueId, setSelectedLeagueId] = useState(null)
  const [toasts, setToasts] = useState([])
  // Intro de bienvenue : demandée par ProfilSetup juste avant la création du profil,
  // jamais persistée (un compte déjà créé ne la voit pas). Remise à zéro si le
  // compte connecté change, pour ne pas la montrer au compte suivant.
  const [showIntro, setShowIntro] = useState(false)

  const [activeLeagueId, setActiveLeagueIdState] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_LEAGUE_STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Set while a league selection is awaiting confirmation from the players
  // listener (e.g. right after joining/creating a league), so the sync
  // effects below don't clobber it with stale data. Cleared once the new
  // membership shows up in myPlayers, or after a 5s safety timeout.
  const [pendingActiveLeagueId, setPendingActiveLeagueId] = useState(null)

  const persistActiveLeagueId = (leagueId) => {
    setActiveLeagueIdState(leagueId)
    try {
      if (leagueId) localStorage.setItem(ACTIVE_LEAGUE_STORAGE_KEY, leagueId)
      else localStorage.removeItem(ACTIVE_LEAGUE_STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  // active !== false so existing docs without the field (pre-dating this
  // feature) default to active — only an explicit active: false (left league)
  // excludes a membership from the current set.
  const myPlayers = players.filter(p => p.authUid === user?.uid && p.active !== false)

  // Resolve the actual active player doc: the stored league if the user is
  // still a member of it, otherwise fall back to the first membership found.
  const activePlayer = myPlayers.find(p => p.leagueId === activeLeagueId) ?? myPlayers[0] ?? null
  const effectiveActiveLeagueId = activePlayer?.leagueId ?? null

  // Keep the persisted choice in sync with what's actually being used —
  // but don't clobber a selection that's still pending confirmation from
  // the players listener (see pendingActiveLeagueId above).
  useEffect(() => {
    if (!user) return
    if (playersLoading) return
    if (pendingActiveLeagueId && pendingActiveLeagueId === activeLeagueId) return
    if (effectiveActiveLeagueId !== activeLeagueId) {
      persistActiveLeagueId(effectiveActiveLeagueId)
    }
  }, [user, playersLoading, effectiveActiveLeagueId, activeLeagueId, pendingActiveLeagueId])

  // A user with no league membership at all lands on Mes Ligues, not Accueil —
  // unless a league selection just got triggered and is still pending, in
  // which case we don't want to cancel the navigation to Accueil it just made.
  // A membership count of 0 is only acted on after a short stabilization
  // delay, since myPlayers can transiently read 0 right after the players
  // listener re-subscribes (e.g. right after a manual league selection) —
  // acting on that instantly would undo the very navigation it just made.
  useEffect(() => {
    if (pendingActiveLeagueId) return
    if (playersLoading) return
    if (activeTab !== 'accueil') return
    if (myPlayers.length > 0) return

    const timeout = setTimeout(() => {
      setActiveTab('leagues')
    }, 400)
    return () => clearTimeout(timeout)
  }, [playersLoading, myPlayers.length, activeTab, pendingActiveLeagueId])

  // Clear the pending flag once the new membership actually shows up
  const pendingConfirmed = pendingActiveLeagueId != null && myPlayers.some(p => p.leagueId === pendingActiveLeagueId)
  useEffect(() => {
    if (pendingConfirmed) setPendingActiveLeagueId(null)
  }, [pendingConfirmed])

  // Safety net: never stay "pending" forever if something actually failed
  useEffect(() => {
    if (!pendingActiveLeagueId) return
    const timeout = setTimeout(() => setPendingActiveLeagueId(null), 5000)
    return () => clearTimeout(timeout)
  }, [pendingActiveLeagueId])

  // Un changement de compte connecté annule toute intro encore demandée.
  useEffect(() => {
    setShowIntro(false)
  }, [user?.uid])

  // Reset the "initial landing tab" flag whenever the signed-in user changes
  // (fresh login, or logout → login again), so the one-time redirect below
  // fires again for the new connexion.
  const initialTabSetRef = useRef(false)
  const lastSignedInUidRef = useRef(undefined)
  useEffect(() => {
    if (user?.uid !== lastSignedInUidRef.current) {
      lastSignedInUidRef.current = user?.uid ?? null
      initialTabSetRef.current = false
    }
  }, [user?.uid])

  // Right after a fresh connexion, land on Accueil (has a league) or Mes
  // Ligues (doesn't yet) — exactly once per connexion, regardless of the
  // current activeTab, so it never fights a later manual navigation (e.g.
  // to Mon Profil) once the app has settled for this session.
  // A positive membership count is acted on immediately (no risk of false
  // positive there). A zero count is only trusted after a short
  // stabilization delay, since myPlayers can transiently read 0 right after
  // playersLoading flips to false, before the listener has fully caught up.
  useEffect(() => {
    if (!user || playersLoading || initialTabSetRef.current) return

    if (myPlayers.length > 0) {
      initialTabSetRef.current = true
      setActiveTab('accueil')
      return
    }

    const timeout = setTimeout(() => {
      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true
        setActiveTab('leagues')
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [user, playersLoading, myPlayers.length])

  const selectActiveLeague = useCallback((leagueId) => {
    persistActiveLeagueId(leagueId)
    setPendingActiveLeagueId(leagueId)
    setActiveTab('accueil')
  }, [])

  // Same as selectActiveLeague but without the redirect to Accueil — used
  // when picking a league from within Mes Ligues itself, where the user
  // should stay put and just see the "Active" badge move.
  const activateLeague = useCallback((leagueId) => {
    persistActiveLeagueId(leagueId)
    setPendingActiveLeagueId(leagueId)
  }, [])

  // Explicitly clears the persisted active league (e.g. right after leaving
  // it with no other league to fall back on), without waiting on the
  // App-level stabilization effects.
  const clearActiveLeague = useCallback(() => {
    persistActiveLeagueId(null)
  }, [])

  const openLeagueSettings = useCallback((leagueId) => {
    setSelectedLeagueId(leagueId)
    setActiveTab('reglages-ligue')
  }, [])

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (authLoading) {
    return <div className="min-h-[100dvh] bg-bg" />
  }

  if (!user) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <Login />
      </>
    )
  }

  if (identityLoading) {
    return <div className="min-h-[100dvh] bg-bg" />
  }

  if (!identity) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <ProfilSetup user={user} onSaveStart={() => setShowIntro(true)} onSaveError={() => setShowIntro(false)} />
      </>
    )
  }

  if (showIntro) {
    return <Intro onDone={() => setShowIntro(false)} />
  }

  if (playersLoading) {
    return <div className="min-h-[100dvh] bg-bg" />
  }

  const playerId = activePlayer?.id ?? null
  const activeLeagueName = leagues.find(l => l._id === effectiveActiveLeagueId)?.name ?? null
  // Ligues du joueur (appartenance active), pour le menu de changement de ligue
  // de l'en-tête. Triées par nom pour un ordre stable.
  const leagueOptions = myPlayers
    .map(p => leagues.find(l => l._id === p.leagueId))
    .filter(Boolean)
    .map(l => ({ id: l._id, name: String(l.name ?? ''), rules: l.rules ?? {} }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const hasAnyLeague = myPlayers.length > 0
  const leaguesScreen = (
    <MesLigues
      setActiveTab={setActiveTab}
      onOpenLeagueSettings={openLeagueSettings}
      activeLeagueId={effectiveActiveLeagueId}
      onSelectLeague={selectActiveLeague}
      onActivateLeague={activateLeague}
      onClearActiveLeague={clearActiveLeague}
      addToast={addToast}
    />
  )

  // key = ligue active : à chaque changement de ligue (menu de l'en-tête) l'écran
  // est recréé, ce qui relance ses lectures Firestore sur la nouvelle ligue
  // (useCollection ne se réabonne pas quand ses contraintes changent).
  const renderScreen = () => {
    switch (activeTab) {
      case 'accueil':
        return hasAnyLeague
          ? <Accueil key={effectiveActiveLeagueId} leagueOptions={leagueOptions} onSwitchLeague={activateLeague} currentPlayerId={playerId} setActiveTab={setActiveTab} activeLeagueName={activeLeagueName} activeLeagueId={effectiveActiveLeagueId} addToast={addToast} />
          : leaguesScreen
      case 'courses':
        return hasAnyLeague
          ? <Courses key={effectiveActiveLeagueId} leagueOptions={leagueOptions} onSwitchLeague={activateLeague} currentPlayerId={playerId} addToast={addToast} activeLeagueName={activeLeagueName} activeLeagueId={effectiveActiveLeagueId} setActiveTab={setActiveTab} />
          : leaguesScreen
      case 'classement':
        return hasAnyLeague
          ? <Classement key={effectiveActiveLeagueId} leagueOptions={leagueOptions} onSwitchLeague={activateLeague} currentPlayerId={playerId} activeLeagueName={activeLeagueName} activeLeagueId={effectiveActiveLeagueId} setActiveTab={setActiveTab} addToast={addToast} />
          : leaguesScreen
      case 'stats':
        return hasAnyLeague
          ? <Stats key={effectiveActiveLeagueId} leagueOptions={leagueOptions} onSwitchLeague={activateLeague} currentPlayerId={playerId} activeLeagueName={activeLeagueName} activeLeagueId={effectiveActiveLeagueId} setActiveTab={setActiveTab} />
          : leaguesScreen
      case 'leagues':
        return leaguesScreen
      case 'creer-ligue':
        return <CreerLigue user={user} setActiveTab={setActiveTab} onSelectLeague={selectActiveLeague} />
      case 'rejoindre-ligue':
        return <RejoindreLigue user={user} setActiveTab={setActiveTab} onSelectLeague={selectActiveLeague} />
      case 'monprofil':
        return <MonProfil addToast={addToast} setActiveTab={setActiveTab} />
      case 'reglages-ligue':
        return (
          <ReglagesLigue
            leagueId={selectedLeagueId}
            activeLeagueId={effectiveActiveLeagueId}
            onSelectLeague={selectActiveLeague}
            onClearActiveLeague={clearActiveLeague}
            setActiveTab={setActiveTab}
            addToast={addToast}
          />
        )
      case 'reglages-du-jeu':
        return <ReglesDuJeu leagues={leagueOptions} activeLeagueId={effectiveActiveLeagueId} />
      case 'admin':
        return <ReglagesSuperAdmin addToast={addToast} />
      default:
        return hasAnyLeague
          ? <Accueil key={effectiveActiveLeagueId} leagueOptions={leagueOptions} onSwitchLeague={activateLeague} currentPlayerId={playerId} setActiveTab={setActiveTab} activeLeagueName={activeLeagueName} activeLeagueId={effectiveActiveLeagueId} addToast={addToast} />
          : leaguesScreen
    }
  }

  return (
    <div className="bg-bg">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className="safe-top" id="app-main" style={{ paddingBottom: '100px' }}>
        {renderScreen()}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} hasLeague={hasAnyLeague} />
    </div>
  )
}
