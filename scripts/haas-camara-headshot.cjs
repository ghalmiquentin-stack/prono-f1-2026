/**
 * One-shot : avatar de Camara (drivers/50)
 * -----------------------------------------
 * Renseigne `headshot_url` sur drivers/50, avec l'adresse du site de la F1 construite
 * comme pour les autres pilotes. Tant que la F1 n'a pas publié la photo, cette adresse
 * renvoie la silhouette générique (même rendu que Lindblad) ; la vraie photo apparaîtra
 * d'elle-même si elle est publiée sous ce nom.
 *
 * Garde-fous : seul `headshot_url` est écrit. Idempotent. S'arrête sans rien écrire si
 * drivers/50 n'est pas Camara, ou si `headshot_url` contient déjà autre chose.
 *
 * Usage :
 *   node scripts/haas-camara-headshot.cjs --dry-run
 *   node scripts/haas-camara-headshot.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const HEADSHOT_URL =
  'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/R/RAFCAM01_Rafael_Camara/rafcam01.png.transform/1col/image.png';

async function main() {
  console.log(`Projet : ${serviceAccount.project_id}${DRY_RUN ? '  (DRY RUN, aucune écriture)' : ''}\n`);
  const ref = db.collection('drivers').doc('50');
  const snap = await ref.get();

  if (!snap.exists) throw new Error('drivers/50 introuvable : arrêt, rien écrit.');
  const data = snap.data();
  if (data.display_name !== 'Camara') {
    throw new Error(`drivers/50 n'est pas Camara (display_name="${data.display_name}") : arrêt, rien écrit.`);
  }
  if (data.headshot_url === HEADSHOT_URL) {
    console.log('drivers/50 (Camara) : headshot_url déjà en place, rien à faire');
    return;
  }
  if (data.headshot_url != null) {
    throw new Error(`headshot_url contient déjà autre chose (${data.headshot_url}) : arrêt, rien écrit.`);
  }

  console.log('drivers/50 (Camara) : ajout de headshot_url');
  if (!DRY_RUN) {
    await ref.update({ headshot_url: HEADSHOT_URL });
    const after = (await ref.get()).data();
    console.log('Relecture : headshot_url =', after.headshot_url);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
