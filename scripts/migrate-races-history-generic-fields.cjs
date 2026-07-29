/**
 * Migrates the `races_history` collection from year-suffixed field names
 * (podium_2025, pole_2025, meeting_key_2025) to generic ones (podium, pole,
 * meetingKey) plus an explicit `year` field — so PredictionSheet.jsx can
 * build its "GP {name} {year}" / "Pole Position {year}" labels dynamically
 * instead of a year hardcoded in the JSX.
 *
 * Pure rename, no network calls: every existing document was written by the
 * old seedHistory.js, which always queried OpenF1 for year=2025 literally —
 * so `year: 2025` is correct for 100% of existing documents, no ambiguity.
 * Re-running seedHistory.js instead was considered and rejected: it would
 * re-hit the OpenF1 API for no benefit (same season, same expected data),
 * with the added risk of hitting rate limits or picking up any retroactive
 * OpenF1 data correction — a pure field rename has neither risk.
 *
 * Idempotent: skips any document that already has a `year` field (either
 * already migrated, or not matching the known old schema).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs) — vérifié avant
 *     de lancer ce script.
 *
 * USAGE
 *   node scripts/migrate-races-history-generic-fields.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const OLD_SCHEMA_YEAR = 2025; // the only year old documents were ever seeded with

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

  console.log('\n🔁 Migration races_history : podium_2025/pole_2025/meeting_key_2025 → podium/pole/meetingKey + year\n');

  const snap = await db.collection('races_history').get();
  let migrated = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    process.stdout.write(`  → races_history/${docSnap.id} ... `);

    if ('year' in data) {
      console.log('déjà au nouveau format, ignoré');
      skipped++;
      continue;
    }

    if (!('podium_2025' in data) && !('pole_2025' in data) && !('meeting_key_2025' in data)) {
      console.log("ne correspond pas à l'ancien schéma connu, ignoré (vérifier manuellement)");
      skipped++;
      continue;
    }

    const newData = {
      year: OLD_SCHEMA_YEAR,
      podium: data.podium_2025 ?? null,
      pole: data.pole_2025 ?? null,
      meetingKey: data.meeting_key_2025 ?? null,
      seededAt: data.seededAt ?? null,
    };

    await docSnap.ref.set(newData); // full overwrite (no merge) — actually drops the old field names
    console.log('✅ migré');
    migrated++;
  }

  console.log(`\n📊 Résumé : ${snap.size} document(s) au total, ${migrated} migré(s), ${skipped} ignoré(s)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
