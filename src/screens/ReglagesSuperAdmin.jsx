import { useState, useMemo, useEffect } from 'react'
import { deleteField } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useCollection, useDocument, upsertDoc } from '../hooks/useFirestore'
import { resolveMeetingKey } from '../utils/openf1'
import { formatLapDuration } from '../utils/formatLapDuration'
import { TEAMS } from '../data/drivers'
import { ChevronLeft, ChevronDown, Zap, RefreshCw, Check } from 'lucide-react'
import BottomSheet from '../components/BottomSheet'
import ConfirmModal from '../components/ConfirmModal'
import EntryRow from '../components/EntryRow'
import { PillOn, PillOff } from '../components/StatusPill'

const SECTION = 'text-xs font-black uppercase tracking-widest text-white'
const RED_PILL = 'inline-flex items-center px-2.5 h-6 rounded-full border text-xs font-bold leading-none whitespace-nowrap border-accent/40 bg-accent/15 text-accent'

// Ligne d'un GP : drapeau, nom et date, sous-titre facultatif, pastille d'état. Non cliquable si `onClick` est nul.
function RaceRow({ race, date, sub, right, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${onClick ? 'active:bg-surfaceHigh/50' : ''}`}
      style={{ minHeight: 60 }}
    >
      <span className="text-2xl shrink-0">{race.flag}</span>
      <div className="flex-1 min-w-0">
        <p className="font-black text-base leading-snug">GP {race.name} <span className="text-xs text-muted font-bold">· {date}</span></p>
        {sub && <p className="text-xs text-muted break-words">{sub}</p>}
      </div>
      {right}
    </Tag>
  )
}

export default function ReglagesSuperAdmin({ addToast, onBack }) {
  // ── Admin auth (custom claim) ─────────────────────────────────────────────
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminCheckDone, setAdminCheckDone] = useState(false)

  // ── Result sheet ─────────────────────────────────────────────────────────
  const [resultSheetOpen, setResultSheetOpen] = useState(false)
  const [selectedRaceId, setSelectedRaceId] = useState(null)
  const [resultDraft, setResultDraft] = useState({ P1: null, P2: null, P3: null })
  const [resultPosition, setResultPosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOverwriteResult, setConfirmOverwriteResult] = useState(false)

  // ── Danger confirm modals ────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState(null) // race pending a reset confirmation
  const [upcomingOpen, setUpcomingOpen] = useState(false)

  // ── OpenF1 sync ───────────────────────────────────────────────────────────
  const [openf1Syncing, setOpenf1Syncing] = useState(false)
  const [openf1SyncMsg, setOpenf1SyncMsg] = useState(null)

  // ── OpenF1 result fetch ───────────────────────────────────────────────────
  const [openf1ResultFetching, setOpenf1ResultFetching] = useState(false)
  const [openf1ResultMsg, setOpenf1ResultMsg] = useState(null)

  // ── OpenF1 qualifying fetch ───────────────────────────────────────────────
  // Writes to races/{id} (qualifying, meeting_key) — super-admin only
  // per firestore.rules, hence this lives here rather than in the
  // player-facing PredictionSheet modal (which only ever reads this data).
  const [openf1QualFetching, setOpenf1QualFetching] = useState(false)
  const [openf1QualMsg, setOpenf1QualMsg] = useState(null)
  // Holds a freshly-fetched qualifying object awaiting confirmation when it
  // would overwrite an existing races/{id}.qualifying — null otherwise.
  // Same "confirm only when overwriting" pattern as confirmOverwriteResult.
  const [pendingQualifying, setPendingQualifying] = useState(null)

  // ── Firestore ────────────────────────────────────────────────────────────
  const { data: races } = useCollection(user ? 'races' : null)
  const { data: drivers } = useCollection(user ? 'drivers' : null)
  const { data: openf1Config } = useDocument(user ? 'config' : null, 'openf1')

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
  )

  // Reactive view of the selected race (stays fresh after Firestore writes —
  // e.g. meeting_key/qualifying persisted by a fetch below), instead of
  // a frozen snapshot captured once when the sheet was opened. Mirrors
  // PredictionSheet.jsx's currentRace.
  const selectedRace = useMemo(
    () => selectedRaceId != null ? (sortedRaces.find(r => r.id === selectedRaceId) ?? null) : null,
    [sortedRaces, selectedRaceId]
  )

  // Check the admin custom claim on the connected Firebase user
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setIsAdmin(false)
      setAdminCheckDone(true)
      return
    }
    user.getIdTokenResult()
      .then(tokenResult => {
        if (cancelled) return
        setIsAdmin(tokenResult.claims.admin === true)
        setAdminCheckDone(true)
      })
      .catch(() => {
        if (cancelled) return
        setIsAdmin(false)
        setAdminCheckDone(true)
      })
    return () => { cancelled = true }
  }, [user])

  // ── Admin handlers ────────────────────────────────────────────────────────
  const openResultSheet = (race) => {
    setSelectedRaceId(race.id)
    setResultDraft(race.result ?? { P1: null, P2: null, P3: null })
    setResultSheetOpen(true)
  }

  const closeResultSheet = () => {
    setResultSheetOpen(false)
    setSelectedRaceId(null)
    setResultPosition(null)
    setDriverPickerOpen(false)
    setOpenf1ResultMsg(null)
    setOpenf1QualMsg(null)
  }

  const selectDriver = (driver) => {
    const newResult = { ...resultDraft }
    for (const pos of ['P1', 'P2', 'P3']) {
      if (newResult[pos] === driver && pos !== resultPosition) newResult[pos] = null
    }
    newResult[resultPosition] = driver
    setResultDraft(newResult)
    setDriverPickerOpen(false)
    setResultPosition(null)
  }

  const saveResult = async () => {
    if (!resultDraft.P1 || !resultDraft.P2 || !resultDraft.P3 || !selectedRace) return
    setSaving(true)
    try {
      // `_id` is a client-only artifact injected by useCollection ({ _id:
      // d.id, ...d.data() }) — never a real Firestore field. Strip it before
      // spreading, so it never gets written back into the document.
      const { _id, ...selectedRaceFields } = selectedRace
      await upsertDoc('races', String(selectedRace.id), {
        ...selectedRaceFields,
        result: resultDraft,
        status: 'completed',
        resultSource: 'manual',
        autoFetchGaveUp: deleteField(),
      })
      addToast(`Résultat GP ${selectedRace.name} enregistré !`, 'success')
      closeResultSheet()
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Triggered by the "Valider le résultat" button — only asks for
  // confirmation when this would overwrite an already-official, already-
  // scored result (status 'completed' with a result already set). A first
  // save on a race that isn't completed yet stays a single tap: that's the
  // normal, frequent action, not the risky one.
  const handleValidateResult = () => {
    if (!resultDraft.P1 || !resultDraft.P2 || !resultDraft.P3 || !selectedRace) return
    const wouldOverwriteOfficialResult = selectedRace.status === 'completed' && !!selectedRace.result
    if (wouldOverwriteOfficialResult) {
      setConfirmOverwriteResult(true)
      return
    }
    saveResult()
  }

  const resetRaceResult = async (race) => {
    try {
      // Same _id-stripping as saveResult() above — client-only artifact,
      // must never be written back to Firestore.
      const { _id, ...raceFields } = race
      await upsertDoc('races', String(race.id), { ...raceFields, result: null, status: 'upcoming' })
      addToast('Résultat supprimé', 'info')
    } catch {
      addToast('Erreur', 'error')
    }
  }

  // ── OpenF1 helpers ────────────────────────────────────────────────────────
  const OPENF1_SESSION_KEY = 11234

  const toTitle = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null
  const toTitleAll = s => s ? s.split(' ').map(toTitle).join(' ') : null

  const syncDriversFromOpenF1 = async () => {
    setOpenf1Syncing(true)
    setOpenf1SyncMsg(null)
    try {
      const res = await fetch(
        `https://api.openf1.org/v1/drivers?session_key=${OPENF1_SESSION_KEY}`
      )
      if (!res.ok) throw new Error(`OpenF1 API error: ${res.status}`)
      const rawDrivers = await res.json()
      if (!rawDrivers.length) throw new Error('Aucun pilote retourné')

      for (const d of rawDrivers) {
        await upsertDoc('drivers', String(d.driver_number), {
          driver_number: d.driver_number,
          full_name:     toTitleAll(d.full_name),
          first_name:    toTitle(d.first_name),
          last_name:     toTitle(d.last_name),
          display_name:  toTitle(d.last_name),
          name_acronym:  d.name_acronym   ?? null,
          team_name:     d.team_name      ?? null,
          team_colour:   d.team_colour    ? `#${d.team_colour}` : null,
          headshot_url:  d.headshot_url   ?? null,
          session_key:   OPENF1_SESSION_KEY,
        })
      }
      await upsertDoc('config', 'openf1', {
        lastSync:    new Date().toISOString(),
        sessionKey:  OPENF1_SESSION_KEY,
        driverCount: rawDrivers.length,
      })
      setOpenf1SyncMsg({ type: 'success', text: `${rawDrivers.length} pilotes synchronisés` })
    } catch (err) {
      setOpenf1SyncMsg({ type: 'error', text: err.message })
    } finally {
      setOpenf1Syncing(false)
    }
  }

  const fetchResultFromOpenF1 = async () => {
    if (!selectedRace) return
    setOpenf1ResultFetching(true)
    setOpenf1ResultMsg(null)
    try {
      // Step 1: resolve meeting_key (cached on the race doc after first lookup)
      const meetingKey = await resolveMeetingKey(selectedRace)

      // Step 2: get Race session_key
      const sRes = await fetch(
        `https://api.openf1.org/v1/sessions?meeting_key=${meetingKey}&session_name=Race`
      )
      const sessions = await sRes.json()
      if (!sessions.length) throw new Error('Session "Race" introuvable')
      const sessionKey = sessions[0].session_key

      // Step 3: fetch all session results and keep top 3
      const rRes = await fetch(
        `https://api.openf1.org/v1/session_result?session_key=${sessionKey}`
      )
      const allResults = await rRes.json()
      const top3 = allResults
        .filter(r => r.position >= 1 && r.position <= 3)
        .sort((a, b) => a.position - b.position)
      if (top3.length < 3) throw new Error(`Seulement ${top3.length}/3 résultat(s) disponible(s)`)

      // Step 4: resolve driver_number → display_name
      const resolve = (num) => {
        const d = drivers.find(dr => dr.driver_number === num || String(dr._id) === String(num))
        return d?.display_name ?? d?.name_acronym ?? String(num)
      }

      setResultDraft({
        P1: resolve(top3.find(r => r.position === 1)?.driver_number),
        P2: resolve(top3.find(r => r.position === 2)?.driver_number),
        P3: resolve(top3.find(r => r.position === 3)?.driver_number),
      })
      setOpenf1ResultMsg({ type: 'success', text: 'Résultat récupéré. Vérifie avant de valider.' })
    } catch (err) {
      setOpenf1ResultMsg({ type: 'error', text: err.message })
    } finally {
      setOpenf1ResultFetching(false)
    }
  }

  // Moved from PredictionSheet.jsx — writing qualifying/meeting_key to
  // races/{id} requires super-admin per firestore.rules, so the trigger
  // belongs on this admin-only screen, not the player-facing race modal.
  const fetchQualifyingFromOpenF1 = async () => {
    if (!selectedRace) return
    setOpenf1QualFetching(true)
    setOpenf1QualMsg(null)
    try {
      const meetingKey = await resolveMeetingKey(selectedRace)

      const sessRes = await fetch(
        `https://api.openf1.org/v1/sessions?meeting_key=${meetingKey}&session_name=Qualifying`
      )
      const rawSessions = await sessRes.json()
      // Same ambiguity guard as the Cloud Function auto path
      // (functions/lib/fetchQualifying.js) — a Sprint weekend's meeting
      // also has a "Sprint Qualifying" session; never guess which one to
      // take. Confirmed via OpenF1 (meetings already played in 2026,
      // e.g. Grande-Bretagne/Pays-Bas) that `session_name` reliably
      // distinguishes the two — filtering on the exact string is safe.
      const sessions = (rawSessions ?? []).filter(s => s.session_name === 'Qualifying')
      if (sessions.length !== 1) {
        throw new Error(
          sessions.length === 0
            ? 'Session "Qualifying" introuvable (pas encore publiée par OpenF1)'
            : `${sessions.length} sessions "Qualifying" trouvées — ambiguïté, abandon`
        )
      }
      const qualSession = sessions[0]

      const gridRes = await fetch(
        `https://api.openf1.org/v1/starting_grid?session_key=${qualSession.session_key}&position<=3`
      )
      if (!gridRes.ok) throw new Error(`OpenF1 API error: ${gridRes.status} (starting_grid)`)
      const grid = await gridRes.json()
      grid.sort((a, b) => a.position - b.position)

      const resolve = num =>
        drivers.find(d => d.driver_number === num)?.display_name ?? toTitle(String(num))

      // Each grid entry already carries its own lap_duration — same field
      // seedHistory.js reads for last year's pole, just never captured here
      // before.
      const buildEntry = pos => {
        const entry = grid.find(g => g.position === pos)
        if (!entry) return null
        return {
          name: resolve(entry.driver_number),
          lap_duration: formatLapDuration(entry.lap_duration),
        }
      }

      const P1 = buildEntry(1)
      const P2 = buildEntry(2)
      const P3 = buildEntry(3)
      // Same completeness guard as fetchQualifying.js: never write a
      // partial grid, retry later instead.
      if (!P1 || !P2 || !P3) {
        throw new Error('Grille de qualification incomplète — abandon, rien enregistré')
      }

      const qualifying = {
        year: new Date().getFullYear(),
        P1, P2, P3,
        fetchedAt: new Date().toISOString(),
        source: 'manual',
      }

      // A qualifying grid already exists for this race — ask before
      // overwriting instead of silently replacing it (same "confirm only
      // when overwriting" pattern as handleValidateResult/saveResult
      // above). Hold the computed result and let the ConfirmModal below
      // trigger the actual write.
      if (selectedRace.qualifying) {
        setPendingQualifying(qualifying)
        return
      }

      await upsertDoc('races', String(selectedRace.id), { qualifying })
      setOpenf1QualMsg({ type: 'success', text: 'Qualifications récupérées' })
    } catch (err) {
      setOpenf1QualMsg({ type: 'error', text: err.message })
    } finally {
      setOpenf1QualFetching(false)
    }
  }

  const confirmOverwriteQualifying = async () => {
    if (!pendingQualifying || !selectedRace) return
    try {
      await upsertDoc('races', String(selectedRace.id), { qualifying: pendingQualifying })
      setOpenf1QualMsg({ type: 'success', text: 'Qualifications récupérées' })
    } catch (err) {
      setOpenf1QualMsg({ type: 'error', text: err.message })
    } finally {
      setPendingQualifying(null)
    }
  }

  // ── Affichage : classement des GP ─────────────────────────────────────────
  // « À traiter » = un GP passé sans résultat ; « Résultats » = résultat saisi ou GP annulé ;
  // « À venir » = le reste. Aucune écriture ici : seul l'affichage change.
  const todayStr = new Date().toLocaleDateString('en-CA') // AAAA-MM-JJ, jour local
  const racesTodo = sortedRaces.filter(r =>
    r.status !== 'cancelled' && !r.result && (r.autoFetchGaveUp === true || (r.date && r.date < todayStr))
  )
  const racesDone = sortedRaces.filter(r => r.status === 'cancelled' || !!r.result)
  const racesUpcoming = sortedRaces.filter(r => !racesTodo.includes(r) && !racesDone.includes(r))

  const shortDate = (r) => new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const fullDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const resultComplete = !!(resultDraft.P1 && resultDraft.P2 && resultDraft.P3)
  const qualifying = selectedRace?.qualifying

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-4">
      <div className="px-5 pt-4 pb-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm font-bold text-muted -ml-1 pr-3 active:opacity-70"
            style={{ minHeight: 44 }}
          >
            <ChevronLeft size={18} />Mes ligues
          </button>
        )}
        <h1 className="text-2xl font-black tracking-tight leading-tight">Administration</h1>
        <p className="text-sm text-muted">Réservé au super admin</p>
      </div>

      {adminCheckDone && !isAdmin && (
        <div className="px-5">
          <p className="text-sm text-muted leading-relaxed">Cet écran est réservé au super admin.</p>
        </div>
      )}

      {/* ── SECTION ADMIN (custom claim gated) ── */}
      {adminCheckDone && isAdmin && (
        <div className="px-5 space-y-6">
          {/* ── À traiter ── */}
          <section>
            <p className={`${SECTION} mb-2`}>À traiter</p>
            {racesTodo.length > 0 ? (
              <div className="card divide-y divide-border overflow-hidden">
                {racesTodo.map(race => (
                  <RaceRow
                    key={race.id}
                    race={race}
                    date={shortDate(race)}
                    sub={race.autoFetchGaveUp === true
                      ? 'Récupération automatique abandonnée après 24 h'
                      : 'Résultat attendu, récupération automatique en cours'}
                    right={race.autoFetchGaveUp === true ? <span className={RED_PILL}>À saisir</span> : <PillOff>En attente</PillOff>}
                    onClick={() => openResultSheet(race)}
                  />
                ))}
              </div>
            ) : (
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/40 flex items-center justify-center text-green-400 shrink-0"><Check size={18} /></span>
                <p className="text-sm font-bold">Rien à traiter : tous les GP passés ont un résultat.</p>
              </div>
            )}
          </section>

          {/* ── Résultats ── */}
          <section>
            <p className={`${SECTION} mb-2`}>Résultats <span className="text-muted font-bold">· {racesDone.length}</span></p>
            {racesDone.length > 0 ? (
              <div className="card divide-y divide-border overflow-hidden">
                {racesDone.map(race => (
                  <RaceRow
                    key={race.id}
                    race={race}
                    date={shortDate(race)}
                    sub={race.result ? `${race.result.P1} · ${race.result.P2} · ${race.result.P3}` : null}
                    right={
                      race.status === 'cancelled' ? <PillOff>Annulé</PillOff>
                      : race.resultSource === 'auto' ? <PillOn>Auto</PillOn>
                      : race.resultSource === 'manual' ? <PillOff>Manuel</PillOff>
                      : null
                    }
                    onClick={race.status === 'cancelled' ? null : () => openResultSheet(race)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Aucun résultat pour l'instant.</p>
            )}
          </section>

          {/* ── À venir (replié) ── */}
          <section>
            <button
              type="button"
              onClick={() => setUpcomingOpen(o => !o)}
              aria-expanded={upcomingOpen}
              className="w-full flex items-center justify-between"
              style={{ minHeight: 44 }}
            >
              <p className={SECTION}>À venir <span className="text-muted font-bold">· {racesUpcoming.length}</span></p>
              <ChevronDown size={18} className={`text-muted transition-transform ${upcomingOpen ? 'rotate-180' : ''}`} />
            </button>
            {upcomingOpen && (
              <div className="card divide-y divide-border overflow-hidden mt-1">
                {racesUpcoming.map(race => (
                  <RaceRow
                    key={race.id}
                    race={race}
                    date={shortDate(race)}
                    right={<PillOff>Pas encore couru</PillOff>}
                    onClick={() => openResultSheet(race)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Maintenance ── */}
          <section>
            <p className={`${SECTION} mb-2`}>Maintenance</p>
            <div className="card overflow-hidden">
              <EntryRow
                icon={<RefreshCw size={18} className={openf1Syncing ? 'animate-spin' : ''} />}
                title={openf1Syncing ? 'Synchronisation…' : 'Synchroniser les pilotes'}
                sub={[
                  'Photos et écuries depuis OpenF1',
                  openf1Config?.driverCount != null ? `${openf1Config.driverCount} pilotes` : null,
                  openf1Config?.lastSync ? `dernière synchro ${fullDate(openf1Config.lastSync)}` : null,
                ].filter(Boolean).join(' · ')}
                onClick={syncDriversFromOpenF1}
                chevron={false}
                disabled={openf1Syncing}
              />
            </div>
            <p className="text-[11px] text-muted mt-1.5">Session de référence : {OPENF1_SESSION_KEY} (Australie, course)</p>
            {openf1SyncMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-lg mt-2 ${
                openf1SyncMsg.type === 'success'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {openf1SyncMsg.type === 'success' ? '✓ ' : '✕ '}{openf1SyncMsg.text}
              </p>
            )}
          </section>
        </div>
      )}

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet
        isOpen={resultSheetOpen}
        onClose={closeResultSheet}
        title={selectedRace ? `GP ${selectedRace.name} ${selectedRace.flag}` : ''}
        fullHeight
      >
        {selectedRace && (
          <div className="p-5 pb-10 space-y-5">
            {/* ── Podium officiel ── */}
            <div>
              <p className={`${SECTION} mb-2`}>Podium officiel</p>
              <div className="card overflow-hidden">
                <EntryRow
                  icon={<Zap size={18} className={openf1ResultFetching ? 'animate-pulse' : ''} />}
                  title={openf1ResultFetching ? 'Récupération…' : 'Récupérer depuis OpenF1'}
                  sub="Pré-remplit le podium, tu vérifies avant de valider"
                  onClick={fetchResultFromOpenF1}
                  chevron={false}
                  disabled={openf1ResultFetching}
                />
              </div>
              {openf1ResultMsg && (
                <p className={`text-xs font-bold px-3 py-2 rounded-lg mt-2 ${
                  openf1ResultMsg.type === 'success'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {openf1ResultMsg.type === 'success' ? '✓ ' : '✕ '}{openf1ResultMsg.text}
                </p>
              )}

              <div className="space-y-2 mt-3">
                {['P1', 'P2', 'P3'].map((pos, i) => {
                  const driver = resultDraft[pos]
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => { setResultPosition(pos); setDriverPickerOpen(true) }}
                      className={`w-full flex items-center gap-3 px-4 rounded-xl border-2 text-left active:scale-[0.99] ${driver ? 'border-accent/60 bg-accent/10' : 'border-dashed border-border'}`}
                      style={{ minHeight: 56 }}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-bg font-black text-sm shrink-0 ${
                        i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                      }`}>{i + 1}</span>
                      <span className={`flex-1 ${driver ? 'font-bold' : 'text-muted text-sm'}`}>{driver ?? `Choisir le ${pos}`}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={handleValidateResult}
                disabled={!resultComplete || saving}
                className={`w-full mt-4 rounded-xl font-black text-base ${
                  resultComplete && !saving
                    ? 'bg-accent text-white shadow-glow-red active:scale-95'
                    : 'bg-surfaceHigh text-muted'
                }`}
                style={{ minHeight: 48 }}
              >
                {saving ? 'Enregistrement…' : 'Valider le résultat'}
              </button>
            </div>

            {/* ── Qualifications ── */}
            <div>
              <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap mb-2">
                <p className={SECTION}>Qualifications</p>
                {qualifying?.source && (
                  <span className="whitespace-nowrap">
                    {qualifying.source === 'auto'
                      ? <PillOn>Récupérées automatiquement{qualifying.fetchedAt ? ` · ${fullDate(qualifying.fetchedAt)}` : ''}</PillOn>
                      : <PillOff>Saisies manuellement{qualifying.fetchedAt ? ` · ${fullDate(qualifying.fetchedAt)}` : ''}</PillOff>}
                  </span>
                )}
              </div>
              <div className="card overflow-hidden">
                <EntryRow
                  icon={<Zap size={18} className={openf1QualFetching ? 'animate-pulse' : ''} />}
                  title={openf1QualFetching ? 'Récupération…' : 'Récupérer les qualifs depuis OpenF1'}
                  sub="Enregistre le top 3 tout de suite, sans validation"
                  onClick={fetchQualifyingFromOpenF1}
                  chevron={false}
                  disabled={openf1QualFetching}
                />
              </div>
              {openf1QualMsg && (
                <p className={`text-xs font-bold px-3 py-2 rounded-lg mt-2 ${
                  openf1QualMsg.type === 'success'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {openf1QualMsg.type === 'success' ? '✓ ' : '✕ '}{openf1QualMsg.text}
                </p>
              )}
            </div>

            {selectedRace.result && (
              <button
                type="button"
                onClick={() => setResetTarget(selectedRace)}
                className="w-full text-sm font-bold text-muted underline underline-offset-4 decoration-border"
                style={{ minHeight: 44 }}
              >
                Réinitialiser le résultat
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={driverPickerOpen}
        onClose={() => { setDriverPickerOpen(false); setResultPosition(null) }}
        title={`Choisir le ${resultPosition}`}
        fullHeight
      >
        <div className="p-4 pb-10">
          {TEAMS.map(team => (
            <div key={team.name} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                <span className="text-xs font-bold text-muted uppercase tracking-wide">{team.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {team.drivers.map(driver => {
                  const isSelected = Object.values(resultDraft).includes(driver)
                  const isCurrent = resultDraft[resultPosition] === driver
                  return (
                    <button
                      key={driver}
                      type="button"
                      onClick={() => selectDriver(driver)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        isCurrent ? 'border-accent bg-accent/20' :
                        isSelected ? 'border-muted/30 bg-surfaceHigh/30 opacity-50' :
                        'border-border bg-surfaceHigh hover:border-muted'
                      }`}
                      style={{ minHeight: 56 }}
                    >
                      <p className="font-bold text-sm">{driver}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                        <p className="text-xs text-muted">{team.name}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* ── CONFIRM MODALS ── */}
      <ConfirmModal
        isOpen={!!resetTarget}
        title="Réinitialiser ce résultat ?"
        message={resetTarget
          ? `Le résultat du GP ${resetTarget.name} sera effacé, et les points déjà calculés pour ce GP seront recalculés (donc perdus) pour tous les joueurs de toutes les ligues.`
          : ''}
        confirmLabel="Réinitialiser"
        danger
        onConfirm={async () => {
          const race = resetTarget
          setResetTarget(null)
          if (race) {
            await resetRaceResult(race)
            closeResultSheet()
          }
        }}
        onCancel={() => setResetTarget(null)}
      />

      <ConfirmModal
        isOpen={confirmOverwriteResult}
        title="Remplacer le résultat officiel ?"
        message={selectedRace
          ? `Un résultat officiel existe déjà pour le GP ${selectedRace.name} et a déjà été scoré. Le remplacer recalculera les points pour tous les joueurs concernés.`
          : ''}
        confirmLabel="Remplacer"
        danger
        onConfirm={() => {
          setConfirmOverwriteResult(false)
          saveResult()
        }}
        onCancel={() => setConfirmOverwriteResult(false)}
      />

      <ConfirmModal
        isOpen={!!pendingQualifying}
        title="Remplacer les qualifications ?"
        message={selectedRace?.qualifying
          ? `Une grille de qualification existe déjà pour le GP ${selectedRace.name}` +
            (selectedRace.qualifying.source === 'auto'
              ? ' (récupérée automatiquement'
              : selectedRace.qualifying.source === 'manual'
                ? ' (saisie manuellement'
                : ' (récupération') +
            (selectedRace.qualifying.fetchedAt
              ? ` le ${fullDate(selectedRace.qualifying.fetchedAt)})`
              : ')') +
            '. La remplacer écrasera définitivement cette donnée.'
          : ''}
        confirmLabel="Remplacer"
        danger
        onConfirm={confirmOverwriteQualifying}
        onCancel={() => setPendingQualifying(null)}
      />
    </div>
  )
}
