import { Fragment, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Flag, Users, SlidersHorizontal, Check, Timer, RefreshCw } from 'lucide-react'
import { getProfile } from '../../utils/profiles'
import { getPenaltyAmount } from '../../utils/penalties'
import { raceStartInstant, formatRaceLocalTime } from '../../utils/races'

const NEUTRAL_COLOR = '#6B6B8A'
const MAX_NAMES = 3

// Écran d'entrée de Réglages de ligue (maquette validée le 9 nov. 2026) :
// bloc « Prochain GP » (pronos + pénalités), trois entrées, « Supprimer la ligue ».
// Tout ce qui est affiché est LU dans les données déjà chargées par ReglagesLigue : aucune écriture ici.

function Section({ children }) {
  return <p className="text-xs font-black uppercase tracking-widest text-white mb-2">{children}</p>
}

// Lien visuel souligné (le bloc entier est déjà un bouton : pas de bouton imbriqué)
function Link({ children }) {
  return <span className="text-white font-bold underline underline-offset-2 decoration-muted/60">{children}</span>
}

function Names({ people }) {
  const shown = people.slice(0, MAX_NAMES)
  const more = people.length - shown.length
  return (
    <>
      {shown.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span className="text-muted">, </span>}
          <span className="font-bold" style={{ color: p.color }}>{p.name}</span>
        </Fragment>
      ))}
      {more > 0 && <> <span className="text-muted">et</span> <Link>{more} autre{more > 1 ? 's' : ''}</Link></>}
    </>
  )
}

// Pictos de l'app : Timer = pronostic tardif, RefreshCw = modification (rouge = pénalisé)
function PenaltyPictos({ mod, late }) {
  return (
    <span className="flex items-center gap-2 shrink-0">
      {mod > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-bold" role="img" aria-label={`${mod} modification${mod > 1 ? 's' : ''} pénalisée${mod > 1 ? 's' : ''}`}>
          <RefreshCw size={13} className="text-accent shrink-0" />{mod > 1 && <span>×{mod}</span>}
        </span>
      )}
      {late > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-bold" role="img" aria-label={late > 1 ? `${late} pronostics tardifs` : 'Pronostic tardif'}>
          <Timer size={14} className="text-accent shrink-0" />{late > 1 && <span>×{late}</span>}
        </span>
      )}
    </span>
  )
}

function Entry({ icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-surfaceHigh/50" style={{ minHeight: 64 }}>
      <span className="w-9 h-9 rounded-lg bg-surfaceHigh flex items-center justify-center text-white shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-black text-base leading-snug">{title}</p>
        <p className="text-xs text-muted break-words">{sub}</p>
      </div>
      <ChevronRight size={18} className="text-muted shrink-0" />
    </button>
  )
}

// « Course dimanche, départ à 20h00 » (heure du téléphone, comme ailleurs dans l'app)
function raceWhen(race) {
  const day = raceStartInstant(race).toLocaleDateString('fr-FR', { weekday: 'long' })
  const time = formatRaceLocalTime(race)
  if (!time) return null
  return `Course ${day}, départ à ${time.replace(':', 'h')}`
}

function rulesSummary(rules) {
  const mod = rules?.modificationPenalty
  const late = rules?.postQualifsPenalty
  const hide = rules?.hidePredictionsBeforeRace
  const modOn = mod?.enabled ?? true
  const lateOn = late?.enabled ?? true
  const hideOn = hide?.enabled ?? true
  return [
    modOn ? `Modif. −${mod?.amount ?? 5}` : 'Modif. désactivée',
    lateOn ? `Après qualifs −${late?.amount ?? 10}` : 'Après qualifs désactivé',
    hideOn ? 'Pronos masqués' : 'Pronos visibles',
  ].join(' · ')
}

