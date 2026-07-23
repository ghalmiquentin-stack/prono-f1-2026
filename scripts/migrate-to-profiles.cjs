/**
 * Crée la collection "profiles" (identité) à partir des documents "players"
 * existants, sans toucher à ces derniers.
 * ------------------------------------------------------------------
 * Pour chaque document existant de "players" ayant un authUid, crée un
 * document dans une nouvelle collection "profiles" (id = authUid du joueur)
 * contenant { displayName, avatar, color } repris du document players.
 *
 * Idempotent : un profil déjà existant pour un authUid donné n'est jamais
 * écrasé. Les documents players ne sont pas modifiés à cette étape — ils
 * gardent tous leurs champs actuels intacts (displayName, avatar, color
 * compris). Le nettoyage de ces champs sur players se fait plus tard via
 * scripts/cleanup-players-fields.cjs, une fois les écrans validés sur la
 * nouvelle collection profiles.
 *
 * Un document players sans authUid (profil jamais rattaché) est ignoré :
 * impossible de créer un profil sans clé.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/migrate-to-profiles.cjs
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

  console.log('\n🪪 Création des profils à partir des documents players\n');

  const playersSnap = await db.collection('players').get();

  let profilesCreated = 0;
  let profilesAlreadyExisting = 0;
  let playersSkippedNoAuthUid = 0;

  for (const playerDoc of playersSnap.docs) {
    const playerData = playerDoc.data();
    const authUid = playerData.authUid;

    process.stdout.write(`  → ${playerDoc.id} ... `);

    if (!authUid) {
      console.log('⚠️  pas de authUid, ignoré (profil jamais rattaché)');
      playersSkippedNoAuthUid++;
      continue;
    }

    const profileRef = db.collection('profiles').doc(authUid);
    const profileSnap = await profileRef.get();

    if (profileSnap.exists) {
      profilesAlreadyExisting++;
      console.log('profil déjà existant, non écrasé');
      continue;
    }

    const profileData = {};
    for (const field of IDENTITY_FIELDS) {
      if (playerData[field] !== undefined) profileData[field] = playerData[field];
    }
    await profileRef.set(profileData);
    profilesCreated++;
    console.log('✅ profil créé');
  }

  console.log('\n📊 Résumé :\n');
  console.log(`  profiles créés            : ${profilesCreated}`);
  console.log(`  profiles déjà existants   : ${profilesAlreadyExisting}`);
  console.log(`  players ignorés (no uid)  : ${playersSkippedNoAuthUid}`);
  console.log('\nTerminé. Les documents players n\'ont pas été modifiés.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
