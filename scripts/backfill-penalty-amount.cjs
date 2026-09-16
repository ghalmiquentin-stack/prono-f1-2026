/**
 * Backfill du champ `amount` sur les pénalités créées avant l'introduction
 * de getPenaltyAmount() (src/utils/penalties.js, commit 6b23954) — ces
 * documents plus anciens n'ont jamais reçu ce champ. Diagnostic préalable :
 * 12 pénalités concernées, toutes dans Bro League 2026, où la valeur
 * historique en dur et la règle actuellement configurée pour cette ligue
 * coïncident (5 pts 'change', 10 pts 'late').
 *
 * N'écrit que le champ `amount`, via .update() (jamais .set()) — aucun
 * autre champ du document n'est touché.
 *
 * Idempotent : ne considère que les documents où `amount` est absent ou
 * n'est pas un nombre — un document déjà backfillé (amount numérique) est
 * ignoré, relançable sans risque.
 *
 * Tout type de pénalité autre que 'change'/'late' est explicitement laissé
 * de côté (aucune écriture, juste un avertissement loggé) — cas non prévu
 * par le diagnostic, à signaler plutôt qu'à deviner une valeur.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *   - Backup Firestore à jour (node backup-firestore.cjs) avant de lancer.
 *
 * USAGE
 *   node scripts/backfill-penalty-amount.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

const LEGACY_AMOUNTS = {
  change: 5,
  late: 10,
};

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('\n🔁 Backfill du champ amount sur les pénalités sans montant numérique\n');

  const snap = await db.collection('penalties').get();
  const missing = snap.docs.filter(d => typeof d.data().amount !== 'number');

  console.log(`  → ${snap.size} pénalité(s) au total, ${missing.length} sans amount numérique.\n`);

  let updated = 0;
  let warned = 0;

  for (const docSnap of missing) {
    const data = docSnap.data();
    const amount = LEGACY_AMOUNTS[data.type];

    if (amount === undefined) {
      console.warn(`  ⚠️  penalties/${docSnap.id} : type="${data.type}" inattendu (ni 'change' ni 'late') — ignoré, rien écrit.`);
      warned++;
      continue;
    }

    await docSnap.ref.update({ amount });
    console.log(`  ✅ penalties/${docSnap.id} : type="${data.type}" → amount=${amount}`);
    updated++;
  }

  console.log(`\n📊 Résumé : ${updated} document(s) mis à jour, ${warned} type(s) non reconnu(s) signalé(s), ${snap.size - missing.length} déjà à jour (ignorés)\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