export default function ReglagesHub({
  league, players, predictions, penalties, profiles, nextRace,
  onBack, onOpen, onDelete, canDelete,
}) {
  const identityOf = (player) => {
    const identity = getProfile(profiles, player)
    return { id: player.id, name: String(identity?.displayName ?? player.id), color: String(identity?.color ?? NEUTRAL_COLOR) }
  }

  // Joueurs actifs de la ligue (les partis et bannis n'ont plus à pronostiquer)
  const activePlayers = useMemo(() => players.filter(p => p.active !== false), [players])
  const adminCount = Array.isArray(league?.adminUids) ? league.adminUids.length : 0

  const next = useMemo(() => {
    if (!nextRace) return null
    const withProno = new Set(predictions.filter(p => p.raceId === nextRace.id).map(p => p.playerId))
    const missing = activePlayers.filter(p => !withProno.has(p.id)).map(identityOf)
    const played = activePlayers.length - missing.length

    const byPlayer = new Map()
    for (const pen of penalties) {
      if (pen.raceId !== nextRace.id) continue
      const row = byPlayer.get(pen.playerId) ?? { mod: 0, late: 0, total: 0 }
      if (pen.type === 'late') row.late += 1
      else row.mod += 1
      row.total += getPenaltyAmount(pen)
      byPlayer.set(pen.playerId, row)
    }
    const penalised = [...byPlayer.entries()]
      .map(([playerId, row]) => {
        const player = players.find(p => p.id === playerId)
        return player ? { ...identityOf(player), ...row } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.total - a.total)

    return { played, total: activePlayers.length, missing, penalised }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRace, predictions, penalties, players, activePlayers, profiles])

  const pct = next && next.total > 0 ? Math.round((next.played / next.total) * 100) : 0
  const topPenalised = next ? next.penalised.slice(0, 3) : []
  const restPenalised = next ? next.penalised.length - topPenalised.length : 0
  const when = nextRace ? raceWhen(nextRace) : null

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70" style={{ minHeight: 44 }}>
          <ChevronLeft size={18} />Mes ligues
        </button>
        <h1 className="text-2xl font-black tracking-tight leading-tight">Réglages</h1>
        <p className="text-sm text-muted mt-0.5 break-words">{league?.name ?? 'Ligue'}</p>
      </div>

      <div className="px-5 space-y-5">
        {next && (
          <div>
            <Section>Prochain GP</Section>
            <div className="card overflow-hidden divide-y divide-border">
              <button onClick={() => onOpen('suivi', { tab: 'pronos' })} className="w-full text-left p-4 active:bg-surfaceHigh/50">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-base leading-snug">{nextRace.flag} GP {nextRace.name}</p>
                    {when && <p className="text-xs text-muted">{when}</p>}
                  </div>
                  <ChevronRight size={18} className="text-muted shrink-0 mt-0.5" />
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold">Pronos</p>
                    <p className="text-sm"><span className="font-black">{next.played}</span><span className="text-muted"> sur {next.total}</span></p>
                  </div>
                  <div className="h-1.5 rounded-full bg-surfaceHigh mt-1.5 overflow-hidden" role="img" aria-label={`${next.played} pronostics sur ${next.total}`}>
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs mt-1.5 break-words">
                    {next.missing.length === 0
                      ? <span className="inline-flex items-center gap-1 text-green-400 font-bold"><Check size={13} />Tout le monde a pronostiqué</span>
                      : <><span className="text-muted">Manque : </span><Names people={next.missing} /></>}
                  </p>
                </div>
              </button>

              <button onClick={() => onOpen('suivi', { tab: 'penalties' })} className="w-full text-left p-4 active:bg-surfaceHigh/50 flex items-start gap-3" style={{ minHeight: 64 }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold">Pénalités</p>
                    <p className="text-sm text-muted">
                      {next.penalised.length === 0
                        ? 'Aucune'
                        : <><span className="text-white font-black">{next.penalised.length}</span> joueur{next.penalised.length > 1 ? 's' : ''}</>}
                    </p>
                  </div>
                  {next.penalised.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {topPenalised.map(p => (
                        <div key={p.id} className="flex items-center gap-3 text-xs">
                          <span className="font-bold truncate min-w-0 flex-1" style={{ color: p.color }}>{p.name}</span>
                          <PenaltyPictos mod={p.mod} late={p.late} />
                          <span className="font-black text-accent text-right shrink-0" style={{ minWidth: 36 }}>−{p.total}</span>
                        </div>
                      ))}
                      {restPenalised > 0 && (
                        <p className="text-xs"><span className="text-muted">et </span><Link>{restPenalised} autre{restPenalised > 1 ? 's' : ''} joueur{restPenalised > 1 ? 's' : ''}</Link></p>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight size={18} className="text-muted shrink-0 mt-0.5" />
              </button>
            </div>
          </div>
        )}

        <div className="card divide-y divide-border overflow-hidden">
          <Entry icon={<Flag size={18} />} title="Suivi des GP" sub="Pronos et pénalités, GP par GP" onClick={() => onOpen('suivi')} />
          <Entry
            icon={<Users size={18} />}
            title="Joueurs"
            sub={`${activePlayers.length} joueur${activePlayers.length > 1 ? 's' : ''} · ${adminCount} admin${adminCount > 1 ? 's' : ''}`}
            onClick={() => onOpen('joueurs')}
          />
          <Entry icon={<SlidersHorizontal size={18} />} title="Règles" sub={rulesSummary(league?.rules)} onClick={() => onOpen('regles')} />
        </div>

        {canDelete && (
          <button
            onClick={onDelete}
            className="w-full text-sm font-bold text-muted underline underline-offset-4 decoration-border active:opacity-70"
            style={{ minHeight: 44 }}
          >
            Supprimer la ligue
          </button>
        )}
      </div>
    </div>
  )
}
