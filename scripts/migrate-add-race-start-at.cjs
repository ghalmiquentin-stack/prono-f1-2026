/**
 * Ajoute un nouveau champ `raceStartAt` (races/{id}) — un vrai Timestamp
 * Firestore calculé à partir des champs existants `date` ("YYYY-MM-DD") et
 * `raceTimeUTC` ("HH:MM"), qui restent des strings simples et ne sont ni
 * lus ni modifiés par ce script.
 *
 * Nécessaire pour Phase 3 (verrouillage serveur des pronostics) : une règle
 * Firestore ne peut pas comparer request.time à une paire de strings — il
 * faut un vrai Timestamp à comparer côté règles.
 *
 * Construction identique à `raceStartInstant()` dans src/utils/races.js
 * (new Date(`${date}T${raceTimeUTC}:00Z`)), pour garantir que raceStartAt
 * représente exactement le même instant que ce qui est déjà affiché/utilisé
 * côté client — sauf que le fallback à 12:00 UTC de raceStartInstant() n'est
 * PAS reproduit ici : un raceTimeUTC null (GP annulé) donne raceStartAt: null
 * explicitement, plutôt qu'une fausse heure de départ à midi.
 *
 * Idempotent : tout document ayant déjà un champ `raceStartAt` (Timestamp ou
 * null) est ignoré sans être réécrit — relançable sans risque. N'utilise que
 * `.update()`, jamais `.set()`, donc aucun autre champ du document n'est
 * jamais touché (date/raceTimeUTC/status/name/... intouchés).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs) avant de lancer.
 *
 * USAGE
 *   node scripts/migrate-add-race-start-at.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Migration races/{id} → ajout du champ raceStartAt (Timestamp)\n');

  const snap = await db.collection('races').get();
  let migratedWithDate = 0;
  let migratedNull = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    process.stdout.write(`  → races/${docSnap.id} ... `);

    if ('raceStartAt' in data) {
      console.log('déjà migré, ignoré');
      skipped++;
      continue;
    }

    if (data.raceTimeUTC != null) {
      const instant = new Date(`${data.date}T${data.raceTimeUTC}:00Z`);
      await docSnap.ref.update({
        raceStartAt: admin.firestore.Timestamp.fromDate(instant),
      });
      console.log(`✅ raceStartAt = ${instant.toISOString()}`);
      migratedWithDate++;
    } else {
      await docSnap.ref.update({
        raceStartAt: null,
      });
      console.log('✅ raceStartAt = null (GP annulé, pas de raceTimeUTC)');
      migratedNull++;
    }
  }

  console.log(
    `\n📊 Résumé : ${migratedWithDate} migré(s) avec date, ${migratedNull} migré(s) à null (annulés), ` +
    `${skipped} ignoré(s) (déjà migrés), ${snap.size} document(s) traité(s) au total\n`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
