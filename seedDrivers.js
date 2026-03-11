#!/usr/bin/env node
// Seed Firebase `drivers` collection from OpenF1 API
// Usage: node seedDrivers.js
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

// ── OpenF1 session to fetch (Australia 2026 Race) ────────────────────────────
const SESSION_KEY = 11234

// ── Helpers ───────────────────────────────────────────────────────────────────
const toTitle = s =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null

const toTitleAll = s =>
  s ? s.split(' ').map(toTitle).join(' ') : null

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏎️  Fetching F1 2026 drivers from OpenF1...')

  const res = await fetch(
    `https://api.openf1.org/v1/drivers?session_key=${SESSION_KEY}`
  )
  if (!res.ok) throw new Error(`OpenF1 API error: ${res.status} ${res.statusText}`)

  const rawDrivers = await res.json()
  console.log(`   Found ${rawDrivers.length} drivers\n`)

  const app = initializeApp(firebaseConfig)
  const db  = getFirestore(app)

  let count = 0
  for (const d of rawDrivers) {
    // display_name = title-cased last name — matches the format used in predictions/results
    const displayName = toTitle(d.last_name)
    const fullName    = toTitleAll(d.full_name)

    const data = {
      driver_number: d.driver_number,
      full_name:     fullName,
      first_name:    toTitle(d.first_name),
      last_name:     toTitle(d.last_name),
      display_name:  displayName,
      name_acronym:  d.name_acronym ?? null,
      team_name:     d.team_name    ?? null,
      team_colour:   d.team_colour  ? `#${d.team_colour}` : null,
      headshot_url:  d.headshot_url ?? null,
      session_key:   SESSION_KEY,
      syncedAt:      new Date().toISOString(),
    }

    await setDoc(doc(db, 'drivers', String(d.driver_number)), data)
    console.log(
      `   ✓ #${String(d.driver_number).padStart(2)}  ${(d.name_acronym ?? '???').padEnd(3)}  ${String(fullName).padEnd(22)}  ${d.team_name}`
    )
    count++
  }

  // Store sync metadata
  await setDoc(doc(db, 'config', 'openf1'), {
    lastSync:    new Date().toISOString(),
    sessionKey:  SESSION_KEY,
    driverCount: count,
  })

  console.log(`\n✅ Seeded ${count} drivers into Firebase (collection: drivers)`)
  console.log('   Sync metadata written to config/openf1\n')
  process.exit(0)
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
