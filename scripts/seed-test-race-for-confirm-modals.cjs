/**
 * Script de test JETABLE — crée un document races/9997 (status `completed`,
 * avec un résultat déjà renseigné) pour tester en sécurité les deux
 * ConfirmModal de ReglagesSuperAdmin.jsx (Reset et écrasement d'un résultat
 * officiel) sans jamais toucher à une vraie course de la saison.
 * TEMPORAIRE — à supprimer après usage (voir le script de suppression
 * jumeau ou une suppression manuelle du document), ne pas committer.
 *
 * Clone name/flag/city/circuit d'une vraie course terminée (Australie) pour
 * un rendu réaliste dans la liste Administration, avec un id hors plage
 * (9997) pour ne jamais entrer en collision avec une vraie course.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/seed-test-race-for-confirm-modals.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const TEST_RACE_ID = 9997;
const TEST_RACE_DOC_ID = String(TEST_RACE_ID);

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(`\n🧪 Création d'une course jetable (id=${TEST_RACE_ID}) pour tester les ConfirmModal Reset/écrasement\n`);

  // 1. Lire une vraie course terminée pour récupérer un rendu réaliste.
  const sourceSnap = await db.collection('races')
    .where('name', '==', 'Australie')
    .where('status', '==', 'completed')
    .get();

  if (sourceSnap.empty) {
    console.error('❌ Aucune course "Australie" avec status "completed" trouvée. Arrêt, rien créé.');
    process.exit(1);
  }
  if (sourceSnap.size > 1) {
    console.error(`❌ Ambiguïté : ${sourceSnap.size} courses "Australie" completed trouvées. Arrêt, rien créé.`);
    process.exit(1);
  }

  const source = sourceSnap.docs[0].data();
  console.log(`  → Course source (clonage name/flag/city/circuit) : ${source.name}, doc id=${sourceSnap.docs[0].id}`);

  // 2. Vérifier que le doc de test n'existe pas déjà — ne jamais écraser.
  const existing = await db.collection('races').doc(TEST_RACE_DOC_ID).get();
  if (existing.exists) {
    console.error(`❌ Un document races/${TEST_RACE_DOC_ID} existe déjà. Arrêt, rien créé/écrasé.`);
    process.exit(1);
  }
  console.log(`  → races/${TEST_RACE_DOC_ID} confirmé libre.`);

  // 3. Créer le document jetable — status completed, résultat déjà rempli,
  // pour pouvoir tester immédiatement Reset puis l'écrasement.
  const raceStartAt = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000); // il y a 7 jours

  await db.collection('races').doc(TEST_RACE_DOC_ID).set({
    id: TEST_RACE_ID,
    name: `${source.name} (TEST jetable)`,
    flag: source.flag,
    city: source.city,
    circuit: source.circuit,
    date: new Date(raceStartAt.toMillis()).toISOString().slice(0, 10),
    status: 'completed',
    result: { P1: 'Russell', P2: 'Antonelli', P3: 'Leclerc' },
    resultSource: 'manual',
    raceStartAt,
  });

  console.log(`\n✅ Document jetable créé : races/${TEST_RACE_DOC_ID}`);
  console.log(`   id=${TEST_RACE_ID} (nombre), name="${source.name} (TEST jetable)", status="completed"`);
  console.log(`   result={P1:Russell, P2:Antonelli, P3:Leclerc}`);
  console.log(`\n⚠️  À supprimer après le test : db.collection('races').doc('${TEST_RACE_DOC_ID}').delete()\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
