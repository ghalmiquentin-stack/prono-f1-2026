import { useState } from 'react'
import { Check } from 'lucide-react'
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import BottomSheet from '../components/BottomSheet'
import LeagueRulesFields from '../components/LeagueRulesFields'
import FlowLayout, { FlowButton } from '../components/FlowLayout'
import ReglesLink from '../components/ReglesLink'
import InviteCode from '../components/ligues/InviteCode'
import { parseAmount } from '../utils/leagues'

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

const SECTION = 'text-xs font-black uppercase tracking-widest text-white'

// Ligne du récapitulatif (étape 3). `wrap` : la valeur (le nom, jusqu'à 30 caractères) passe
// sur plusieurs lignes plutôt que de sortir de la carte.
function RecapLine({ label, value, red = false, wrap = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-b-0">
      <p className={`text-sm font-bold ${wrap ? 'shrink-0' : 'min-w-0'}`}>{label}</p>
      <p className={`text-base font-black text-right ${wrap ? 'min-w-0 break-words' : 'shrink-0'} ${red ? 'text-accent' : 'text-white'}`}>{value}</p>
    </div>
  )
}

export default function CreerLigue({ user, setActiveTab, onSelectLeague }) {
  const [step, setStep] = useState(1)
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false)

  const [name, setName] = useState('')

  const [modEnabled, setModEnabled] = useState(true)
  const [modAmount, setModAmount] = useState('5')
  const [postQualEnabled, setPostQualEnabled] = useState(true)
  const [postQualAmount, setPostQualAmount] = useState('10')
  const [hideEnabled, setHideEnabled] = useState(true)

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  // Rempli une fois la ligue créée : affiche l'écran de fin avec le code d'invitation.
  const [created, setCreated] = useState(null) // { id, name, code }

  const modAmountNum = parseAmount(modAmount)
  const postQualAmountNum = parseAmount(postQualAmount)
  const modAmountInvalid = modEnabled && modAmountNum <= 0
  const postQualAmountInvalid = postQualEnabled && postQualAmountNum <= 0
  const step2HasError = modAmountInvalid || postQualAmountInvalid
  const nameOk = name.trim() !== ''

  const goBack = () => setStep(s => Math.max(1, s - 1))
  const goNext = () => setStep(s => Math.min(STEP_COUNT, s + 1))

  // La croix ne demande confirmation que si un nom a été saisi.
  const handleClose = () => {
    if (nameOk) setCancelSheetOpen(true)
    else setActiveTab?.('leagues')
  }

  const handleCancelConfirm = () => {
    setCancelSheetOpen(false)
    setActiveTab?.('leagues')
  }

  const handleCreate = async () => {
    if (!nameOk || !user?.uid || creating) return
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
        maxPlayers: 100,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })

      const playerRef = doc(collection(db, 'players'))
      await setDoc(playerRef, {
        id: playerRef.id,
        leagueId: leagueRef.id,
        authUid: user.uid,
      })

      setCreated({ id: leagueRef.id, name: name.trim(), code })
    } catch (err) {
      setError('Erreur lors de la création de la ligue. Réessaie.')
    } finally {
      setCreating(false)
    }
  }

  // ── Fin : la ligue existe, on montre le code d'invitation ──
  if (created) {
    return (
      <div className="h-[100dvh] bg-bg flex flex-col safe-top overflow-hidden">
        <section className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center px-[22px] text-center">
          <div className="relative mx-auto w-[84px] h-[84px] flex items-center justify-center shrink-0">
            <div
              className="absolute -inset-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 50% 50%, rgba(34,197,94,0.2) 0%, rgba(21,21,30,0) 65%)' }}
              aria-hidden="true"
            />
            <div className="relative w-[84px] h-[84px] rounded-full bg-green-500/10 border-[3px] border-green-500 flex items-center justify-center">
              <Check size={40} strokeWidth={3} className="text-green-400" />
            </div>
          </div>
          <h1 className="text-[30px] font-black tracking-tight leading-none mt-7">
            Ta ligue est <span className="text-green-400">prête</span>.
          </h1>
          <p className="text-sm text-muted leading-normal mt-3 break-words">
            « {created.name} » existe. Invite tes amis avec ce code.
          </p>
          <div className="card p-4 mt-6 text-left">
            <InviteCode league={{ name: created.name, code: created.code }} shareable={false} />
          </div>
        </section>
        <div className="shrink-0 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <FlowButton enabled onClick={() => onSelectLeague?.(created.id)}>Aller à ma ligue</FlowButton>
        </div>
      </div>
    )
  }

  const isLast = step === STEP_COUNT
  const nextEnabled = step === 1 ? nameOk : step === 2 ? !step2HasError : false

  const footer = isLast ? (
    <FlowButton enabled={nameOk && !step2HasError && !creating} onClick={handleCreate}>
      {creating ? 'Création…' : 'Créer ma ligue'}
    </FlowButton>
  ) : (
    <FlowButton enabled={nextEnabled} onClick={goNext}>Suivant</FlowButton>
  )

  return (
    <FlowLayout
      step={step}
      count={STEP_COUNT}
      onBack={step > 1 ? goBack : null}
      onClose={handleClose}
      footer={footer}
    >
      {/* ── Étape 1 : nom ── */}
      {step === 1 && (
        <>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Comment s'appelle ta ligue ?</h1>
          <p className="text-sm text-muted mt-1">Tes amis la verront en la rejoignant.</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && nameOk && goNext()}
            className="input-field mt-5"
            maxLength={30}
            placeholder="Ex. Ligue entre amis"
            aria-label="Nom de la ligue"
            autoFocus
          />
        </>
      )}

      {/* ── Étape 2 : règles ── */}
      {step === 2 && (
        <>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Les règles de ta ligue</h1>
          <p className="text-sm text-muted mt-1">Tu pourras les changer plus tard dans les réglages de la ligue.</p>
          <p className={`${SECTION} mt-5 mb-2`}>Pénalités et pronostics</p>
          <div className="card px-4">
            <LeagueRulesFields
              modEnabled={modEnabled} setModEnabled={setModEnabled}
              modAmount={modAmount} setModAmount={setModAmount} modAmountInvalid={modAmountInvalid}
              postQualEnabled={postQualEnabled} setPostQualEnabled={setPostQualEnabled}
              postQualAmount={postQualAmount} setPostQualAmount={setPostQualAmount} postQualAmountInvalid={postQualAmountInvalid}
              hideEnabled={hideEnabled} setHideEnabled={setHideEnabled}
            />
          </div>
          <div className="mt-4">
            <ReglesLink />
          </div>
        </>
      )}

      {/* ── Étape 3 : récapitulatif ── */}
      {step === 3 && (
        <>
          <h1 className="text-2xl font-black tracking-tight leading-tight">Tout est bon ?</h1>
          <p className="text-sm text-muted mt-1">Vérifie avant de créer ta ligue.</p>
          <p className={`${SECTION} mt-5 mb-2`}>Ligue</p>
          <div className="card px-4"><RecapLine label="Nom" value={name.trim()} wrap /></div>
          <p className={`${SECTION} mt-5 mb-2`}>Pénalités et pronostics</p>
          <div className="card px-4">
            <RecapLine label="Pénalité sur modification" value={modEnabled ? `−${modAmountNum} pts` : 'Désactivée'} red={modEnabled} />
            <RecapLine label="Pénalité après les qualifs" value={postQualEnabled ? `−${postQualAmountNum} pts` : 'Désactivée'} red={postQualEnabled} />
            <RecapLine label="Pronostics masqués avant la course" value={hideEnabled ? 'Activé' : 'Désactivé'} />
          </div>
          {error && <p className="text-accent text-xs font-bold mt-4" role="alert">{error}</p>}
        </>
      )}

      {/* ── Abandon : seulement si un nom a été saisi ── */}
      <BottomSheet isOpen={cancelSheetOpen} onClose={() => setCancelSheetOpen(false)} title="Abandonner la création ?">
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Tu as commencé à créer une ligue. Si tu quittes maintenant, ce que tu as saisi sera perdu.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setCancelSheetOpen(false)}
              className="flex-1 rounded-lg border border-border bg-surfaceHigh text-sm font-bold"
              style={{ minHeight: 44 }}
            >
              Continuer
            </button>
            <button
              onClick={handleCancelConfirm}
              className="flex-1 rounded-lg bg-red-600 text-sm font-black text-white"
              style={{ minHeight: 44 }}
            >
              Abandonner
            </button>
          </div>
        </div>
      </BottomSheet>
    </FlowLayout>
  )
}
