/**
 * Ajoute le "Bahrain Grand Prix" 2026, déplacé au circuit de Sepang
 * (Malaisie), au calendrier de la saison — sans toucher à aucune autre
 * course.
 *
 * Utilise un id fractionnaire (17.5) plutôt qu'un entier séquentiel : le tri
 * chronologique de l'app se fait par comparaison numérique de `id`
 * (`a.id - b.id`), donc 17.5 se place naturellement entre l'Azerbaïdjan
 * (id 17) et Singapour (id 18) sans renuméroter les GP suivants — ce qui
 * casserait le lien `raceId` de leurs pronostics/pénalités déjà enregistrés.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/add-bahrain-gp-2026.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

const RACE_ID = 17.5;
const RACE_DOC = {
  id: RACE_ID,
  name: 'Bahreïn (Sepang)',
  flag: '🇲🇾',
  city: 'Sepang',
  circuit: 'Sepang International Circuit',
  date: '2026-10-04',
  raceTime: '09:00',
  raceTimeUTC: '07:00',
  status: 'upcoming',
  result: null,
};

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
  const ref = db.collection('races').doc(String(RACE_ID));

  const existing = await ref.get();
  if (existing.exists) {
    console.error(`❌ Le document races/${RACE_ID} existe déjà — abandon pour éviter d'écraser une donnée existante.`);
    console.error(existing.data());
    process.exit(1);
  }

  console.log(`\n🏁 Ajout du GP "${RACE_DOC.name}" (id ${RACE_ID}) entre l'Azerbaïdjan (17) et Singapour (18)\n`);
  console.log(RACE_DOC);

  await ref.set(RACE_DOC);

  console.log(`\n✅ Course créée : races/${RACE_ID}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
