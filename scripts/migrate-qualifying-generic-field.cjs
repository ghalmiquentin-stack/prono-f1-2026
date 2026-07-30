/**
 * Migre le champ `qualifying_2026` (races/{id}) vers un nom générique
 * `qualifying`, avec un champ `year` explicite ajouté à l'intérieur — même
 * traitement que la migration déjà faite sur races_history
 * (podium_2025/pole_2025 → podium/pole + year).
 *
 * Pure rename, sans appel réseau : les 5 documents concernés ont tous été
 * générés cette saison (2026), donc year: 2026 est correct pour 100% d'entre
 * eux, sans ambiguïté.
 *
 * Idempotent : ignore tout document ayant déjà `qualifying` (déjà migré) ou
 * n'ayant pas `qualifying_2026` (rien à migrer).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs) — déjà fait avant
 *     de lancer ce script.
 *
 * USAGE
 *   node scripts/migrate-qualifying-generic-field.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const CURRENT_SCHEMA_YEAR = 2026; // la seule saison avec laquelle ce champ a jamais été écrit

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Migration races/{id}.qualifying_2026 → qualifying (+ year)\n');

  const snap = await db.collection('races').get();
  let migrated = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    if (!('qualifying_2026' in data)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  → races/${docSnap.id} ... `);

    if (data.qualifying) {
      console.log('déjà au nouveau format, ignoré');
      skipped++;
      continue;
    }

    const qualifying = { ...data.qualifying_2026, year: CURRENT_SCHEMA_YEAR };

    await docSnap.ref.update({
      qualifying,
      qualifying_2026: admin.firestore.FieldValue.delete(),
    });
    console.log('✅ migré');
    migrated++;
  }

  console.log(`\n📊 Résumé : ${migrated} document(s) migré(s), ${skipped} ignoré(s)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
