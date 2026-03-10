import { doc, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { RACES } from './races'

export const PLAYERS = [
  { id: 'william', displayName: 'William', color: '#3B82F6', avatar: '🏎️' },
  { id: 'quentin', displayName: 'Quentin', color: '#22C55E', avatar: '🏁' },
  { id: 'alex',    displayName: 'Alex',    color: '#F97316', avatar: '🔥' },
  { id: 'romain',  displayName: 'Romain',  color: '#A855F7', avatar: '⚡' },
]

// Seed race 1 result and predictions
const RACE1_RESULT = { P1: 'Russell', P2: 'Antonelli', P3: 'Leclerc' }

const RACE1_PREDICTIONS = [
  {
    id: 'william_1',
    playerId: 'william',
    raceId: 1,
    prediction: { P1: 'Russell', P2: 'Antonelli', P3: 'Piastri' },
    submittedAt: new Date('2026-03-07T10:00:00Z'),
    locked: true,
  },
  {
    id: 'quentin_1',
    playerId: 'quentin',
    raceId: 1,
    prediction: { P1: 'Hamilton', P2: 'Russell', P3: 'Leclerc' },
    submittedAt: new Date('2026-03-07T12:00:00Z'),
    locked: true,
  },
  {
    id: 'alex_1',
    playerId: 'alex',
    raceId: 1,
    prediction: { P1: 'Russell', P2: 'Leclerc', P3: 'Verstappen' },
    submittedAt: new Date('2026-03-07T14:00:00Z'),
    locked: true,
  },
  {
    id: 'romain_1',
    playerId: 'romain',
    raceId: 1,
    prediction: { P1: 'Russell', P2: 'Leclerc', P3: 'Antonelli' },
    submittedAt: new Date('2026-03-07T16:00:00Z'),
    locked: true,
  },
]

const RACE1_PENALTIES = [
  { id: 'pen_william_1', playerId: 'william', raceId: 1, type: 'change' },
  { id: 'pen_romain_1',  playerId: 'romain',  raceId: 1, type: 'change' },
]

export async function seedDatabase() {
  const batch = writeBatch(db)

  // Seed players
  for (const player of PLAYERS) {
    const ref = doc(db, 'players', player.id)
    batch.set(ref, player)
  }

  // Seed races
  for (const race of RACES) {
    const raceData = { ...race }
    if (race.id === 1) {
      raceData.status = 'completed'
      raceData.result = RACE1_RESULT
    }
    const ref = doc(db, 'races', String(race.id))
    batch.set(ref, raceData)
  }

  // Seed predictions
  for (const pred of RACE1_PREDICTIONS) {
    const ref = doc(db, 'predictions', pred.id)
    batch.set(ref, {
      ...pred,
      submittedAt: pred.submittedAt,
    })
  }

  // Seed penalties
  for (const pen of RACE1_PENALTIES) {
    const ref = doc(db, 'penalties', pen.id)
    batch.set(ref, pen)
  }

  await batch.commit()
  return true
}

export async function clearDatabase() {
  const collections = ['players', 'races', 'predictions', 'penalties']
  for (const col of collections) {
    const snap = await getDocs(collection(db, col))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}
