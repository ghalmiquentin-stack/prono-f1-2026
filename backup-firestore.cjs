/**
 * Backup Firestore — Prono F1 2026
 * ---------------------------------
 * Exporte l'intégralité des collections de la base en fichiers JSON locaux,
 * horodatés, avant toute modification touchant à l'auth et aux règles Firestore.
 *
 * PRÉREQUIS
 * 1. Dans la console Firebase : Paramètres du projet > Comptes de service
 *    > "Générer une nouvelle clé privée" → télécharge le fichier JSON.
 * 2. Renomme-le "serviceAccountKey.json" et place-le dans le même dossier
 *    que ce script (NE JAMAIS commit ce fichier dans Git : ajoute-le au .gitignore).
 * 3. Installe la dépendance :
 *      npm install firebase-admin
 * 4. Lance le script :
 *      node backup-firestore.js
 *
 * RÉSULTAT
 * Un dossier "backups/backup-<date>/" contenant un fichier .json par
 * collection, plus un fichier "_summary.json" récapitulatif.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');

// Toutes les collections identifiées dans le code de l'app
const COLLECTIONS = [
  'players',
  'races',
  'predictions',
  'penalties',
  'drivers',
  'races_history',
  'config',
  'leagues',
  'profiles',
];

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable.');
    console.error('   Télécharge-le depuis la console Firebase (Paramètres du projet > Comptes de service)');
    console.error('   et place-le à côté de ce script.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, 'backups', `backup-${timestamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const summary = {
    date: new Date().toISOString(),
    project: serviceAccount.project_id,
    collections: {},
  };

  console.log(`\n📦 Démarrage du backup vers : ${outDir}\n`);

  for (const collectionName of COLLECTIONS) {
    process.stdout.write(`  → ${collectionName} ... `);
    try {
      const snapshot = await db.collection(collectionName).get();
      const docs = {};
      snapshot.forEach((doc) => {
        docs[doc.id] = doc.data();
      });

      const filePath = path.join(outDir, `${collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');

      summary.collections[collectionName] = snapshot.size;
      console.log(`${snapshot.size} document(s) ✅`);
    } catch (err) {
      summary.collections[collectionName] = `ERREUR: ${err.message}`;
      console.log(`❌ erreur : ${err.message}`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, '_summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  console.log(`\n✅ Backup terminé.`);
  console.log(`   Dossier : ${outDir}`);
  console.log(`   Vérifie le contenu, puis copie ce dossier hors du repo Git`);
  console.log(`   (ex. Google Drive, disque externe) avant de continuer.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur inattendue :', err);
  process.exit(1);
});
