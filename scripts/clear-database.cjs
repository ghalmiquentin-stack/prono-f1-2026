/**
 * Vide ENTIÈREMENT les collections players, races, predictions, penalties
 * — reprend la logique qui vivait dans clearDatabase() (src/data/seed.js,
 * depuis supprimé : devenu orphelin une fois ce bouton retiré de l'UI),
 * portée sur le SDK admin avec suppression découpée par lots de 500
 * documents maximum (limite Firestore par batch). Remplace le bouton
 * "Vider la BDD" retiré de l'écran Administration (ReglagesSuperAdmin.jsx,
 * "Zone Dangereuse") : cette capacité reste disponible pour le
 * super-admin, mais plus jamais en un tap depuis le navigateur —
 * uniquement via ce script manuel, comme toutes les autres opérations
 * destructrices du projet.
 *
 * Même périmètre que l'implémentation existante qu'il remplace : ne touche
 * PAS à profiles/leagues/drivers/config/races_history.
 *
 * ⚠️  ACTION IRRÉVERSIBLE — vide TOUTE la base, TOUTES LIGUES CONFONDUES,
 *     pas une ligue en particulier.
 *
 * PRÉREQUIS OBLIGATOIRE
 *   - Un backup Firestore FRAIS doit avoir été fait AVANT de lancer ce
 *     script : node backup-firestore.cjs — jamais après coup, un backup
 *     fait une fois les données supprimées ne sert à rien.
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * CONFIRMATION
 *   Ce script ne s'exécute jamais silencieusement. Il affiche un
 *   avertissement explicite puis exige de taper le mot exact CONFIRMER
 *   (majuscules, aucune variante acceptée) — toute autre saisie annule
 *   l'opération sans rien toucher à la base.
 *
 * USAGE
 *   node scripts/clear-database.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const COLLECTIONS_TO_CLEAR = ['players', 'races', 'predictions', 'penalties'];
const CONFIRMATION_WORD = 'CONFIRMER';
const BATCH_SIZE = 500; // limite Firestore : au plus 500 opérations par batch

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  console.log('\n⚠️  ⚠️  ⚠️   ATTENTION — SUPPRESSION IRRÉVERSIBLE   ⚠️  ⚠️  ⚠️\n');
  console.log('Ce script va supprimer DÉFINITIVEMENT tous les documents des');
  console.log('collections suivantes, TOUTES LIGUES CONFONDUES :\n');
  COLLECTIONS_TO_CLEAR.forEach(c => console.log(`  - ${c}`));
  console.log('\n(profiles, leagues, drivers, config et races_history ne sont PAS touchés.)');
  console.log('\nCette action est IRRÉVERSIBLE — aucun moyen de revenir en arrière');
  console.log('après coup, à part restaurer un backup.\n');
  console.log('⚠️  As-tu déjà fait un backup FRAIS avant de lancer ce script ?');
  console.log('    (node backup-firestore.cjs — AVANT, jamais après)\n');

  const answer = await ask(`Tape exactement "${CONFIRMATION_WORD}" pour continuer, ou n'importe quoi d'autre pour annuler : `);

  if (answer.trim() !== CONFIRMATION_WORD) {
    console.log('\n🛑 Annulé — aucune donnée n\'a été touchée.\n');
    process.exit(0);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Confirmation reçue — suppression en cours...\n');

  for (const collectionName of COLLECTIONS_TO_CLEAR) {
    const snap = await db.collection(collectionName).get();
    if (snap.empty) {
      console.log(`  → ${collectionName} : déjà vide, rien à faire.`);
      continue;
    }

    const docs = snap.docs;
    let batchCount = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      batchCount++;
    }

    const batchNote = batchCount > 1 ? ` (${batchCount} lots)` : '';
    console.log(`  ✅ ${collectionName} : ${docs.length} document(s) supprimé(s)${batchNote}.`);
  }

  console.log('\n📊 Base de données vidée (players, races, predictions, penalties).\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
