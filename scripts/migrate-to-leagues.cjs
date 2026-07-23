/**
 * Migration vers le modèle multi-ligues — Phase 2 (1/plusieurs).
 * ------------------------------------------------------------------
 * 1. Crée un document dans la collection "leagues" ("Bro League 2026")
 *    avec un code d'invitation aléatoire, en admin le compte Firebase
 *    Auth déjà rattaché au profil joueur "quentin".
 * 2. Ajoute le champ `leagueId` (id de cette ligue) sur les 4 documents
 *    existants de "players", et sur tous les documents existants de
 *    "predictions" et "penalties".
 *
 * Idempotent : un document qui a déjà un champ `leagueId` n'est pas modifié.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Le profil joueur "quentin" doit déjà avoir un champ `authUid` non vide
 *     (voir scripts/prepare-auth-linking.cjs + rattachement via l'app).
 *
 * USAGE
 *   node scripts/migrate-to-leagues.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateLeagueCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function tagCollectionWithLeague(db, collectionName, leagueId) {
  const snap = await db.collection(collectionName).get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    if ('leagueId' in doc.data()) {
      skipped++;
      continue;
    }
    await doc.ref.update({ leagueId });
    updated++;
  }

  return { total: snap.size, updated, skipped };
}

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

  console.log('\n🏆 Migration vers le modèle multi-ligues\n');

  // ── 1. Résoudre l'UID du compte rattaché au profil "quentin" ────────────
  const quentinRef = db.collection('players').doc('quentin');
  const quentinSnap = await quentinRef.get();

  if (!quentinSnap.exists) {
    console.error('❌ Le profil "quentin" est introuvable dans la collection "players".');
    process.exit(1);
  }

  const quentinUid = quentinSnap.data().authUid;

  if (!quentinUid) {
    console.error('❌ Le profil "quentin" n\'a pas encore de champ authUid renseigné.');
    console.error('   Rattachez d\'abord ce profil à un compte Firebase Auth via l\'app.');
    process.exit(1);
  }

  console.log(`  → Compte admin résolu : quentin → ${quentinUid}\n`);

  // ── 2. Créer le document de ligue ────────────────────────────────────────
  const leagueRef = db.collection('leagues').doc();
  const leagueCode = generateLeagueCode();

  const leagueData = {
    name: 'Bro League 2026',
    code: leagueCode,
    adminUids: [quentinUid],
    rules: {
      modificationPenalty: { enabled: true, amount: 5 },
      postQualifsPenalty: { enabled: true, amount: 10 },
    },
    maxPlayers: 20,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: quentinUid,
  };

  await leagueRef.set(leagueData);
  console.log(`✅ Ligue créée : "${leagueData.name}" (id: ${leagueRef.id}, code: ${leagueCode})\n`);

  // ── 3. Tagger players / predictions / penalties avec leagueId ───────────
  console.log('🔗 Rattachement des documents existants à la ligue...\n');

  const results = {};
  for (const collectionName of ['players', 'predictions', 'penalties']) {
    results[collectionName] = await tagCollectionWithLeague(db, collectionName, leagueRef.id);
  }

  console.log('📊 Résumé :\n');
  for (const [collectionName, { total, updated, skipped }] of Object.entries(results)) {
    console.log(`  ${collectionName.padEnd(12)} → ${total} document(s) au total, ${updated} mis à jour, ${skipped} déjà migré(s)`);
  }

  console.log('\nTerminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
