import { useMemo, useState } from 'react'
import { Pencil, ChevronDown, ChevronUp, Star, Timer, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useRaceTiming } from '../hooks/useRaceTiming'
import { useQualifyingPhase } from '../hooks/useQualifyingPhase'
import { useCollection, useDocument, where } from '../hooks/useFirestore'
import { calculateAllSeasonScores } from '../utils/scoring'
import { getProfile } from '../utils/profiles'
import { hasRaceStarted, formatRaceLocalTimeWithTz, raceStartInstant } from '../utils/races'
import { driverCode, formatLongDate, ordinal, rankOf } from '../utils/sheetStats'
import { getModificationCount } from '../utils/predictions'
import { summarizePenalties } from '../utils/penalties'
import Countdown from '../components/Countdown'
import HeaderBadges from '../components/HeaderBadges'
import PredictionSheet from '../components/PredictionSheet'
import PredictionTimestamps from '../components/PredictionTimestamps'
import QualifyingPodium, { getQualifyingPodium } from '../components/QualifyingPodium'
import CompactPodium from '../components/sheet/CompactPodium'
import Portrait from '../components/sheet/Portrait'
import Skeleton, { SkeletonCard } from '../components/Skeleton'

const PLAYER_COLORS_FALLBACK = {
  william: '#3B82F6',
  quentin: '#22C55E',
  alex: '#F97316',
  romain: '#A855F7',
}

const PLAYER_AVATARS_FALLBACK = {
  william: '🏎️',
  quentin: '🏁',
  alex: '🔥',
  romain: '⚡',
}

const POSITIONS = ['P1', 'P2', 'P3']
const POS_HEX = { P1: '#FFD700', P2: '#C0C0C0', P3: '#CD7F32' }
// Contour d'une place modifiée : bleu ciel = sans pénalité, rouge = pénalisée.
const FREE_TONE = '#38BDF8'
const PEN_TONE = '#E8002D'
const ROW_COLS = 'grid grid-cols-[88px_1fr_1fr_1fr_24px] gap-1'

// Dense ranking: two 🥈 → next is 🥉 (no gap)
function rankWithTies(sorted) {
  const uniqueTotals = [...new Set(sorted.map(p => p.total))].sort((a, b) => b - a)
  return sorted.map(player => ({
    ...player,
    rank: uniqueTotals.indexOf(player.total) + 1,
  }))
}

function rankEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

// Format a UTC date string as "HH:MM" — no explicit timeZone, so this
// resolves to whichever timezone the viewer's own browser is set to.
function formatLocalTime(isoString) {
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Viewer's own timezone abbreviation (CET, EST, JST…) — same no-timeZone-
// option principle as formatLocalTime.
function getLocalTzAbbr(isoString) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
  }).formatToParts(new Date(isoString))
  return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
}

// "dim. 18:00 CET" — weekday, hour and timezone all in the viewer's own
// timezone, so the day can differ from the circuit's for far-away viewers.
function formatSessionWhen(ms) {
  const day = new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short' })
  return `${day} ${formatLocalTime(ms)} ${getLocalTzAbbr(ms)}`.trim()
}

// Longues listes (ligues de plus de quelques joueurs) : on garde les TOP_COUNT
// premiers et le joueur courant ; chaque tronçon masqué d'au moins 2 joueurs est
// remplacé par un séparateur « N autres joueurs ». Un tronçon d'un seul joueur
// reste affiché (le séparateur prendrait autant de place que lui). Retourne une
// liste d'éléments { type: 'player', player } ou { type: 'gap', count }.
const TOP_COUNT = 5

function limitListWithMe(list, meId) {
  const meIndex = list.findIndex(p => p.id === meId)
  const keep = new Set()
  for (let i = 0; i < Math.min(TOP_COUNT, list.length); i++) keep.add(i)
  if (meIndex >= 0) keep.add(meIndex)

  const items = []
  let i = 0
  while (i < list.length) {
    if (keep.has(i)) {
      items.push({ type: 'player', player: list[i] })
      i += 1
      continue
    }
    let j = i
    while (j < list.length && !keep.has(j)) j += 1
    if (j - i <= 1) {
      for (let k = i; k < j; k++) items.push({ type: 'player', player: list[k] })
    } else {
      items.push({ type: 'gap', count: j - i })
    }
    i = j
  }
  return items
}

