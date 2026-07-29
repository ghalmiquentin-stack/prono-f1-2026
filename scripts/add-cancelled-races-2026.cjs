/**
 * Ajoute les 2 Grands Prix annulés de la saison 2026 (Bahreïn et Arabie
 * Saoudite, rounds 4 et 5 initialement prévus mi-avril, annulés à cause du
 * conflit au Moyen-Orient) au calendrier, sans toucher à aucune autre course.
 *
 * status: 'cancelled' — distinct de 'upcoming'/'completed', pris en charge
 * partout dans l'app (badges, filtres, modale de course, écran admin).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs).
 *
 * USAGE
 *   node scripts/add-cancelled-races-2026.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

const RACES = [
  {
    id: 4,
    name: 'Bahreïn',
    flag: '🇧🇭',
    city: 'Sakhir',
    circuit: 'Bahrain International Circuit',
    date: '2026-04-12',
    raceTime: null,
    raceTimeUTC: null,
    status: 'cancelled',
    result: null,
  },
  {
    id: 5,
    name: 'Arabie Saoudite',
    flag: '🇸🇦',
    city: 'Djeddah',
    circuit: 'Jeddah Corniche Circuit',
    date: '2026-04-19',
    raceTime: null,
    raceTimeUTC: null,
    status: 'cancelled',
    result: null,
  },
];

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

  console.log('\n🚫 Ajout des Grands Prix annulés (Bahreïn id:4, Arabie Saoudite id:5)\n');

  for (const raceDoc of RACES) {
    const ref = db.collection('races').doc(String(raceDoc.id));
    const existing = await ref.get();
    if (existing.exists) {
      console.error(`❌ Le document races/${raceDoc.id} existe déjà — abandon pour ce document, pour éviter d'écraser une donnée existante.`);
      console.error(existing.data());
      continue;
    }
    console.log(`  → races/${raceDoc.id}`, raceDoc);
    await ref.set(raceDoc);
    console.log(`  ✅ créé\n`);
  }

  console.log('✅ Terminé.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
