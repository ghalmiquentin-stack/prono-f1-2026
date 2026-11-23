import { useMemo, useState } from 'react'
import { ChevronLeft, ScrollText, UserCog, Timer, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, useDocument, where } from '../hooks/useFirestore'
import { hasRaceStarted } from '../utils/races'
import { driverCode } from '../utils/sheetStats'
import { KIND_GROUP, journalTitle, journalPenaltyLine, podiumLine, sortJournal } from '../utils/adminJournal'
import { formatAdminWhen } from '../components/AdminEntry'
import Skeleton from '../components/Skeleton'

const FILTERS = [['tous', 'Tout'], ['pronos', 'Pronos'], ['penalites', 'Pénalités']]

function KindIcon({ kind }) {
  if (kind === 'penalty-remove') return <Trash2 size={16} />
  if (kind === 'penalty-add') return <Timer size={17} />
  return <UserCog size={17} />
}

// Journal des interventions des admins de la ligue (maquette validée le 23 nov. 2026, niveau 2) : tout ce qu'un
// admin a saisi, corrigé, ajouté ou retiré, avec son motif. Visible par tous les membres, du plus récent au plus
// ancien. Si la ligue masque les pronos jusqu'au départ, le podium d'un GP pas encore démarré n'est pas montré.
export default function JournalAdmin({ activeLeagueId, onBack }) {
  const { user } = useAuth()
  const constraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: entries, loading, error } = useCollection(user ? 'adminLog' : null, constraint)
  const { data: races } = useCollection(user ? 'races' : null)
  const { data: drivers } = useCollection(user ? 'drivers' : null)
  const { data: league } = useDocument(user ? 'leagues' : null, activeLeagueId)
  return <JournalView entries={entries} races={races} drivers={drivers} league={league} loading={loading} error={error} onBack={onBack} />
}

// Affichage seul (testable sans Firestore).
export function JournalView({ entries, races, drivers, league, loading = false, error = null, onBack }) {
  const [filter, setFilter] = useState('tous')
  const hideBeforeStart = league?.rules?.hidePredictionsBeforeRace?.enabled === true
  const sorted = useMemo(() => sortJournal(entries), [entries])
  const list = sorted.filter(e => filter === 'tous' || KIND_GROUP[e.kind] === filter)
  const codeOf = (name) => driverCode(drivers, name)

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
          <ChevronLeft size={18} />Classement
        </button>
        <h1 className="text-2xl font-black tracking-tight leading-tight flex items-center gap-2"><ScrollText size={22} aria-hidden="true" />Interventions des admins</h1>
        <p className="text-xs text-muted mt-1 leading-snug">Tout ce qu'un admin a ajouté, corrigé ou retiré sur les pronos et les pénalités, avec son motif. Visible par toute la ligue.</p>
      </div>

      {sorted.length > 0 && (
        <div className="flex gap-2 px-5 mb-3">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
              className={`px-3 rounded-full border text-xs font-bold ${filter === id ? 'bg-white text-bg border-white' : 'border-border text-white/80'}`} style={{ minHeight: 36 }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 space-y-2">
        {loading ? (
          <Skeleton rows={3} height="h-24" />
        ) : error ? (
          <div className="card p-5 text-center"><p className="font-bold text-sm">Le journal n'a pas pu être chargé</p><p className="text-xs text-muted mt-1">Réessaie en rechargeant la page.</p></div>
        ) : sorted.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="font-bold">Aucune intervention cette saison</p>
            <p className="text-xs text-muted mt-1">Quand un admin ajoute, corrige ou retire quelque chose, c'est écrit ici.</p>
          </div>
        ) : list.length === 0 ? (
          <div className="card p-5 text-center"><p className="text-sm text-muted">Rien dans cette catégorie.</p></div>
        ) : list.map(e => {
          const race = races.find(r => r.id === e.raceId)
          const hidden = hideBeforeStart && race && !hasRaceStarted(race)
          const isPrediction = KIND_GROUP[e.kind] === 'pronos'
          const penaltyLine = isPrediction ? journalPenaltyLine(e) : (e.penaltyAmount != null ? `Pénalité ${e.penaltyType === 'change' ? 'de modification' : 'de retard'} : −${e.penaltyAmount} pts` : null)
          const podium = isPrediction
            ? (hidden ? 'Podium masqué jusqu\'au départ'
              : e.kind === 'prediction-edit'
                ? `${podiumLine(e.before, codeOf)} → ${podiumLine(e.after, codeOf)}`
                : `Podium : ${podiumLine(e.after, codeOf)}`)
            : null
          return (
            <div key={e._id} className="card p-3 space-y-1.5">
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-full bg-surfaceHigh flex items-center justify-center shrink-0 text-white"><KindIcon kind={e.kind} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug break-words">{journalTitle(e)}</p>
                  <p className="text-[11px] text-muted">{race ? `${race.flag} ${race.name}` : `GP ${e.raceId}`} · {formatAdminWhen(e.at) ?? 'à l\'instant'}</p>
                </div>
              </div>
              {e.motif && <p className="text-xs italic break-words">« {e.motif} »</p>}
              {(podium || penaltyLine) && <p className="text-[11px] text-white/80 break-words">{[podium, penaltyLine].filter(Boolean).join(' · ')}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
