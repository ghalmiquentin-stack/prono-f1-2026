/**
 * Script de test JETABLE — crée (ou supprime) une course `upcoming` dont le
 * départ tombe dans quelques minutes, pour observer EN DIRECT le passage du
 * verrou au départ côté interface (Accueil, Courses, PredictionSheet,
 * Countdown) sans jamais toucher à une vraie course.
 * TEMPORAIRE — à supprimer après usage (mode `delete`), ne pas committer.
 *
 * Choix de conception :
 *   - id = -1 : Accueil prend la PREMIÈRE course `upcoming` par id croissant
 *     (nextRace) ; seul un id inférieur à toutes les vraies courses la fait
 *     apparaître sur l'Accueil. (Les autres seeds jetables utilisent 99xx et
 *     n'y apparaissent donc jamais.)
 *   - date + raceTimeUTC sont dérivés de raceStartAt arrondi à la minute :
 *     le client calcule le départ avec `date + raceTimeUTC`, la règle
 *     Firestore avec `raceStartAt` — ils doivent désigner le même instant.
 *   - name volontairement non mappable vers un meeting OpenF1, pour que les
 *     Cloud Functions autoFetch* ne puissent rien en tirer.
 *
 * ⚠️  La collection `races` est globale : tant que ce document existe, il
 * est visible de TOUS les joueurs de TOUTES les ligues (et devient le
 * "prochain GP" de l'Accueil). Garder sa durée de vie la plus courte
 * possible et le supprimer dès la fin du test.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/seed-test-race-for-start-lock.cjs create [minutes=65]
 *     minutes = délai avant le départ. 65 => T-1h dans 5 min puis T 60 min
 *     plus tard ; pour voir les DEUX bascules vite, utiliser 8 (T-1h déjà
 *     dépassé : indicateur "dernière heure" immédiat, départ dans 8 min).
 *   node scripts/seed-test-race-for-start-lock.cjs delete
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const TEST_RACE_ID = -1;
const TEST_RACE_DOC_ID = String(TEST_RACE_ID);
const TEST_RACE_NAME = 'TEST verrou depart (jetable)';

async function main() {
  const mode = process.argv[2];
  if (mode !== 'create' && mode !== 'delete') {
    console.error('Usage : node scripts/seed-test-race-for-start-lock.cjs create [minutes] | delete');
    process.exit(1);
  }
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
  const db = admin.firestore();
  const ref = db.collection('races').doc(TEST_RACE_DOC_ID);

  if (mode === 'delete') {
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`ℹ️  races/${TEST_RACE_DOC_ID} n'existe pas, rien à supprimer.`);
      return;
    }
    if (snap.data().name !== TEST_RACE_NAME) {
      console.error(`❌ races/${TEST_RACE_DOC_ID} n'a pas le nom attendu ("${snap.data().name}"). Suppression refusée.`);
      process.exit(1);
    }
    await ref.delete();
    console.log(`✅ races/${TEST_RACE_DOC_ID} supprimé.`);
    console.log('   Penser à supprimer aussi les éventuels pronostics de test (collection predictions, raceId === -1).');
    return;
  }

  const minutes = Number(process.argv[3] ?? 65);
  if (!Number.isFinite(minutes) || minutes < 2 || minutes > 180) {
    console.error('❌ minutes doit être un nombre entre 2 et 180.');
    process.exit(1);
  }

  const existing = await ref.get();
  if (existing.exists) {
    console.error(`❌ Un document races/${TEST_RACE_DOC_ID} existe déjà. Arrêt, rien créé/écrasé.`);
    process.exit(1);
  }

  // Arrondi à la minute : date + raceTimeUTC (HH:MM) doivent redonner
  // exactement raceStartAt.
  const startMs = Math.round((Date.now() + minutes * 60 * 1000) / 60000) * 60000;
  const iso = new Date(startMs).toISOString(); // 2026-10-12T14:37:00.000Z

  await ref.set({
    id: TEST_RACE_ID,
    name: TEST_RACE_NAME,
    flag: '🏁',
    city: 'Test',
    circuit: 'Circuit de test',
    date: iso.slice(0, 10),
    raceTimeUTC: iso.slice(11, 16),
    status: 'upcoming',
    raceStartAt: admin.firestore.Timestamp.fromMillis(startMs),
  });

  console.log(`✅ Course jetable créée : races/${TEST_RACE_DOC_ID} (status upcoming)`);
  console.log(`   Départ (UTC) : ${iso}`);
  console.log(`   Départ (Paris) : ${new Date(startMs).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  console.log(`   Passage "dernière heure" : ${new Date(startMs - 3600000).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })} (Paris)`);
  console.log('\n⚠️  Visible de tous les joueurs tant qu\'elle existe. Suppression : node scripts/seed-test-race-for-start-lock.cjs delete\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
