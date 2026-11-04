/**
 * One-shot : Haas pour le GP du Brésil 2026 (Ocon retiré, Camara ajouté)
 * ----------------------------------------------------------------------
 * Écrit dans la collection Firestore `drivers` (SDK admin, serviceAccountKey.json) :
 *   1. drivers/31 (Ocon)   : ajoute `active: false`. Le document n'est pas supprimé
 *                            (photo et historique conservés). Aucun autre champ touché.
 *   2. drivers/50 (Camara) : crée le document, avec `provisional: true` car le numéro 50
 *                            n'est pas confirmé par la FIA.
 *
 * Garde-fous :
 *   - Idempotent : relancé, il constate que tout est déjà en place et n'écrit rien.
 *   - Non destructif : si drivers/50 existe avec un autre contenu (ex. Hirakawa après
 *     une synchro), le script s'arrête AVANT toute écriture, y compris sur drivers/31.
 *   - Si drivers/31 est introuvable, le script s'arrête sans rien écrire.
 *   - drivers/50 est créé avec create() : jamais d'écrasement, même en cas de course.
 *
 * Usage :
 *   node scripts/haas-bresil-ocon-camara.cjs --dry-run   (vérifie, n'écrit rien)
 *   node scripts/haas-bresil-ocon-camara.cjs             (applique)
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

// Même structure de champs que les autres documents drivers (hors updatedAt,
// ajouté à l'écriture). Pas de séance OpenF1 : Camara n'y est pas encore.
// headshot_url est renseigné ensuite par haas-camara-headshot.cjs : il est donc
// ignoré dans la comparaison ci-dessous, pour que ce script reste idempotent.
const CAMARA = {
  driver_number: 50,
  full_name: 'Rafael Camara',
  first_name: 'Rafael',
  last_name: 'Camara',
  display_name: 'Camara',
  name_acronym: 'CAM',
  team_name: 'Haas F1 Team',
  team_colour: '#9C9FA2',
  headshot_url: null,
  session_key: null,
  provisional: true,
};

const sameAsCamara = (data) =>
  Object.entries(CAMARA).every(([k, v]) => k === 'headshot_url' || data[k] === v);

async function main() {
  console.log(`Projet : ${serviceAccount.project_id}${DRY_RUN ? '  (DRY RUN, aucune écriture)' : ''}\n`);

  const ref31 = db.collection('drivers').doc('31');
  const ref50 = db.collection('drivers').doc('50');
  const [snap31, snap50] = await Promise.all([ref31.get(), ref50.get()]);

  // ── Vérifications, avant toute écriture ──────────────────────────────────
  if (!snap31.exists) {
    throw new Error('drivers/31 (Ocon) introuvable : arrêt, rien écrit.');
  }
  if (snap31.data().display_name !== 'Ocon') {
    throw new Error(`drivers/31 n'est pas Ocon (display_name="${snap31.data().display_name}") : arrêt, rien écrit.`);
  }
  if (snap50.exists && !sameAsCamara(snap50.data())) {
    console.error('drivers/50 existe avec un autre contenu :');
    console.error(JSON.stringify(snap50.data(), null, 2));
    throw new Error('Arrêt sans rien écrire (ni sur drivers/31, ni sur drivers/50).');
  }

  const need31 = snap31.data().active !== false;
  const need50 = !snap50.exists;

  // ── Écritures ────────────────────────────────────────────────────────────
  if (need31) {
    console.log('drivers/31 (Ocon)   : ajout de active: false');
    if (!DRY_RUN) await ref31.update({ active: false });
  } else {
    console.log('drivers/31 (Ocon)   : déjà active: false, rien à faire');
  }

  if (need50) {
    console.log('drivers/50 (Camara) : création (provisional: true)');
    if (!DRY_RUN) {
      await ref50.create({ ...CAMARA, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  } else {
    console.log('drivers/50 (Camara) : déjà en place, rien à faire');
  }

  // ── Relecture ────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const [a, b] = await Promise.all([ref31.get(), ref50.get()]);
    console.log('\nRelecture :');
    console.log('  31 ->', a.data().display_name, '| active =', a.data().active);
    console.log('  50 ->', b.data().display_name, '| provisional =', b.data().provisional);
  }
  console.log('\nTerminé.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
