#!/usr/bin/env node
// Seed Firebase `races_history` collection with 2025 podium + pole data
// Usage: node seedHistory.js
// Requires: .env file with VITE_FIREBASE_* variables in the project root

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

// ── Parse .env ────────────────────────────────────────────────────────────────
const envRaw = readFileSync(new URL('./.env', import.meta.url), 'utf-8')
const env = Object.fromEntries(
  envRaw
    .split('\n')
    .filter(line => /^[A-Z_]+=/.test(line.trim()))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toTitle = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null
const toTitleAll = s => s ? s.split(' ').map(toTitle).join(' ') : null

function formatLapDuration(seconds) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function openf1(path, retries = 3) {
  await sleep(2000)
  const res = await fetch(`https://api.openf1.org/v1${path}`)
  if (res.status === 429 && retries > 0) {
    await sleep(5000)
    return openf1(path, retries - 1)
  }
  if (!res.ok) throw new Error(`OpenF1 error ${res.status}: ${path}`)
  return res.json()
}

// ── 2026 race list with 2025 matching config ──────────────────────────────────
// country_name: OpenF1 country_name for 2025
// location_filter: optional string to match meeting_official_name or location
// new_circuit: true if no 2025 equivalent exists
const RACES_2026 = [
  { id:  1, name: 'Australie',        country: 'Australia' },
  { id:  2, name: 'Chine',            country: 'China' },
  { id:  3, name: 'Japon',            country: 'Japan' },
  { id:  4, name: 'Bahreïn',          country: 'Bahrain' },
  { id:  5, name: 'Arabie Saoudite',  country: 'Saudi Arabia' },
  { id:  6, name: 'Miami',            country: 'United States', location: 'Miami' },
  { id:  7, name: 'Canada',           country: 'Canada' },
  { id:  8, name: 'Monaco',           country: 'Monaco' },
  { id:  9, name: 'Espagne',          country: 'Spain', location: 'Barcelona' },
  { id: 10, name: 'Autriche',         country: 'Austria' },
  { id: 11, name: 'Grande-Bretagne',  country: 'United Kingdom' },
  { id: 12, name: 'Belgique',         country: 'Belgium' },
  { id: 13, name: 'Hongrie',          country: 'Hungary' },
  { id: 14, name: 'Pays-Bas',         country: 'Netherlands' },
  { id: 15, name: 'Italie',           country: 'Italy' },
  { id: 16, name: 'Espagne (Madrid)', new_circuit: true },
  { id: 17, name: 'Azerbaïdjan',      country: 'Azerbaijan' },
  { id: 18, name: 'Singapour',        country: 'Singapore' },
  { id: 19, name: 'États-Unis',       country: 'United States', location: 'Austin' },
  { id: 20, name: 'Mexique',          country: 'Mexico' },
  { id: 21, name: 'Brésil',           country: 'Brazil' },
  { id: 22, name: 'Las Vegas',        country: 'United States', location: 'Las Vegas' },
  { id: 23, name: 'Qatar',            country: 'Qatar' },
  { id: 24, name: 'Abu Dhabi',        country: 'United Arab Emirates' },
]

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const app = initializeApp(firebaseConfig)
  const db  = getFirestore(app)

  for (const race of RACES_2026) {
    const label = `GP ${race.name}`

    if (race.new_circuit) {
      console.log(`🆕 ${label} → Première édition (skipped)`)
      continue
    }

    try {
      // Find 2025 meeting
      const meetings = await openf1(`/meetings?year=2025&country_name=${encodeURIComponent(race.country)}`)
      if (!meetings.length) {
        console.log(`⚠️  ${label} → No 2025 meeting found for country "${race.country}"`)
        continue
      }

      // Filter out testing events
      const raceMeetings = meetings.filter(m =>
        !m.meeting_name?.toLowerCase().includes('test') &&
        !m.meeting_official_name?.toLowerCase().includes('test')
      )
      if (!raceMeetings.length) {
        console.log(`⚠️  ${label} → No race meeting found (only testing) for "${race.country}"`)
        continue
      }
      let meeting = raceMeetings[0]
      if (race.location && raceMeetings.length > 1) {
        const filtered = raceMeetings.filter(m =>
          m.location?.toLowerCase().includes(race.location.toLowerCase()) ||
          m.meeting_official_name?.toLowerCase().includes(race.location.toLowerCase())
        )
        if (filtered.length) meeting = filtered[0]
      }

      // ── Race session ──────────────────────────────────────────────────────
      let raceSessions = await openf1(`/sessions?meeting_key=${meeting.meeting_key}&session_name=Race`)
      if (!raceSessions?.length) {
        raceSessions = await openf1(`/sessions?meeting_key=${meeting.meeting_key}&session_name=Grand Prix`)
      }
      const raceSession = raceSessions?.[0]
      if (!raceSession) {
        console.log(`⚠️  ${label} → No Race session found`)
        continue
      }

      // Fetch 2025 drivers from this specific session for accurate number→name mapping
      const sessionDrivers = await openf1(`/drivers?session_key=${raceSession.session_key}`)
      function resolveDriver(driverNumber) {
        const d = sessionDrivers.find(d => d.driver_number === driverNumber)
        if (!d) return { name: String(driverNumber), team: null, driver_number: driverNumber }
        return {
          name: toTitle(d.last_name),
          team: d.team_name ?? null,
          driver_number: driverNumber,
        }
      }

      const raceResults = await openf1(`/session_result?session_key=${raceSession.session_key}&position<=3`)
      raceResults.sort((a, b) => Number(a.position) - Number(b.position))

      const podium = {}
      ;['P1', 'P2', 'P3'].forEach((pos, i) => {
        const entry = raceResults.find(r => Number(r.position) === i + 1)
        podium[pos] = entry ? resolveDriver(entry.driver_number) : null
      })

      // ── Qualifying session ────────────────────────────────────────────────
      const qualSessions = await openf1(`/sessions?meeting_key=${meeting.meeting_key}&session_name=Qualifying`)
      const qualSession = qualSessions?.[0]

      let pole = null
      if (qualSession) {
        const grid = await openf1(`/starting_grid?session_key=${qualSession.session_key}&position=1`)
        const poleEntry = grid?.[0]
        if (poleEntry) {
          const driverData = resolveDriver(poleEntry.driver_number)
          pole = {
            ...driverData,
            lap_duration: formatLapDuration(poleEntry.lap_duration),
          }
        }
      }

      // ── Store in Firebase ─────────────────────────────────────────────────
      await setDoc(doc(db, 'races_history', String(race.id)), {
        podium_2025: podium,
        pole_2025:   pole,
        meeting_key_2025: meeting.meeting_key,
        seededAt: new Date().toISOString(),
      })

      const p1 = podium.P1?.name ?? '?'
      const poleName = pole?.name ?? '?'
      console.log(`✅ ${label.padEnd(26)} P1: ${p1.padEnd(12)} Pole: ${poleName}`)

    } catch (err) {
      console.log(`❌ ${label} → ${err.message}`)
    }
  }

  console.log('\n✅ Done seeding races_history\n')
  process.exit(0)
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message)
  process.exit(1)
})
