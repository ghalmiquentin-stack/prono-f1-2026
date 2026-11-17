import { useState } from 'react'
import { Users } from 'lucide-react'
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { upsertDoc } from '../hooks/useFirestore'
import FlowLayout, { FlowButton } from '../components/FlowLayout'
import LeagueRulesSummary from '../components/LeagueRulesSummary'
import ReglesLink from '../components/ReglesLink'

const STEP_COUNT = 2
const SECTION = 'text-xs font-black uppercase tracking-widest text-white'

export default function RejoindreLigue({ user, setActiveTab, onSelectLeague }) {
  const [step, setStep] = useState(1)

  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [foundLeague, setFoundLeague] = useState(null)
  const [leaguePlayers, setLeaguePlayers] = useState([])

  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const goBack = () => {
    setStep(1)
    setFoundLeague(null)
    setLeaguePlayers([])
    setJoinError('')
  }

  const handleSearch = async () => {
    if (!code.trim() || searching) return
    setSearching(true)
    setSearchError('')
    try {
      const codeUpper = code.trim().toUpperCase()
      const leaguesSnap = await getDocs(query(collection(db, 'leagues'), where('code', '==', codeUpper)))

      if (leaguesSnap.empty) {
        setSearchError('Aucune ligue ne correspond à ce code.')
        return
      }

      const leagueDoc = leaguesSnap.docs[0]
      const league = { _id: leagueDoc.id, ...leagueDoc.data() }

      const playersSnap = await getDocs(query(collection(db, 'players'), where('leagueId', '==', league._id)))
      const players = playersSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

      setFoundLeague(league)
      setLeaguePlayers(players)
      setStep(2)
    } catch (err) {
      setSearchError('Erreur lors de la recherche. Réessaie.')
    } finally {
      setSearching(false)
    }
  }

  // Capacity only counts current active members — a departed member (active: false)
  // frees up a slot.
  const activeLeaguePlayers = leaguePlayers.filter(p => p.active !== false)
  const playerCount = activeLeaguePlayers.length
  const isFull = foundLeague ? playerCount >= foundLeague.maxPlayers : false

  // A players doc for this (authUid, leagueId) pair may already exist, either
  // still active (already a member) or left behind inactive (rejoined later
  // should restore it, not create a duplicate).
  const existingMembership = leaguePlayers.find(p => p.authUid === user?.uid)
  const isActiveMember = !!existingMembership && existingMembership.active !== false
  const isInactiveMember = !!existingMembership && existingMembership.active === false
  // Un joueur banni ne peut pas se réactiver lui-même (firestore.rules) : on le dit avant le bouton
  // au lieu de le laisser échouer sur une erreur générique.
  const isBanned = isInactiveMember && existingMembership.banned === true

  const handleAccess = () => {
    if (!foundLeague) return
    onSelectLeague?.(foundLeague._id)
  }

  const handleJoin = async () => {
    if (!foundLeague || !user?.uid || isFull || isBanned || joining) return
    setJoining(true)
    setJoinError('')
    try {
      if (existingMembership) {
        // Rejoining after having left: reactivate the existing doc so the
        // player's prior prediction/penalty history stays attached to them.
        await upsertDoc('players', existingMembership._id, { active: true })
      } else {
        const playerRef = doc(collection(db, 'players'))
        await setDoc(playerRef, {
          id: playerRef.id,
          leagueId: foundLeague._id,
          authUid: user.uid,
        })
      }
      onSelectLeague?.(foundLeague._id)
    } catch (err) {
      setJoinError("Erreur lors de l'ajout à la ligue. Réessaie.")
    } finally {
      setJoining(false)
    }
  }

  const rules = foundLeague?.rules ?? {}
  const showRules = !!foundLeague && !isActiveMember && !isBanned && !isFull

  const footer = step === 1 ? (
    <FlowButton enabled={code.trim() !== '' && !searching} onClick={handleSearch}>
      {searching ? 'Recherche…' : 'Voir la ligue'}
    </FlowButton>
  ) : isActiveMember ? (
    <FlowButton enabled onClick={handleAccess}>Accéder à la ligue</FlowButton>
  ) : (
    <FlowButton enabled={!isFull && !isBanned && !joining} onClick={handleJoin}>
      {joining ? 'Ajout…' : 'Rejoindre cette ligue'}
    </FlowButton>
  )

  return (
    <FlowLayout
      step={step}
      count={STEP_COUNT}
      onBack={step > 1 ? goBack : null}
      onClose={() => setActiveTab?.('leagues')}
      footer={footer}
    >
      {/* ── Étape 1 : code ── */}
      {step === 1 && (
        <>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Quel est le code de la ligue ?</h1>
          <p className="text-sm text-muted mt-1">6 lettres ou chiffres, envoyés par la personne qui t'invite.</p>
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setSearchError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="input-field text-center text-xl tracking-[0.3em] font-black uppercase mt-5"
            maxLength={6}
            placeholder="ABCD12"
            aria-label="Code d'invitation"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <div role="status" aria-live="polite">
            {searchError && <p className="text-accent text-xs font-bold mt-3 text-center">{searchError}</p>}
          </div>
        </>
      )}

      {/* ── Étape 2 : aperçu de la ligue ── */}
      {step === 2 && foundLeague && (
        <>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Voici la ligue</h1>
          <p className="text-sm text-muted mt-1 mb-5">Vérifie que c'est la bonne avant de la rejoindre.</p>

          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="w-9 h-9 rounded-lg bg-surfaceHigh flex items-center justify-center text-white shrink-0">
              <Users size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-black text-lg leading-snug break-words">{foundLeague.name}</p>
              <p className="text-xs text-muted">{playerCount} joueur{playerCount > 1 ? 's' : ''}</p>
            </div>
          </div>

          {isActiveMember && (
            <p className="text-sm text-muted leading-relaxed mt-4">Tu es déjà dans cette ligue.</p>
          )}
          {isBanned && (
            <p className="text-sm text-accent font-bold leading-relaxed mt-4">
              Tu ne peux pas rejoindre cette ligue. Contacte son admin.
            </p>
          )}
          {!isActiveMember && !isBanned && isFull && (
            <p className="text-sm text-accent font-bold leading-relaxed mt-4">Cette ligue a atteint sa limite de joueurs.</p>
          )}
          {isInactiveMember && !isBanned && !isFull && (
            <p className="text-sm text-muted leading-relaxed mt-4">
              Tu as déjà fait partie de cette ligue : ton historique de pronostics sera restauré.
            </p>
          )}

          {showRules && (
            <>
              <p className={`${SECTION} mt-5 mb-2`}>Règles de la ligue</p>
              <LeagueRulesSummary rules={rules} />
              <div className="mt-4">
                <ReglesLink />
              </div>
            </>
          )}

          {joinError && <p className="text-accent text-xs font-bold mt-4" role="alert">{joinError}</p>}
        </>
      )}
    </FlowLayout>
  )
}