function GapSeparator({ count }) {
  return (
    <div className="flex items-center gap-2 mx-2 text-[11px] text-muted before:content-[''] before:flex-1 before:border-t before:border-dashed before:border-[#3A3A52] after:content-[''] after:flex-1 after:border-t after:border-dashed after:border-[#3A3A52]">
      {count} autres joueurs
    </div>
  )
}

// Pronostics du prochain GP : fiches des autres joueurs visibles avant le bouton « Voir les N autres joueurs ».
const OTHERS_PREVIEW = 3

export default function Accueil({ currentPlayerId, setActiveTab, activeLeagueName, activeLeagueId, leagueOptions, onSwitchLeague, addToast }) {
  const { user } = useAuth()
  const [predictionSheetOpen, setPredictionSheetOpen] = useState(false)
  const [selectedRace, setSelectedRace] = useState(null)
  const [showAllOthers, setShowAllOthers] = useState(false)
  // Lignes des autres joueurs dépliées dans la carte « Pronostics » (plusieurs possibles).
  const [openRows, setOpenRows] = useState([])
  const leagueConstraint = useMemo(() => [where('leagueId', '==', activeLeagueId)], [activeLeagueId])
  const { data: players, loading: playersLoading, error: playersError } = useCollection(user ? 'players' : null, leagueConstraint)
  const { data: profiles } = useCollection(user ? 'profiles' : null)
  const { data: races, loading: racesLoading, error: racesError } = useCollection(user ? 'races' : null)
  const { data: predictions, error: predictionsError } = useCollection(user ? 'predictions' : null, leagueConstraint)
  const { data: penalties, error: penaltiesError } = useCollection(user ? 'penalties' : null, leagueConstraint)
  const { data: drivers } = useCollection(user ? 'drivers' : null)
  const { data: activeLeague } = useDocument(user ? 'leagues' : null, activeLeagueId)

  const loading = playersLoading || racesLoading
  const hasReadError = !!(playersError || racesError || predictionsError || penaltiesError)

  // Current player: direct Firestore lookup, identity resolved via profiles/{authUid}
  const currentPlayerData = useMemo(
    () => players.find(p => p.id === currentPlayerId),
    [players, currentPlayerId]
  )
  const currentIdentity = useMemo(
    () => getProfile(profiles, currentPlayerData),
    [profiles, currentPlayerData]
  )
  const playerDisplayName = String(
    currentIdentity?.displayName ??
    (currentPlayerId ? currentPlayerId.charAt(0).toUpperCase() + currentPlayerId.slice(1) : '—')
  )
  const playerColor = String(currentIdentity?.color ?? PLAYER_COLORS_FALLBACK[currentPlayerId] ?? '#6B6B8A')
  const playerAvatar = String(currentIdentity?.avatar ?? PLAYER_AVATARS_FALLBACK[currentPlayerId] ?? '🏎️')

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  const nextRace = useMemo(() =>
    sortedRaces.find(r => r.status === 'upcoming'),
    [sortedRaces]
  )

  // Flips by itself when the GP start is crossed (no reload needed).
  const { started: raceStarted } = useRaceTiming(nextRace)

  // Qualifying phase of the next GP (announced / before / live / none), flips
  // by itself at each threshold. Display only: reads races.qualifyingStartAt.
  const { phase: rawQualifyingPhase, qualifyingMs } = useQualifyingPhase(nextRace)

  const completedRaces = useMemo(() =>
    sortedRaces.filter(r => r.status === 'completed'),
    [sortedRaces]
  )

  // Races still to come — excludes cancelled GPs, which will never be run
  // and shouldn't inflate the "restantes" count.
  const remainingRacesCount = useMemo(() =>
    sortedRaces.filter(r => r.status === 'upcoming').length,
    [sortedRaces]
  )

  const lastRace = useMemo(() =>
    completedRaces[completedRaces.length - 1] ?? null,
    [completedRaces]
  )

  const standings = useMemo(() => {
    if (!players.length || !races.length) return []
    const raw = calculateAllSeasonScores(players, sortedRaces, predictions, penalties)
      .sort((a, b) => b.total - a.total)
    return rankWithTies(raw)
  }, [players, races, predictions, penalties, sortedRaces])

  const currentPlayerStanding = useMemo(() =>
    standings.find(p => p.id === currentPlayerId),
    [standings, currentPlayerId]
  )

  // Players ranked by points scored on the last race specifically (not the
  // cumulative season total) — reuses the per-race breakdown already
  // computed by calculateAllSeasonScores (standings[].raceScores), so the
  // "Dernière course" card stays consistent with Classement/Stats instead
  // of recomputing scores a different way.
  const lastRaceRanking = useMemo(() => {
    if (!lastRace) return []
    return standings
      .map(player => ({
        ...player,
        raceScore: player.raceScores.find(rs => rs.raceId === lastRace.id) ?? null,
      }))
      .sort((a, b) => (b.raceScore?.net ?? -Infinity) - (a.raceScore?.net ?? -Infinity))
  }, [standings, lastRace])

  // Rang du joueur sur le dernier GP (même règle que la feuille : classement par
  // points nets, « ex æquo » si un autre joueur a le même score, total = tous les joueurs).
  const myLastRank = useMemo(() => {
    const rows = lastRaceRanking.map(p => ({ id: p.id, net: p.raceScore?.net ?? null }))
    const me = rows.find(r => r.id === currentPlayerId)
    if (!me || me.net == null) return null
    return { rank: rankOf(rows, me.net), tied: rows.filter(r => r.net === me.net).length > 1, total: rows.length }
  }, [lastRaceRanking, currentPlayerId])

  const myPrediction = useMemo(() => {
    if (!nextRace) return null
    return predictions.find(p => p.playerId === currentPlayerId && p.raceId === nextRace.id)
  }, [nextRace, predictions, currentPlayerId])

  // Race start instant (raceTimeUTC from data, 12:00 UTC fallback — see utils/races)
  const raceStartMs = nextRace ? raceStartInstant(nextRace).getTime() : null

  // Titles of the two countdowns, in the viewer's own timezone.
  const raceTitle = useMemo(
    () => (raceStartMs == null ? null : { name: 'Course', when: formatSessionWhen(raceStartMs) }),
    [raceStartMs]
  )
  const qualifyingTitle = useMemo(
    () => (qualifyingMs == null ? null : { name: 'Qualifications', when: formatSessionWhen(qualifyingMs) }),
    [qualifyingMs]
  )

  // Once the podium is known, it replaces every qualifying countdown/banner.
  const qualifyingPodium = nextRace ? getQualifyingPodium(nextRace.qualifying) : null
  const qualifyingPhase = qualifyingPodium ? 'none' : rawQualifyingPhase

  // "Hide predictions before race" league rule — lifts automatically once
  // the GP has actually started, same trigger as the countdown/auto-lock.
  const hidePredictionsActive = !!activeLeague?.rules?.hidePredictionsBeforeRace?.enabled
    && !!nextRace && !hasRaceStarted(nextRace)

  // Carte « Pronostics » : les autres joueurs sont repliés après OTHERS_PREVIEW
  // fiches, seulement si cela en cache au moins 2.
  const otherPlayers = standings.filter(p => p.id !== currentPlayerId)
  const hiddenOthers = Math.max(0, otherPlayers.length - OTHERS_PREVIEW)
  const canFoldOthers = hiddenOthers >= 2
  const visibleOthers = canFoldOthers && !showAllOthers ? otherPlayers.slice(0, OTHERS_PREVIEW) : otherPlayers

  // Ce que la carte « Pronostics » sait d'un joueur pour le prochain GP : pronostic,
  // nombre de modifications, places qui diffèrent du PREMIER podium (l'historique
  // de chaque modification n'est pas conservé) et pénalités réelles de la ligue.
  const describePrediction = (player) => {
    const pred = predictions.find(p => p.playerId === player.id && p.raceId === nextRace.id)
    if (!pred) return { pred: null }
    const modCount = getModificationCount(pred)
    const pens = summarizePenalties(penalties, player.id, nextRace.id)
    const changed = POSITIONS.map(pos => modCount > 0 && !!pred.initialPrediction && pred.prediction?.[pos] !== pred.initialPrediction?.[pos])
    return {
      pred, modCount, pens, changed,
      penalizedMod: pens.changeTotal > 0,
      late: pens.lateTotal > 0,
    }
  }

  // Lignes de pénalité en toutes lettres (montants réels, jamais théoriques).
  const penaltyLines = (pens) => {
    const lines = []
    if (pens.lateTotal > 0) lines.push(`Pronostic tardif : -${pens.lateTotal} pts`)
    if (pens.changeTotal > 0) {
      lines.push(pens.changeCount > 1 ? `${pens.changeCount} modifications : -${pens.changeTotal} pts` : `Modification : -${pens.changeTotal} pts`)
    }
    return lines
  }

  // Détail d'un pronostic (heures, modifications, premier podium, pénalités).
  const renderPredictionDetail = (player, d, { showFullNames = false } = {}) => (
    <div className="space-y-1.5">
      <PredictionTimestamps prediction={d.pred} penalties={penalties} playerId={player.id} raceId={nextRace.id} />
      {d.modCount > 0 && (
        <p className="text-xs text-muted pl-[16px]">
          {d.changed.some(Boolean)
            ? `Premier podium : ${POSITIONS.map(pos => (showFullNames ? d.pred.initialPrediction?.[pos] : driverCode(drivers, d.pred.initialPrediction?.[pos]))).join(' · ')}`
            : 'Podium identique au premier'}
        </p>
      )}
      {penaltyLines(d.pens).length > 0 && (
        <div className="space-y-0.5">
          {penaltyLines(d.pens).map(line => (
            <p key={line} className="flex items-center gap-1.5 text-xs font-bold text-accent"><AlertTriangle size={12} className="shrink-0" />{line}</p>
          ))}
        </div>
      )}
    </div>
  )

  // Ma fiche : podium en trois cases, crayon (tant que le GP n'a pas commencé,
  // sauf déverrouillage admin), détail toujours visible.
  const renderMyCard = (player) => {
    const identity = getProfile(profiles, player)
    const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
    const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
    const displayName = String(identity?.displayName ?? player.id)
    const d = describePrediction(player)
    const canEdit = !hasRaceStarted(nextRace) || d.pred?.manualUnlockOverride === true

    if (!d.pred) return (
      <div key={player.id} className="rounded-xl border border-border bg-surfaceHigh/40 p-3 flex items-center gap-3">
        <span className="text-xl leading-none">{avatar}</span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block font-bold text-sm truncate" style={{ color }}>{displayName}</span>
          <span className="block text-[11px] text-muted">vous</span>
        </span>
        {/* Une fois la course commencée, les pronostics sont verrouillés : même
            libellé que la carte « Dernière course » plutôt qu'une attente. */}
        <span className="text-xs text-muted">{raceStarted ? 'Pas de prono' : '⏳ En attente de prono...'}</span>
      </div>
    )

    const tone = d.penalizedMod ? PEN_TONE : FREE_TONE
    return (
      <div key={player.id} className="rounded-xl border border-border bg-surfaceHigh/40 p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl leading-none">{avatar}</span>
          <span className="flex-1 min-w-0 leading-tight">
            <span className="block font-bold text-sm truncate" style={{ color }}>{displayName}</span>
            <span className="block text-[11px] text-muted">vous</span>
          </span>
          {canEdit && (
            <button
              onClick={() => openRaceSheet(nextRace)}
              className="w-11 h-11 -my-2 -mr-2 flex items-center justify-center rounded-lg text-muted hover:text-white transition-colors"
              aria-label="Modifier mon pronostic"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map((pos, i) => {
            const driverName = d.pred.prediction?.[pos]
            return (
              <div
                key={pos}
                className="relative rounded-lg border bg-surface/60 py-2 flex flex-col items-center gap-1 min-w-0"
                style={{ borderColor: d.changed[i] ? tone : '#2E2E42' }}
              >
                <span className="text-[11px] font-black" style={{ color: POS_HEX[pos] }}>{i + 1}</span>
                <Portrait drivers={drivers} name={driverName} className="w-10 h-10" />
                <span className="text-[11px] font-bold truncate w-full text-center">{driverName}</span>
                {d.changed[i] && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-bg" style={{ background: tone }} aria-label="Place modifiée">
                    <RefreshCw size={11} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-2.5">{renderPredictionDetail(player, d, { showFullNames: true })}</div>
      </div>
    )
  }

  // Un autre joueur : une ligne (avatar, nom, trois cases, chrono si pronostic
  // tardif pénalisé) ; toucher la ligne déplie le détail.
  const renderOtherRow = (player) => {
    const identity = getProfile(profiles, player)
    const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
    const displayName = String(identity?.displayName ?? player.id)
    const d = describePrediction(player)

    // Pronostics masqués par la ligue : seulement « verrouillé » ou « en attente ».
    if (hidePredictionsActive) {
      return (
        <div key={player.id} className={`${ROW_COLS} items-center px-1 py-1.5 min-h-[44px]`}>
          <span className="flex items-center gap-1.5 min-w-0"><span className="text-xl leading-none">{avatar}</span><span className="font-bold text-sm truncate text-white/80">{displayName}</span></span>
          {d.pred
            ? <span className="col-span-3 text-center text-xs text-green-400 font-bold">🔒 Verrouillé</span>
            : <span className="col-span-3 text-center text-xs text-muted font-bold">⏳ En attente</span>}
          <span />
        </div>
      )
    }
    if (!d.pred) {
      return (
        <div key={player.id} className={`${ROW_COLS} items-center px-1 py-1.5 min-h-[44px]`}>
          <span className="flex items-center gap-1.5 min-w-0"><span className="text-xl leading-none">{avatar}</span><span className="font-bold text-sm truncate text-white/80">{displayName}</span></span>
          <span className="col-span-3 text-center text-xs text-muted italic">{raceStarted ? 'Pas de prono' : '⏳ En attente de prono...'}</span>
          <span />
        </div>
      )
    }

    const tone = d.penalizedMod ? PEN_TONE : FREE_TONE
    const open = openRows.includes(player.id)
    return (
      <div key={player.id} className="rounded-lg">
        <button
          onClick={() => setOpenRows(rows => (rows.includes(player.id) ? rows.filter(id => id !== player.id) : [...rows, player.id]))}
          aria-expanded={open}
          className={`w-full ${ROW_COLS} items-center px-1 py-1.5 min-h-[44px] text-left`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-xl leading-none">{avatar}</span>
            <span className="font-bold text-sm truncate text-white/80">{displayName}</span>
          </span>
          {POSITIONS.map((pos, i) => (
            <div
              key={pos}
              className="border rounded-lg py-[3px] px-1 flex items-center justify-center gap-[3px] min-w-0 bg-surfaceHigh/50"
              style={{ borderColor: d.changed[i] ? tone : '#2E2E42' }}
            >
              <Portrait drivers={drivers} name={d.pred.prediction?.[pos]} className="w-5 h-5" />
              <span className="text-[11px] font-semibold tracking-wide leading-none text-white/90">{driverCode(drivers, d.pred.prediction?.[pos])}</span>
            </div>
          ))}
          <span className="flex justify-end">
            {d.late && <Timer size={15} className="text-accent" aria-label="Pronostic tardif, pénalité appliquée" />}
          </span>
        </button>
        {open && (
          <div className="mx-1 mb-1.5 rounded-lg bg-bg/40 border border-border/60 px-2 py-2 space-y-1.5">
            <p className="text-sm font-bold flex items-center gap-1.5 min-w-0"><span className="text-lg leading-none">{avatar}</span><span className="truncate">{displayName}</span></p>
            {renderPredictionDetail(player, d)}
          </div>
        )}
      </div>
    )
  }

  // Opens the shared race detail modal (same one used from Courses) for a
  // given race — defaults to its "Résultat" tab when the race is completed.
  const openRaceSheet = (race) => {
    setSelectedRace(race)
    setPredictionSheetOpen(true)
  }

  // Helper: get player data (color, avatar, displayName) from profiles/{authUid} with fallbacks
  const getPlayerData = (pid) => {
    const fb = players.find(p => p.id === pid)
    const identity = getProfile(profiles, fb)
    return {
      color: String(identity?.color ?? PLAYER_COLORS_FALLBACK[pid] ?? '#6B6B8A'),
      avatar: String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[pid] ?? '🏎️'),
      displayName: String(identity?.displayName ?? (pid.charAt(0).toUpperCase() + pid.slice(1))),
    }
  }

  return (
    <div className="pb-4">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4">
        {/* Row 1: league badge + player badge */}
        <HeaderBadges
          leagueName={activeLeagueName}
          leagueId={activeLeagueId}
          leagueOptions={leagueOptions}
          onSwitchLeague={onSwitchLeague}
          onManageLeagues={() => setActiveTab?.('leagues')}
          player={{
            avatar: playerAvatar,
            color: playerColor,
            displayName: playerDisplayName,
            points: currentPlayerStanding?.total ?? 0,
          }}
          onOpenProfile={() => setActiveTab?.('monprofil')}
        />
        {/* Row 2: main title */}
        <h1 className="text-2xl font-black tracking-tight">
          Prono F1 Saison 2026
        </h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Read error banner — stays visible alongside whatever data did load */}
        {hasReadError && (
          <div className="card p-5 border-accent/40">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-sm mb-1">Certaines données n'ont pas pu être chargées</p>
                <p className="text-xs text-muted leading-relaxed">
                  Les scores affichés peuvent être incomplets. Réessayez en rechargeant la page.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && races.length === 0 && (
          <div className="card p-5 border-accent/40">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🌱</span>
              <div>
                <p className="font-bold text-sm mb-1">Aucune course disponible</p>
                <p className="text-xs text-muted leading-relaxed">
                  Il n'y a pas encore de calendrier de courses pour cette saison.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 1. Prochain GP ── */}
        {loading ? (
          <SkeletonCard />
        ) : nextRace ? (
          <div className="card p-5">
            <span className="text-accent font-bold text-xs uppercase tracking-widest">Prochain GP</span>
            <div className="flex items-center gap-3 mt-3 mb-4">
              <span className="text-4xl">{nextRace.flag}</span>
              <div>
                <h2 className="text-xl font-black leading-tight">GP {nextRace.name}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {new Date(nextRace.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </p>
              </div>
            </div>

            {/* Qualifications : horaire pas encore connu (course à plus de ~7 jours),
                compteur avant la séance, ou séance en cours sans podium. */}
            {qualifyingPhase === 'announced' && (
              <div className="rounded-lg border border-border px-3 py-2.5 mb-4 text-center text-xs font-semibold text-muted">
                Horaire des qualifs bientôt disponible
              </div>
            )}
            {qualifyingPhase === 'before' && (
              <div className="mb-4">
                <Countdown targetDate={qualifyingMs} title={qualifyingTitle} endText={null} />
              </div>
            )}
            {qualifyingPhase === 'live' && (
              <div className="rounded-lg border border-accent/60 px-3 py-2.5 mb-4 text-center text-xs font-bold text-white">
                <span className="inline-block w-[7px] h-[7px] rounded-full bg-accent mr-1.5 align-middle" aria-hidden="true" />
                Qualifications en cours
              </div>
            )}

            {/* Full countdown J / HH / MM / SEC, titre = jour et heure locaux */}
            <Countdown targetDate={raceStartMs} title={raceTitle} />

            {/* Podium des qualifications (races.qualifying) : bande affichée sous
                le compteur de la course seulement si P1, P2 et P3 sont tous connus. */}
            {qualifyingPodium && (
              <div className="mt-4 pt-0.5 border-t border-border">
                <QualifyingPodium podium={qualifyingPodium} drivers={drivers} />
              </div>
            )}

            {/* Prediction status */}
            <div className="mt-4 pt-4 border-t border-border">
              {myPrediction ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-400 font-semibold">Pronostic soumis</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-sm text-accent font-semibold">Pas encore de pronostic</span>
                  </div>
                  {raceStarted ? (
                    <span className="text-xs text-muted font-bold px-3 py-1.5">
                      Pronostics verrouillés
                    </span>
                  ) : (
                    <button
                      onClick={() => openRaceSheet(nextRace)}
                      className="relative text-xs bg-accent text-white font-bold px-3 py-1.5 rounded-lg after:absolute after:-inset-y-2 after:inset-x-0"
                    >
                      Pronostiquer →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-5 text-center">
            <span className="text-4xl">🏁</span>
            <p className="font-bold mt-2">Saison terminée !</p>
          </div>
        )}

        {/* ── 2. Classement général ── */}
        {loading ? (
          <SkeletonCard />
        ) : standings.length > 0 ? (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">Classement général</span>
              <button onClick={() => setActiveTab('classement')} className="relative text-xs text-accent font-bold after:absolute after:-inset-y-3.5 after:inset-x-0">
                Voir tout →
              </button>
            </div>
            <div className="space-y-2">
              {limitListWithMe(standings, currentPlayerId).map((item, idx) => {
                if (item.type === 'gap') return <GapSeparator key={`gap-${idx}`} count={item.count} />
                const player = item.player
                const isCurrent = player.id === currentPlayerId
                const identity = getProfile(profiles, player)
                const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? 'bg-surfaceHigh' : ''} ${player.active === false ? 'opacity-60' : ''}`}
                  >
                    <span className="w-6 text-center text-base leading-none">
                      {rankEmoji(player.rank)}
                    </span>
                    <span className="text-xl leading-none">{avatar}</span>
                    <span className={`flex-1 font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                      {String(identity?.displayName ?? player.id)}
                      {isCurrent && <span className="text-xs text-muted ml-1">(vous)</span>}
                      {player.active === false && (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-muted/20 text-muted px-1.5 py-0.5 rounded-full">
                          Parti
                        </span>
                      )}
                    </span>
                    <span className="font-black text-sm" style={{ color }}>
                      {player.total} pts
                    </span>
                  </div>
                )
              })}
            </div>
            {completedRaces.length > 0 && (
              <p className="text-xs text-muted mt-3 text-center">
                {completedRaces.length} course{completedRaces.length > 1 ? 's' : ''} disputée{completedRaces.length > 1 ? 's' : ''}{' '}
                · {remainingRacesCount} restante{remainingRacesCount > 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : null}

        {/* ── 3. Pronostics du prochain GP ── */}
        {nextRace && (
          loading ? (
            <SkeletonCard />
          ) : (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="section-title !mb-0">Pronostics — GP {nextRace.name}</span>
              </div>
              {(() => {
                const me = standings.find(p => p.id === currentPlayerId)
                return me ? renderMyCard(me) : null
              })()}
              <div className="pt-3 mt-3 border-t border-border">
                <p className="text-[11px] text-muted uppercase tracking-wide font-bold mb-1">Les autres joueurs</p>
                {!hidePredictionsActive && (
                  <div className={`${ROW_COLS} px-1 pb-1 text-[11px] font-bold tracking-widest uppercase text-muted`}>
                    <span /><span className="text-center">P1</span><span className="text-center">P2</span><span className="text-center">P3</span><span />
                  </div>
                )}
                {visibleOthers.map(player => renderOtherRow(player))}
                {canFoldOthers && (
                  <button
                    type="button"
                    onClick={() => setShowAllOthers(v => !v)}
                    aria-expanded={showAllOthers}
                    className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surfaceHigh text-[13px] font-bold active:scale-95 transition-transform"
                  >
                    {showAllOthers ? 'Réduire la liste' : `Voir les ${hiddenOthers} autres joueurs`}
                    {showAllOthers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                {/* Légende : seulement ce qui est réellement affiché dans la carte. */}
                {(() => {
                  const shown = [...(standings.find(p => p.id === currentPlayerId) ? [standings.find(p => p.id === currentPlayerId)] : []), ...(hidePredictionsActive ? [] : visibleOthers)].map(describePrediction)
                  const hasFree = shown.some(x => x.pred && x.changed.some(Boolean) && !x.penalizedMod)
                  const hasPen = shown.some(x => x.pred && x.changed.some(Boolean) && x.penalizedMod)
                  const hasLate = shown.some(x => x.pred && x.late)
                  if (!hasFree && !hasPen && !hasLate) return null
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                      {hasFree && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border" style={{ borderColor: FREE_TONE }} />Modifiée, sans pénalité</span>}
                      {hasPen && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border" style={{ borderColor: PEN_TONE }} />Modifiée, pénalisée</span>}
                      {hasLate && <span className="flex items-center gap-1"><Timer size={13} className="text-accent" />Pronostic tardif</span>}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        )}

        {/* ── 4. Dernière course ── résultat officiel + points de chacun */}
        {loading ? (
          <SkeletonCard />
        ) : lastRace?.result ? (
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none mt-0.5">{lastRace.flag}</span>
              <div className="flex-1 min-w-0">
                <span className="text-accent font-bold text-xs uppercase tracking-widest">Dernière course</span>
                <h3 className="font-black text-base leading-tight">GP {lastRace.name}</h3>
                <p className="text-xs text-muted">
                  {formatLongDate(lastRace.date)}
                  {formatRaceLocalTimeWithTz(lastRace) && (
                    <> · <span className="text-white/70">{formatRaceLocalTimeWithTz(lastRace)}</span></>
                  )}
                </p>
              </div>
            </div>

            {/* Podium officiel : version compacte (portrait, place, nom, écurie) */}
            <CompactPodium result={lastRace.result} drivers={drivers} className="mt-4" />

            {/* Points marqués par chaque joueur de la ligue sur ce GP précis */}
            <div className="mt-4 pt-4 border-t border-border space-y-1.5">
              <p className="text-[11px] text-muted uppercase tracking-wide font-bold mb-1">Points marqués sur ce GP</p>
              {limitListWithMe(lastRaceRanking, currentPlayerId).map((item, idx) => {
                if (item.type === 'gap') return <GapSeparator key={`gap-${idx}`} count={item.count} />
                const player = item.player
                const isCurrent = player.id === currentPlayerId
                const identity = getProfile(profiles, player)
                const color = String(identity?.color ?? PLAYER_COLORS_FALLBACK[player.id] ?? '#fff')
                const avatar = String(identity?.avatar ?? PLAYER_AVATARS_FALLBACK[player.id] ?? '🏎️')
                const displayName = String(identity?.displayName ?? player.id)
                const rs = player.raceScore
                const perfect = rs?.net != null && !!rs.perfectPodium
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 p-2 rounded-lg ${isCurrent ? 'bg-surfaceHigh' : ''} ${perfect ? 'border border-gold/60 bg-gold/[0.06]' : ''}`}
                    style={perfect ? { boxShadow: '0 0 16px rgba(255,215,0,0.22)' } : undefined}
                  >
                    <span className="text-xl leading-none">{avatar}</span>
                    <span className="flex-1 min-w-0 leading-tight">
                      <span className={`block font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-white/80'}`}>{displayName}</span>
                      {isCurrent && (
                        <span className="block text-[11px] text-muted">
                          vous{myLastRank && ` · ${ordinal(myLastRank.rank)} ${myLastRank.tied ? 'ex æquo' : `sur ${myLastRank.total}`}`}
                        </span>
                      )}
                    </span>
                    {rs?.net != null ? (
                      <div className="flex items-center gap-2 shrink-0">
                        {rs.penalty > 0 && (
                          <span className="text-xs text-accent font-bold">-{rs.penalty} pén.</span>
                        )}
                        <span className="flex items-center gap-0.5 font-black text-sm" style={{ color: perfect ? '#FFD700' : color }}>
                          {perfect && <Star size={12} fill="#FFD700" />}{rs.net} pts
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted shrink-0">Pas de prono</span>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => openRaceSheet(lastRace)}
              className="btn-primary w-full mt-4 text-sm"
            >
              Voir tous les pronostics →
            </button>
          </div>
        ) : null}
      </div>

      <PredictionSheet
        isOpen={predictionSheetOpen}
        race={selectedRace}
        races={races}
        onClose={() => { setPredictionSheetOpen(false); setSelectedRace(null) }}
        currentPlayerId={currentPlayerId}
        activeLeagueId={activeLeagueId}
        addToast={addToast}
        players={players}
        profiles={profiles}
        predictions={predictions}
        penalties={penalties}
        drivers={drivers}
      />
    </div>
  )
}
