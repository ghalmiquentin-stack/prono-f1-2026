/**
 * Script de test JETABLE — crée un document races/9999 clonant name/city de
 * la vraie course Hongrie (déjà terminée, résultat déjà connu) pour tester
 * le chemin complet de autoFetchRaceResults (résolution OpenF1 via
 * fetchRaceResult + écriture du résultat) sans jamais toucher à une vraie
 * course de la saison.
 * TEMPORAIRE — à supprimer après usage, ne pas committer.
 *
 * N'écrit ni `result` ni `meeting_key` sur le document créé — le but est de
 * tester la résolution complète (country map → meetings → sessions →
 * session_result), pas un raccourci en cache.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/seed-test-race-for-auto-fetch.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const TEST_RACE_ID = 9999;
const TEST_RACE_DOC_ID = String(TEST_RACE_ID);
const START_OFFSET_MS = 2 * 60 * 60 * 1000 + 10 * 60 * 1000; // 2h10 — dépasse START_CHECKING_AFTER_MS (2h), loin de GIVE_UP_AFTER_MS (3h30)

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Création d\'une course jetable (id=9999) clonant Hongrie pour tester autoFetchRaceResults\n');

  // 1. Lire la vraie course Hongrie (terminée) pour récupérer name/city exacts.
  const hongrieSnap = await db.collection('races')
    .where('name', '==', 'Hongrie')
    .where('status', '==', 'completed')
    .get();

  if (hongrieSnap.empty) {
    console.error('❌ Aucune course "Hongrie" avec status "completed" trouvée. Arrêt, rien créé.');
    process.exit(1);
  }
  if (hongrieSnap.size > 1) {
    console.error(`❌ Ambiguïté : ${hongrieSnap.size} courses "Hongrie" completed trouvées. Arrêt, rien créé.`);
    process.exit(1);
  }

  const hongrieDoc = hongrieSnap.docs[0];
  const hongrie = hongrieDoc.data();
  console.log(`  → Course source : ${hongrie.name} (city=${hongrie.city}), doc id=${hongrieDoc.id}`);

  // 2. Vérifier que races/9999 n'existe pas déjà — ne jamais écraser.
  const existing = await db.collection('races').doc(TEST_RACE_DOC_ID).get();
  if (existing.exists) {
    console.error(`❌ Un document races/${TEST_RACE_DOC_ID} existe déjà. Arrêt, rien créé/écrasé.`);
    process.exit(1);
  }
  console.log(`  → races/${TEST_RACE_DOC_ID} confirmé libre.`);

  // 3. Créer le document jetable — status upcoming, raceStartAt déjà passé
  // de 2h10, pas de result, pas de meeting_key.
  const raceStartAt = admin.firestore.Timestamp.fromMillis(Date.now() - START_OFFSET_MS);

  await db.collection('races').doc(TEST_RACE_DOC_ID).set({
    id: TEST_RACE_ID,
    name: hongrie.name,
    city: hongrie.city,
    status: 'upcoming',
    raceStartAt,
  });

  console.log(`\n✅ Document jetable créé : races/${TEST_RACE_DOC_ID}`);
  console.log(`   id=${TEST_RACE_ID} (nombre), name="${hongrie.name}", city="${hongrie.city}", status="upcoming"`);
  console.log(`   raceStartAt=${raceStartAt.toDate().toISOString()} (maintenant − 2h10)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
