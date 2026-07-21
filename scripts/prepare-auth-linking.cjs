/**
 * Prépare la collection "players" pour l'authentification Firebase.
 * ------------------------------------------------------------------
 * Ajoute le champ `authUid: null` aux 4 documents joueurs existants
 * (william, quentin, alex, romain) sans toucher à aucune autre donnée.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/prepare-auth-linking.cjs
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

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  console.log('\n🔗 Préparation du rattachement auth pour la collection "players"\n');

  for (const playerId of PLAYER_IDS) {
    process.stdout.write(`  → ${playerId} ... `);
    try {
      const ref = db.collection('players').doc(playerId);
      const snap = await ref.get();

      if (!snap.exists) {
        console.log('⚠️  document introuvable, ignoré');
        continue;
      }

      if ('authUid' in snap.data()) {
        console.log('déjà présent, ignoré');
        continue;
      }

      await ref.update({ authUid: null });
      console.log('✅ authUid: null ajouté');
    } catch (err) {
      console.log(`❌ erreur : ${err.message}`);
    }
  }

  console.log('\nTerminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
