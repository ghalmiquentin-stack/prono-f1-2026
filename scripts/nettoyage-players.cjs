/**
 * Nettoyage ciblé de la collection "players".
 * ------------------------------------------------------------------
 * Deux actions précises, identifiées via scripts/inventaire-players.cjs :
 *   1. Supprime le document players/iGRMTttIgWHxzxv8aW2g — orphelin sans
 *      authUid.
 *   2. Retire le champ obsolète "nickname" (remplacé par la collection
 *      "profiles") sur les 4 documents historiques : alex, quentin,
 *      romain, william. Aucun autre champ de ces documents n'est touché.
 *
 * Affiche d'abord un aperçu complet de ce qui va être fait (sans rien
 * modifier), puis demande une confirmation explicite dans le terminal
 * avant d'exécuter quoi que ce soit. Par sécurité, si le document
 * orphelin possède finalement un authUid (ne correspond plus à un
 * orphelin), sa suppression est annulée automatiquement.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/nettoyage-players.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const ORPHAN_PLAYER_ID = 'iGRMTttIgWHxzxv8aW2g';
const HISTORIC_PLAYER_IDS = ['alex', 'quentin', 'romain', 'william'];
const CONFIRM_WORD = 'OUI';

async function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
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

  console.log('\n🧹 Nettoyage ciblé de la collection "players" — aperçu (aucune modification pour l\'instant)\n');

  // ── Étape 1 : préparation / vérification (lecture seule) ─────────────────
  const orphanRef = db.collection('players').doc(ORPHAN_PLAYER_ID);
  const orphanSnap = await orphanRef.get();

  let orphanRefToDelete = null;

  if (!orphanSnap.exists) {
    console.log(`  ⚠️  players/${ORPHAN_PLAYER_ID} introuvable — déjà supprimé ou id incorrect, ignoré.`);
  } else {
    const data = orphanSnap.data();
    if (data.authUid) {
      console.log(`  ⚠️  players/${ORPHAN_PLAYER_ID} a un authUid (${data.authUid}) — ne correspond plus à`);
      console.log('      un orphelin attendu, suppression ANNULÉE par sécurité.');
    } else {
      orphanRefToDelete = orphanRef;
      console.log(`  🗑️  players/${ORPHAN_PLAYER_ID} sera SUPPRIMÉ (aucun authUid, orphelin).`);
      console.log(`      leagueId actuel : ${data.leagueId ?? '(absent)'}`);
    }
  }

  console.log('');

  const nicknameActions = [];
  for (const playerId of HISTORIC_PLAYER_IDS) {
    const ref = db.collection('players').doc(playerId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  ⚠️  players/${playerId} introuvable, ignoré.`);
      continue;
    }

    const data = snap.data();
    if ('nickname' in data) {
      nicknameActions.push({ playerId, ref });
      console.log(`  ✂️  players/${playerId} : champ "nickname" (valeur actuelle : "${data.nickname}") sera retiré.`);
    } else {
      console.log(`  ✔️  players/${playerId} : pas de champ "nickname", rien à faire.`);
    }
  }

  console.log('\n📋 Résumé des actions prévues :\n');
  console.log(`   - suppression du document orphelin : ${orphanRefToDelete ? '1' : '0'}`);
  console.log(`   - retrait du champ "nickname"       : ${nicknameActions.length} document(s)`);

  if (!orphanRefToDelete && nicknameActions.length === 0) {
    console.log('\n✅ Rien à faire, la collection est déjà propre. Aucune modification effectuée.\n');
    return;
  }

  // ── Étape 2 : confirmation explicite ──────────────────────────────────────
  const answer = await askConfirmation(
    `\n⚠️  Cette action est irréversible. Taper "${CONFIRM_WORD}" pour confirmer, ou toute autre touche pour annuler : `
  );

  if (answer.trim() !== CONFIRM_WORD) {
    console.log('\n❌ Annulé — aucune donnée n\'a été modifiée.\n');
    return;
  }

  // ── Étape 3 : exécution ────────────────────────────────────────────────────
  console.log('\n⏳ Exécution...\n');

  if (orphanRefToDelete) {
    await orphanRefToDelete.delete();
    console.log(`  ✅ players/${ORPHAN_PLAYER_ID} supprimé.`);
  }

  for (const { playerId, ref } of nicknameActions) {
    await ref.update({ nickname: admin.firestore.FieldValue.delete() });
    console.log(`  ✅ champ "nickname" retiré de players/${playerId}.`);
  }

  console.log('\nTerminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
