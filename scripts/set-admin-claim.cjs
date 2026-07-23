/**
 * Attribue le rôle admin à un compte Firebase Auth via un custom claim.
 * ----------------------------------------------------------------------
 * Ajoute { admin: true } aux custom claims du compte dont l'UID est
 * passé en argument.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/set-admin-claim.cjs UID_ICI
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

async function main() {
  const uid = process.argv[2];

  if (!uid) {
    console.error('❌ Usage : node scripts/set-admin-claim.cjs UID_ICI');
    process.exit(1);
  }

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log(`\n🔑 Attribution du rôle admin à l'utilisateur : ${uid}\n`);

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });

    console.log('✅ Rôle admin attribué avec succès !\n');
    console.log('⚠️  Important : l\'utilisateur concerné doit se déconnecter puis');
    console.log('   se reconnecter (déconnexion + reconnexion complète) pour que');
    console.log('   son jeton d\'authentification soit rafraîchi et que le rôle');
    console.log('   admin soit effectivement pris en compte par l\'application.\n');
  } catch (err) {
    console.error(`❌ Erreur lors de l'attribution du rôle : ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
