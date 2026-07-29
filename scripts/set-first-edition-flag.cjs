/**
 * Pose le champ `firstEdition: true` sur les Grands Prix qui n'ont pas de
 * données historiques (nouveau circuit), en remplacement de la vérification
 * par nom en dur (`currentRace.name === 'Espagne (Madrid)'`) qui existait
 * dans PredictionSheet.jsx — désormais lu dynamiquement depuis le document
 * de la course, sans avoir à modifier le code à chaque nouvelle course de
 * ce type.
 *
 * Ne touche à aucun autre champ des documents concernés (merge: true).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs).
 *
 * USAGE
 *   node scripts/set-first-edition-flag.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

const RACE_IDS = [16, 17.5]; // Espagne (Madrid), Bahreïn (Sepang)

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  console.log('\n🆕 Pose du champ firstEdition: true\n');

  for (const raceId of RACE_IDS) {
    const ref = db.collection('races').doc(String(raceId));
    const existing = await ref.get();
    if (!existing.exists) {
      console.error(`❌ races/${raceId} introuvable — ignoré.`);
      continue;
    }
    console.log(`  → races/${raceId} (${existing.data().name})`);
    await ref.set({ firstEdition: true }, { merge: true });
    console.log(`  ✅ firstEdition: true posé\n`);
  }

  console.log('✅ Terminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
