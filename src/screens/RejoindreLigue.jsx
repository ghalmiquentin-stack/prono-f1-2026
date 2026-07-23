import { useState } from 'react'
import { ChevronLeft, BookOpen, Users } from 'lucide-react'
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { upsertDoc } from '../hooks/useFirestore'
import BottomSheet from '../components/BottomSheet'
import ReglesDuJeu from './ReglesDuJeu'

export default function RejoindreLigue({ user, setActiveTab, onSelectLeague }) {
  const [step, setStep] = useState(1)
  const [rulesSheetOpen, setRulesSheetOpen] = useState(false)

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
    if (!code.trim()) return
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
      setSearchError('Erreur lors de la recherche. Réessayez.')
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

  const handleAccess = () => {
    if (!foundLeague) return
    onSelectLeague?.(foundLeague._id)
  }

  const handleJoin = async () => {
    if (!foundLeague || !user?.uid || isFull) return
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
      setJoinError("Erreur lors de l'ajout à la ligue. Réessayez.")
    } finally {
      setJoining(false)
    }
  }

  const rules = foundLeague?.rules ?? {}

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col items-center px-5 py-10 safe-top">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🏎️</div>
        <h1 className="text-4xl font-black tracking-tight mb-1">
          PRONO <span className="text-accent glow-text">F1</span>
        </h1>
        <p className="text-2xl font-black tracking-widest text-muted">2026</p>
        <div className="f1-stripe w-32 mx-auto mt-4" />
      </div>

      <div className="w-full max-w-sm">
        {/* Header: back / cancel */}
        <div className="flex items-center justify-between mb-4">
          {step > 1 ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
              Retour
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => setActiveTab?.('leagues')}
            className="text-xs font-bold text-muted hover:text-white transition-colors"
          >
            Annuler
          </button>
        </div>

        <div className="card p-5 space-y-4">
          {/* ── Étape 1 : code ── */}
          {step === 1 && (
            <>
              <p className="section-title">Code de la ligue</p>
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setSearchError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="input-field text-center text-xl tracking-[0.3em] font-black uppercase"
                maxLength={6}
                placeholder="ABCD12"
                autoFocus
              />
              {searchError && (
                <p className="text-accent text-xs font-bold">{searchError}</p>
              )}
              <button
                onClick={handleSearch}
                disabled={!code.trim() || searching}
                className={`w-full py-4 rounded-xl font-black text-lg tracking-wide text-white transition-all duration-200 active:scale-95 ${
                  code.trim() && !searching ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                }`}
              >
                {searching ? 'Recherche…' : 'Voir la ligue'}
              </button>
            </>
          )}

          {/* ── Étape 2 : aperçu ── */}
          {step === 2 && foundLeague && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surfaceHigh/50">
                <Users size={20} className="text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg truncate">{foundLeague.name}</p>
                  <p className="text-xs text-muted">
                    {playerCount}/{foundLeague.maxPlayers} joueurs
                  </p>
                </div>
              </div>

              {isActiveMember ? (
                <>
                  <p className="text-sm text-muted leading-relaxed">
                    Vous êtes déjà membre de cette ligue.
                  </p>
                  <button
                    onClick={handleAccess}
                    className="w-full py-4 rounded-xl font-black text-lg tracking-wide text-white bg-accent shadow-glow-red transition-all duration-200 active:scale-95"
                  >
                    Accéder à la ligue
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="section-title mb-0">Règles de la ligue</p>
                    <button
                      type="button"
                      onClick={() => setRulesSheetOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-accent shrink-0"
                    >
                      <span className="flex items-center gap-1.5">
                        <BookOpen size={14} />
                        Voir le barème de points
                      </span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                      <p className="text-sm font-bold">Pénalité modification podium</p>
                      <p className="font-bold text-sm" style={{ color: rules.modificationPenalty?.enabled ? '#E8002D' : undefined }}>
                        {rules.modificationPenalty?.enabled ? `-${rules.modificationPenalty.amount} pts` : 'Désactivée'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                      <p className="text-sm font-bold">Pénalité prono après qualifs</p>
                      <p className="font-bold text-sm" style={{ color: rules.postQualifsPenalty?.enabled ? '#E8002D' : undefined }}>
                        {rules.postQualifsPenalty?.enabled ? `-${rules.postQualifsPenalty.amount} pts` : 'Désactivée'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                      <p className="text-sm font-bold">Pronostics masqués avant course</p>
                      <p className="font-bold text-sm">{rules.hidePredictionsBeforeRace?.enabled ? 'Activé' : 'Désactivé'}</p>
                    </div>
                  </div>

                  {isInactiveMember && !isFull && (
                    <p className="text-xs text-muted leading-relaxed">
                      Vous avez déjà fait partie de cette ligue : votre historique de pronostics sera restauré.
                    </p>
                  )}
                  {isFull && (
                    <p className="text-accent text-xs font-bold">
                      Cette ligue a atteint sa limite de joueurs.
                    </p>
                  )}
                  {joinError && (
                    <p className="text-accent text-xs font-bold">{joinError}</p>
                  )}

                  <button
                    onClick={handleJoin}
                    disabled={joining || isFull}
                    className={`w-full py-4 rounded-xl font-black text-lg tracking-wide text-white transition-all duration-200 active:scale-95 ${
                      !joining && !isFull ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                    }`}
                  >
                    {joining ? 'Ajout…' : 'Rejoindre cette ligue'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Barème de points ── */}
      <BottomSheet isOpen={rulesSheetOpen} onClose={() => setRulesSheetOpen(false)} fullHeight>
        <ReglesDuJeu />
      </BottomSheet>
    </div>
  )
}
