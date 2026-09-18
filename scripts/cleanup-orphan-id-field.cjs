/**
 * Supprime le champ résiduel `_id` (jamais utilisé par le code — le vrai
 * champ utilisé partout est `id`) sur les 4 documents players d'origine
 * (william, quentin, alex, romain) — pollution historique d'un ancien
 * script de migration. N'écrit rien via .set(), utilise exclusivement
 * .update() avec FieldValue.delete() ciblé sur ce seul champ.
 *
 * Idempotent : un document sans champ `_id` (déjà nettoyé, ou n'en ayant
 * jamais eu) est simplement ignoré, relançable sans risque.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs) avant de lancer.
 *
 * USAGE
 *   node scripts/cleanup-orphan-id-field.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const PLAYER_IDS = ['william', 'quentin', 'alex', 'romain'];

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Nettoyage du champ résiduel _id sur players/{william,quentin,alex,romain}\n');

  let cleaned = 0;
  let skipped = 0;

  for (const playerId of PLAYER_IDS) {
    process.stdout.write(`  → players/${playerId} ... `);
    const docRef = db.collection('players').doc(playerId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log('document introuvable, ignoré');
      skipped++;
      continue;
    }

    const data = doc.data();
    if (!('_id' in data)) {
      console.log('pas de champ _id, ignoré');
      skipped++;
      continue;
    }

    console.log(`_id actuel = ${JSON.stringify(data._id)}`);
    await docRef.update({ _id: admin.firestore.FieldValue.delete() });
    console.log(`      ✅ champ _id supprimé sur players/${playerId}`);
    cleaned++;
  }

  console.log(`\n📊 Résumé : ${cleaned} document(s) nettoyé(s), ${skipped} ignoré(s)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
