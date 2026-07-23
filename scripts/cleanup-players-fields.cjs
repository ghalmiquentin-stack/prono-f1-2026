/**
 * Retire les champs d'identité (displayName, avatar, color) des documents
 * "players", désormais portés par la collection "profiles".
 * ------------------------------------------------------------------
 * À lancer uniquement une fois que les écrans ont été validés sur la
 * nouvelle collection "profiles" (voir scripts/migrate-to-profiles.cjs).
 *
 * Par sécurité, un document players n'est nettoyé QUE si un profil
 * correspondant existe déjà dans "profiles" (profiles/{authUid}) — sinon
 * il est ignoré pour ne pas perdre son identité sans filet de secours.
 *
 * Ne touche à rien d'autre : leagueId, authUid et tous les autres champs
 * de jeu existants restent intacts.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - scripts/migrate-to-profiles.cjs déjà exécuté.
 *
 * USAGE
 *   node scripts/cleanup-players-fields.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const IDENTITY_FIELDS = ['displayName', 'avatar', 'color'];

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

  console.log('\n🧹 Nettoyage des champs d\'identité sur la collection "players"\n');

  const playersSnap = await db.collection('players').get();

  let playersCleaned = 0;
  let playersAlreadyClean = 0;
  let playersSkippedNoProfile = 0;
  let playersSkippedNoAuthUid = 0;

  for (const playerDoc of playersSnap.docs) {
    const playerData = playerDoc.data();
    const authUid = playerData.authUid;

    process.stdout.write(`  → ${playerDoc.id} ... `);

    if (!authUid) {
      console.log('⚠️  pas de authUid, ignoré');
      playersSkippedNoAuthUid++;
      continue;
    }

    const fieldsToRemove = IDENTITY_FIELDS.filter(field => field in playerData);
    if (fieldsToRemove.length === 0) {
      console.log('déjà propre, ignoré');
      playersAlreadyClean++;
      continue;
    }

    const profileSnap = await db.collection('profiles').doc(authUid).get();
    if (!profileSnap.exists) {
      console.log('⚠️  pas de profil correspondant dans "profiles", ignoré par sécurité');
      playersSkippedNoProfile++;
      continue;
    }

    const update = {};
    for (const field of fieldsToRemove) update[field] = admin.firestore.FieldValue.delete();
    await playerDoc.ref.update(update);
    playersCleaned++;
    console.log(`✅ nettoyé (${fieldsToRemove.join(', ')} retiré(s))`);
  }

  console.log('\n📊 Résumé :\n');
  console.log(`  players nettoyés                : ${playersCleaned}`);
  console.log(`  players déjà propres            : ${playersAlreadyClean}`);
  console.log(`  players ignorés (pas de profil)  : ${playersSkippedNoProfile}`);
  console.log(`  players ignorés (pas de authUid) : ${playersSkippedNoAuthUid}`);
  console.log('\nTerminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
