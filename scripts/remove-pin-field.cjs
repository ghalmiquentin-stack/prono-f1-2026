/**
 * Supprime le champ "pin" désormais inutile (système de PIN retiré au
 * profit de l'authentification Firebase) sur tous les documents de la
 * collection "players", sans toucher à aucune autre donnée.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/remove-pin-field.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

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

  console.log('\n🧹 Suppression du champ "pin" sur la collection "players"\n');

  const snap = await db.collection('players').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    process.stdout.write(`  → ${doc.id} ... `);
    if (!('pin' in doc.data())) {
      console.log('pas de champ pin, ignoré');
      skipped++;
      continue;
    }
    await doc.ref.update({ pin: admin.firestore.FieldValue.delete() });
    console.log('✅ champ pin supprimé');
    updated++;
  }

  console.log(`\n📊 Résumé : ${snap.size} document(s) au total, ${updated} nettoyé(s), ${skipped} déjà propre(s)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
