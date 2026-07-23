import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCollection, useDocument, upsertDoc } from '../hooks/useFirestore'
import { clearDatabase } from '../data/seed'
import { TEAMS } from '../data/drivers'
import BottomSheet from '../components/BottomSheet'

function ConfirmModal({ isOpen, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-bold"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-sm font-black text-white ${
              danger ? 'bg-red-600' : 'bg-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReglagesSuperAdmin({ addToast }) {
  // ── Admin auth (custom claim) ─────────────────────────────────────────────
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminCheckDone, setAdminCheckDone] = useState(false)

  // ── Result sheet ─────────────────────────────────────────────────────────
  const [resultSheetOpen, setResultSheetOpen] = useState(false)
  const [selectedRace, setSelectedRace] = useState(null)
  const [resultDraft, setResultDraft] = useState({ P1: null, P2: null, P3: null })
  const [resultPosition, setResultPosition] = useState(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Danger zone confirm modals ───────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  // ── OpenF1 sync ───────────────────────────────────────────────────────────
  const [openf1Syncing, setOpenf1Syncing] = useState(false)
  const [openf1SyncMsg, setOpenf1SyncMsg] = useState(null)

  // ── OpenF1 result fetch ───────────────────────────────────────────────────
  const [openf1ResultFetching, setOpenf1ResultFetching] = useState(false)
  const [openf1ResultMsg, setOpenf1ResultMsg] = useState(null)

  // ── Firestore ────────────────────────────────────────────────────────────
  const { data: races } = useCollection(user ? 'races' : null)
  const { data: drivers } = useCollection(user ? 'drivers' : null)
  const { data: openf1Config } = useDocument(user ? 'config' : null, 'openf1')

  const sortedRaces = useMemo(() =>
    [...races].sort((a, b) => a.id - b.id),
    [races]
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
    setSelectedRace(race)
    setResultDraft(race.result ?? { P1: null, P2: null, P3: null })
    setResultSheetOpen(true)
  }

  const closeResultSheet = () => {
    setResultSheetOpen(false)
    setSelectedRace(null)
    setResultPosition(null)
    setDriverPickerOpen(false)
    setOpenf1ResultMsg(null)
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
      await upsertDoc('races', String(selectedRace.id), {
        ...selectedRace,
        result: resultDraft,
        status: 'completed',
        qualifying_locked: true,
      })
      addToast(`Résultat GP ${selectedRace.name} enregistré !`, 'success')
      closeResultSheet()
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetRaceResult = async (race) => {
    if (!confirm(`Réinitialiser le résultat de ${race.name} ?`)) return
    try {
      await upsertDoc('races', String(race.id), { ...race, result: null, status: 'upcoming' })
      addToast('Résultat supprimé', 'info')
    } catch {
      addToast('Erreur', 'error')
    }
  }

  const handleClearDatabase = async () => {
    setClearing(true)
    try {
      await clearDatabase()
      addToast('Base de données vidée', 'warning')
    } catch {
      addToast('Erreur', 'error')
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  // ── OpenF1 helpers ────────────────────────────────────────────────────────
  const OPENF1_SESSION_KEY = 11234

  const RACE_COUNTRY_MAP = {
    'Australie': 'Australia', 'Chine': 'China', 'Japon': 'Japan',
    'Bahreïn': 'Bahrain', 'Arabie Saoudite': 'Saudi Arabia',
    'Miami': 'United States', 'Émilie-Romagne': 'Italy', 'Monaco': 'Monaco',
    'Canada': 'Canada', 'Espagne': 'Spain', 'Autriche': 'Austria',
    'Grande-Bretagne': 'Great Britain', 'Belgique': 'Belgium',
    'Hongrie': 'Hungary', 'Pays-Bas': 'Netherlands', 'Italie': 'Italy',
    'Azerbaïdjan': 'Azerbaijan', 'Singapour': 'Singapore',
    'États-Unis': 'United States', 'Mexique': 'Mexico', 'Brésil': 'Brazil',
    'Las Vegas': 'United States', 'Qatar': 'Qatar', 'Abu Dhabi': 'Abu Dhabi',
  }

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
      // Step 1: resolve meeting_key
      let meetingKey = selectedRace.meeting_key ?? null
      if (!meetingKey) {
        const countryName = RACE_COUNTRY_MAP[selectedRace.name]
        if (!countryName) throw new Error(`Pays non mappé : "${selectedRace.name}"`)
        const mRes = await fetch(
          `https://api.openf1.org/v1/meetings?year=2026&country_name=${encodeURIComponent(countryName)}`
        )
        const meetings = await mRes.json()
        if (!meetings.length) throw new Error(`Aucune réunion OpenF1 pour ${selectedRace.name}`)
        meetingKey = meetings[0].meeting_key
      }

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
      setOpenf1ResultMsg({ type: 'success', text: 'Résultat récupéré — vérifiez avant de valider' })
    } catch (err) {
      setOpenf1ResultMsg({ type: 'error', text: err.message })
    } finally {
      setOpenf1ResultFetching(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tight">Administration</h1>
      </div>

      {/* ── SECTION ADMIN (custom claim gated) ── */}
      {adminCheckDone && isAdmin && (
        <div className="px-5 mb-5">
          <p className="section-title">Section Admin</p>

          {/* Auth header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-green-400 font-bold">✓ Accès administrateur</p>
          </div>

          {/* ── Résultats officiels ── */}
          <p className="section-title">Résultats officiels</p>
          <div className="space-y-2">
            {sortedRaces.map(race => (
              <div key={race.id} className="card p-3 flex items-center gap-3">
                <span className="text-xl">{race.flag}</span>
                <div className="flex-1">
                  <p className="font-bold text-sm">{race.name}</p>
                  <p className="text-xs text-muted">
                    {new Date(race.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </p>
                  {race.result && (
                    <p className="text-xs text-green-400 font-bold mt-0.5">
                      {race.result.P1} · {race.result.P2} · {race.result.P3}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openResultSheet(race)}
                    className="text-xs bg-accent/20 text-accent font-bold px-3 py-1.5 rounded-lg"
                  >
                    {race.result ? 'Modifier' : 'Résultat'}
                  </button>
                  {race.result && (
                    <button
                      onClick={() => resetRaceResult(race)}
                      className="text-xs text-muted font-bold px-3 py-1.5 rounded-lg border border-border"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── SYNCHRONISATION OPENF1 ── */}
          <div className="mt-6 rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-accent">⚡ Synchronisation OpenF1</p>
              {openf1Config?.lastSync && (
                <p className="text-[10px] text-muted">
                  Sync : {new Date(openf1Config.lastSync).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            {openf1Config?.driverCount != null && (
              <p className="text-xs text-muted">{openf1Config.driverCount} pilotes en base</p>
            )}
            <button
              onClick={syncDriversFromOpenF1}
              disabled={openf1Syncing}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-accent/30 bg-accent/10 active:opacity-70 text-left"
            >
              <span className="text-xl">{openf1Syncing ? '⏳' : '🔄'}</span>
              <div>
                <p className="font-bold text-sm">{openf1Syncing ? 'Synchronisation…' : 'Sync pilotes depuis OpenF1'}</p>
                <p className="text-xs text-muted">session_key={OPENF1_SESSION_KEY} · Grille 2026</p>
              </div>
            </button>
            {openf1SyncMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-lg ${
                openf1SyncMsg.type === 'success'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {openf1SyncMsg.type === 'success' ? '✓ ' : '✕ '}{openf1SyncMsg.text}
              </p>
            )}
          </div>

          {/* ── ZONE DANGEREUSE ── */}
          <div
            className="mt-4 rounded-2xl border p-4 space-y-3"
            style={{ backgroundColor: 'rgba(127,0,0,0.12)', borderColor: 'rgba(200,0,0,0.25)' }}
          >
            <p className="text-xs font-black uppercase tracking-widest text-red-400">⚠️ Zone Dangereuse</p>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={clearing}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-700/30 bg-red-900/20 active:opacity-70 text-left"
            >
              <span className="text-xl">🗑️</span>
              <div>
                <p className="font-bold text-sm text-red-400">{clearing ? 'Suppression…' : 'Vider la BDD'}</p>
                <p className="text-xs text-muted">Supprime tout — irréversible</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIRM MODALS ── */}
      <ConfirmModal
        isOpen={confirmClear}
        title="Vider la base de données ?"
        message="⚠️ Cette action supprimera définitivement tous les pronos, résultats et scores de la saison. IRRÉVERSIBLE. Es-tu sûr ?"
        confirmLabel={clearing ? 'Suppression…' : 'Tout supprimer'}
        danger
        onConfirm={handleClearDatabase}
        onCancel={() => setConfirmClear(false)}
      />

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet
        isOpen={resultSheetOpen}
        onClose={closeResultSheet}
        title={selectedRace ? `Résultat : GP ${selectedRace.name} ${selectedRace.flag}` : ''}
        fullHeight
      >
        {selectedRace && (
          <div className="p-5 pb-10 space-y-5">
            <p className="section-title">Podium officiel</p>

            {/* ── OpenF1 fetch button ── */}
            <button
              onClick={fetchResultFromOpenF1}
              disabled={openf1ResultFetching}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-accent/30 bg-accent/10 active:opacity-70 text-left"
            >
              <span className="text-xl">{openf1ResultFetching ? '⏳' : '⚡'}</span>
              <div>
                <p className="font-bold text-sm">{openf1ResultFetching ? 'Récupération…' : 'Récupérer depuis OpenF1'}</p>
                <p className="text-xs text-muted">Pré-remplit P1/P2/P3 automatiquement</p>
              </div>
            </button>
            {openf1ResultMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-lg -mt-2 ${
                openf1ResultMsg.type === 'success'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {openf1ResultMsg.type === 'success' ? '✓ ' : '✕ '}{openf1ResultMsg.text}
              </p>
            )}

            <div className="space-y-3">
              {['P1', 'P2', 'P3'].map((pos, i) => {
                const driver = resultDraft[pos]
                return (
                  <button
                    key={pos}
                    onClick={() => { setResultPosition(pos); setDriverPickerOpen(true) }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98]
                      ${driver ? 'border-accent/60 bg-accent/10' : 'border-dashed border-border'}
                    `}
                  >
                    <div className={`position-badge text-bg font-black text-sm shrink-0 ${
                      i === 0 ? 'bg-gold' : i === 1 ? 'bg-silver' : 'bg-bronze'
                    }`}>
                      {i + 1}
                    </div>
                    {driver ? (
                      <>
                        <span className="font-bold flex-1 text-left">{driver}</span>
                        <span className="text-muted text-sm" onClick={e => { e.stopPropagation(); setResultDraft(p => ({ ...p, [pos]: null })) }}>✕</span>
                      </>
                    ) : (
                      <span className="text-muted text-sm flex-1 text-left">Sélectionner le {pos}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={saveResult}
              disabled={!resultDraft.P1 || !resultDraft.P2 || !resultDraft.P3 || saving}
              className={`w-full py-4 rounded-xl font-black text-lg transition-all active:scale-95 ${
                resultDraft.P1 && resultDraft.P2 && resultDraft.P3 && !saving
                  ? 'bg-accent text-white shadow-glow-red'
                  : 'bg-surfaceHigh text-muted cursor-not-allowed'
              }`}
            >
              {saving ? 'Enregistrement...' : 'Valider le résultat'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={driverPickerOpen}
        onClose={() => { setDriverPickerOpen(false); setResultPosition(null) }}
        title={`Sélectionner ${resultPosition}`}
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
                      onClick={() => selectDriver(driver)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        isCurrent ? 'border-accent bg-accent/20' :
                        isSelected ? 'border-muted/30 bg-surfaceHigh/30 opacity-50' :
                        'border-border bg-surfaceHigh hover:border-muted'
                      }`}
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
    </div>
  )
}
