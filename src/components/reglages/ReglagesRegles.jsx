import { useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { upsertDoc } from '../../hooks/useFirestore'
import { parseAmount } from '../../utils/leagues'
import LeagueRulesFields from '../LeagueRulesFields'
import BottomSheet from '../BottomSheet'

// Hauteur de la barre de navigation du bas : le bouton « Enregistrer » se pose juste au-dessus.
const NAV_HEIGHT = 71

const SECTION = 'text-xs font-black uppercase tracking-widest text-white'

// Valeurs enregistrées de la ligue (mêmes valeurs par défaut qu'avant quand une règle manque)
function savedValues(league) {
  const rules = league?.rules ?? {}
  return {
    name: String(league?.name ?? ''),
    mod: rules.modificationPenalty?.enabled ?? true,
    modAmt: rules.modificationPenalty?.amount ?? 5,
    late: rules.postQualifsPenalty?.enabled ?? true,
    lateAmt: rules.postQualifsPenalty?.amount ?? 10,
    hide: rules.hidePredictionsBeforeRace?.enabled ?? true,
  }
}

// Écran « Règles » de Réglages de ligue (maquette validée le 9 nov. 2026) : nom + règles en un seul
// écran, UN bouton « Enregistrer » collé en bas (une seule écriture : nom et règles ensemble), et une
// question si on revient en arrière avec des modifications non enregistrées.
export default function ReglagesRegles({ league, leagueId, isLeagueAdmin, onBack, addToast }) {
  const saved = useMemo(() => savedValues(league), [league])

  const [name, setName] = useState(saved.name)
  const [mod, setMod] = useState(saved.mod)
  const [modAmt, setModAmt] = useState(String(saved.modAmt))
  const [late, setLate] = useState(saved.late)
  const [lateAmt, setLateAmt] = useState(String(saved.lateAmt))
  const [hide, setHide] = useState(saved.hide)
  const [saving, setSaving] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const modNum = parseAmount(modAmt)
  const lateNum = parseAmount(lateAmt)
  const modInvalid = mod && modNum <= 0
  const lateInvalid = late && lateNum <= 0
  const nameInvalid = name.trim() === ''
  const invalid = modInvalid || lateInvalid || nameInvalid

  // « Modifié » = différent de ce qui est enregistré dans la ligue (après un enregistrement, la ligue
  // se met à jour et le bouton redevient « Aucune modification »)
  const dirty = name.trim() !== saved.name.trim()
    || mod !== saved.mod || modNum !== saved.modAmt
    || late !== saved.late || lateNum !== saved.lateAmt
    || hide !== saved.hide
  const canSave = isLeagueAdmin && dirty && !invalid && !saving
  const label = saving ? 'Enregistrement…' : !dirty ? 'Aucune modification' : invalid ? 'Corrige les champs en rouge' : 'Enregistrer les modifications'

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await upsertDoc('leagues', leagueId, {
        name: name.trim(),
        rules: {
          modificationPenalty: { enabled: mod, amount: modNum },
          postQualifsPenalty: { enabled: late, amount: lateNum },
          hidePredictionsBeforeRace: { enabled: hide },
        },
      })
      addToast?.('Règles mises à jour', 'success')
    } catch {
      addToast?.('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  const back = () => (dirty ? setLeaveOpen(true) : onBack())

  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <button onClick={back} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
          <ChevronLeft size={18} />Réglages
        </button>
        <h1 className="text-2xl font-black tracking-tight leading-tight">Nom et règles</h1>
      </div>

      <div className="px-5 space-y-5">
        <div>
          <p className={`${SECTION} mb-2`}>Nom de la ligue</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            className="input-field"
            aria-label="Nom de la ligue"
            placeholder="Nom de la ligue"
          />
          {nameInvalid && <p className="text-accent text-xs font-bold mt-1.5">Le nom ne peut pas être vide</p>}
        </div>

        <div>
          <p className={`${SECTION} mb-2`}>Pénalités et pronostics</p>
          <div className="card px-4">
            <LeagueRulesFields
              emphasizeAmount
              modEnabled={mod} setModEnabled={setMod} modAmount={modAmt} setModAmount={setModAmt} modAmountInvalid={modInvalid}
              postQualEnabled={late} setPostQualEnabled={setLate} postQualAmount={lateAmt} setPostQualAmount={setLateAmt} postQualAmountInvalid={lateInvalid}
              hideEnabled={hide} setHideEnabled={setHide}
            />
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <p className={SECTION}>Avant de modifier</p>
          <ul className="text-xs text-muted space-y-1.5 list-disc pl-4">
            <li>Un nouveau montant ne s'applique qu'aux prochaines pénalités.</li>
            <li>Les pénalités déjà posées gardent leur montant d'origine.</li>
            <li>Désactiver une pénalité n'efface pas celles déjà posées : on les retire dans « Suivi des GP ».</li>
          </ul>
        </div>
      </div>

      {/* Bouton unique, collé au-dessus de la barre de navigation */}
      <div className="sticky z-30 mt-5 px-5 py-3 bg-bg border-t border-border" style={{ bottom: NAV_HEIGHT }}>
        <button
          onClick={save}
          disabled={!canSave}
          className={`w-full rounded-xl font-black text-base transition-all ${canSave ? 'bg-accent text-white shadow-glow-red active:scale-95' : 'bg-surfaceHigh text-muted'}`}
          style={{ minHeight: 48 }}
        >
          {label}
        </button>
      </div>

      <BottomSheet isOpen={leaveOpen} onClose={() => setLeaveOpen(false)} title="Quitter sans enregistrer ?">
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted leading-relaxed">Tu as modifié des règles sans les enregistrer. Si tu quittes maintenant, ces modifications seront perdues.</p>
          <div className="flex gap-3">
            <button onClick={() => setLeaveOpen(false)} className="flex-1 rounded-lg border border-border bg-surfaceHigh text-sm font-bold" style={{ minHeight: 44 }}>Rester ici</button>
            <button onClick={() => { setLeaveOpen(false); onBack() }} className="flex-1 rounded-lg bg-red-600 text-sm font-black text-white" style={{ minHeight: 44 }}>Quitter</button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
