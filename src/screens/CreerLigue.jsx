import { useState } from 'react'
import { X, ChevronLeft, BookOpen } from 'lucide-react'
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import BottomSheet from '../components/BottomSheet'
import LeagueRulesFields from '../components/LeagueRulesFields'
import { parseAmount } from '../utils/leagues'
import ReglesDuJeu from './ReglesDuJeu'

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const STEP_COUNT = 3

function generateCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

async function generateUniqueLeagueCode() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = generateCode()
    const snap = await getDocs(query(collection(db, 'leagues'), where('code', '==', code)))
    if (snap.empty) return code
  }
}

export default function CreerLigue({ user, setActiveTab, onSelectLeague }) {
  const [step, setStep] = useState(1)
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false)
  const [rulesSheetOpen, setRulesSheetOpen] = useState(false)

  const [name, setName] = useState('')

  const [modEnabled, setModEnabled] = useState(true)
  const [modAmount, setModAmount] = useState('5')
  const [postQualEnabled, setPostQualEnabled] = useState(true)
  const [postQualAmount, setPostQualAmount] = useState('10')
  const [hideEnabled, setHideEnabled] = useState(true)

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const modAmountNum = parseAmount(modAmount)
  const postQualAmountNum = parseAmount(postQualAmount)
  const modAmountInvalid = modEnabled && modAmountNum <= 0
  const postQualAmountInvalid = postQualEnabled && postQualAmountNum <= 0
  const step2HasError = modAmountInvalid || postQualAmountInvalid

  const goBack = () => setStep(s => Math.max(1, s - 1))
  const goNext = () => setStep(s => Math.min(STEP_COUNT, s + 1))

  const handleCancelConfirm = () => {
    setCancelSheetOpen(false)
    setActiveTab?.('leagues')
  }

  const handleCreate = async () => {
    if (!name.trim() || !user?.uid) return
    setCreating(true)
    setError('')
    try {
      const code = await generateUniqueLeagueCode()

      const leagueRef = doc(collection(db, 'leagues'))
      await setDoc(leagueRef, {
        name: name.trim(),
        code,
        adminUids: [user.uid],
        rules: {
          modificationPenalty: { enabled: modEnabled, amount: modAmountNum },
          postQualifsPenalty: { enabled: postQualEnabled, amount: postQualAmountNum },
          hidePredictionsBeforeRace: { enabled: hideEnabled },
        },
        maxPlayers: 20,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })

      const playerRef = doc(collection(db, 'players'))
      await setDoc(playerRef, {
        id: playerRef.id,
        leagueId: leagueRef.id,
        authUid: user.uid,
      })

      onSelectLeague?.(leagueRef.id)
    } catch (err) {
      setError('Erreur lors de la création de la ligue. Réessayez.')
    } finally {
      setCreating(false)
    }
  }

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
            onClick={() => setCancelSheetOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surfaceHigh text-muted hover:text-white transition-colors"
            aria-label="Annuler"
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-2">
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map(s => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-accent' : 'bg-border'}`}
            />
          ))}
        </div>
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted mb-6">
          Étape {step}/{STEP_COUNT}
        </p>

        <div className="card p-5 space-y-4">
          {/* ── Étape 1 : nom ── */}
          {step === 1 && (
            <>
              <p className="section-title">Nom de la ligue</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
                maxLength={30}
                placeholder="Ex. Ligue entre amis"
                autoFocus
              />
              <button
                onClick={goNext}
                disabled={!name.trim()}
                className={`w-full py-4 rounded-xl font-black text-lg tracking-wide text-white transition-all duration-200 active:scale-95 ${
                  name.trim() ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                }`}
              >
                Suivant
              </button>
            </>
          )}

          {/* ── Étape 2 : règles ── */}
          {step === 2 && (
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

              <LeagueRulesFields
                modEnabled={modEnabled} setModEnabled={setModEnabled}
                modAmount={modAmount} setModAmount={setModAmount} modAmountInvalid={modAmountInvalid}
                postQualEnabled={postQualEnabled} setPostQualEnabled={setPostQualEnabled}
                postQualAmount={postQualAmount} setPostQualAmount={setPostQualAmount} postQualAmountInvalid={postQualAmountInvalid}
                hideEnabled={hideEnabled} setHideEnabled={setHideEnabled}
              />

              <button
                onClick={goNext}
                disabled={step2HasError}
                className={`w-full py-4 rounded-xl font-black text-lg tracking-wide text-white transition-all duration-200 active:scale-95 ${
                  !step2HasError ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                }`}
              >
                Suivant
              </button>
            </>
          )}

          {/* ── Étape 3 : récapitulatif ── */}
          {step === 3 && (
            <>
              <p className="section-title">Récapitulatif</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                  <p className="text-xs text-muted font-bold uppercase tracking-wide">Nom</p>
                  <p className="font-black text-sm">{name}</p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                  <p className="text-sm font-bold">Pénalité modification podium</p>
                  <p className="font-bold text-sm" style={{ color: modEnabled ? '#E8002D' : undefined }}>
                    {modEnabled ? `-${modAmountNum} pts` : 'Désactivée'}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                  <p className="text-sm font-bold">Pénalité prono après qualifs</p>
                  <p className="font-bold text-sm" style={{ color: postQualEnabled ? '#E8002D' : undefined }}>
                    {postQualEnabled ? `-${postQualAmountNum} pts` : 'Désactivée'}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
                  <p className="text-sm font-bold">Pronostics masqués avant course</p>
                  <p className="font-bold text-sm">{hideEnabled ? 'Activé' : 'Désactivé'}</p>
                </div>
              </div>

              {error && (
                <p className="text-accent text-xs font-bold">{error}</p>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                className={`w-full py-4 rounded-xl font-black text-lg tracking-wide text-white transition-all duration-200 active:scale-95 ${
                  !creating && name.trim() ? 'bg-accent shadow-glow-red' : 'bg-surfaceHigh text-muted cursor-not-allowed'
                }`}
              >
                {creating ? 'Création…' : 'Créer ma ligue'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Confirmation d'annulation ── */}
      <BottomSheet isOpen={cancelSheetOpen} onClose={() => setCancelSheetOpen(false)} title="Annuler la création ?">
        <div className="p-5 pb-10 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Les informations ne seront pas enregistrées.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setCancelSheetOpen(false)}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
            >
              Continuer
            </button>
            <button
              onClick={handleCancelConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-black text-white bg-red-600"
            >
              Annuler
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Barème de points ── */}
      <BottomSheet isOpen={rulesSheetOpen} onClose={() => setRulesSheetOpen(false)} fullHeight>
        <ReglesDuJeu />
      </BottomSheet>
    </div>
  )
}
