/**
 * Script de DIAGNOSTIC — lecture seule stricte, aucune écriture nulle part
 * (pas de .set()/.update()/.delete()). Admin SDK, mêmes prérequis que les
 * scripts one-shot existants.
 *
 * Objectif : retrouver sur quel GP il manque une pénalité de modification
 * ('change') pour William dans Bro League 2026, en comparant
 * modificationCount (jamais décrémenté, comportement documenté et
 * volontaire) au nombre de pénalités 'change' réellement présentes pour
 * chaque course. Un écart (modificationCount > pénalités réelles) signale
 * la course où une pénalité a été supprimée par erreur.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/diag-find-missing-penalty.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const LEAGUE_NAME = 'Bro League 2026';
const PLAYER_HANDLE = 'william';
const CONTROL_RACE_ID = 15; // Monza — connu, sert à valider le raisonnement

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(`\n🔎 Diagnostic — pénalité de modification manquante pour "${PLAYER_HANDLE}" dans "${LEAGUE_NAME}"\n`);

  // 1. Ligue
  const leaguesSnap = await db.collection('leagues').where('name', '==', LEAGUE_NAME).get();
  if (leaguesSnap.empty) {
    console.error(`❌ Ligue "${LEAGUE_NAME}" introuvable. Arrêt.`);
    process.exit(1);
  }
  if (leaguesSnap.size > 1) {
    console.error(`❌ Ambiguïté : ${leaguesSnap.size} ligues nommées "${LEAGUE_NAME}". Arrêt.`);
    process.exit(1);
  }
  const league = leaguesSnap.docs[0];
  console.log(`  → Ligue : ${league.data().name} (id=${league.id})`);

  // 2. Profil "william" (insensible à la casse)
  const profilesSnap = await db.collection('profiles').get();
  const matchingProfiles = profilesSnap.docs.filter(d =>
    String(d.data().displayName ?? '').toLowerCase() === PLAYER_HANDLE.toLowerCase()
  );
  if (matchingProfiles.length === 0) {
    console.error(`❌ Aucun profil avec displayName == "${PLAYER_HANDLE}" (insensible à la casse). Arrêt.`);
    process.exit(1);
  }
  if (matchingProfiles.length > 1) {
    console.error(`❌ Ambiguïté : ${matchingProfiles.length} profils correspondent à "${PLAYER_HANDLE}" :`);
    matchingProfiles.forEach(p => console.error(`      - uid=${p.id} displayName=${p.data().displayName}`));
    process.exit(1);
  }
  const profile = matchingProfiles[0];
  const authUid = profile.id;
  console.log(`  → Profil : ${profile.data().displayName} (authUid=${authUid})`);

  // 3. Document players de ce joueur dans cette ligue précise
  const playersSnap = await db.collection('players')
    .where('authUid', '==', authUid)
    .where('leagueId', '==', league.id)
    .get();
  if (playersSnap.empty) {
    console.error(`❌ Aucun document players pour authUid=${authUid} dans la ligue ${league.id}. Arrêt.`);
    process.exit(1);
  }
  if (playersSnap.size > 1) {
    console.error(`❌ Ambiguïté : ${playersSnap.size} documents players pour ce joueur dans cette ligue :`);
    playersSnap.docs.forEach(p => console.error(`      - ${p.id}`));
    process.exit(1);
  }
  const playerDoc = playersSnap.docs[0];
  const playerId = playerDoc.id;
  console.log(`  → Document players : ${playerId}\n`);

  // 4. Toutes les predictions de ce joueur avec modificationCount > 0
  // (filtre sur modificationCount fait côté code, pas en requête Firestore,
  // pour éviter tout besoin d'index composite).
  const predictionsSnap = await db.collection('predictions').where('playerId', '==', playerId).get();
  const modifiedPredictions = predictionsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => (p.modificationCount ?? 0) > 0);

  console.log('=== Pronostics modifiés (modificationCount > 0) ===');
  modifiedPredictions.forEach(p => {
    console.log(`  - raceId=${p.raceId} | modificationCount=${p.modificationCount}`);
  });
  if (!modifiedPredictions.length) {
    console.log('  (aucun)');
  }

  // 5. Toutes les pénalités 'change' de ce joueur, comptées par raceId
  const penaltiesSnap = await db.collection('penalties').where('playerId', '==', playerId).get();
  const changePenalties = penaltiesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.type === 'change');

  const realCountByRaceId = new Map();
  for (const pen of changePenalties) {
    realCountByRaceId.set(pen.raceId, (realCountByRaceId.get(pen.raceId) ?? 0) + 1);
  }

  console.log('\n=== Pénalités "change" réellement présentes, par raceId ===');
  if (!changePenalties.length) {
    console.log('  (aucune)');
  } else {
    for (const [raceId, count] of realCountByRaceId.entries()) {
      console.log(`  - raceId=${raceId} : ${count} pénalité(s) "change"`);
    }
  }

  // Helper : résout le nom d'une course depuis races/{raceId}
  async function getRaceName(raceId) {
    const raceDoc = await db.collection('races').doc(String(raceId)).get();
    return raceDoc.exists ? raceDoc.data().name : '(course introuvable)';
  }

  // 6-7. Comparaison et détection des écarts
  console.log('\n=== Comparaison modificationCount vs pénalités "change" réelles ===');
  const gaps = [];
  for (const pred of modifiedPredictions) {
    const raceName = await getRaceName(pred.raceId);
    const realCount = realCountByRaceId.get(pred.raceId) ?? 0;
    const expected = pred.modificationCount;
    const gap = expected - realCount;

    if (gap > 0) {
      console.log(`  ⚠️  ${raceName} (raceId=${pred.raceId}) : modificationCount=${expected}, pénalités réelles=${realCount} → écart de ${gap}`);
      gaps.push({ raceId: pred.raceId, raceName, expected, realCount, gap });
    } else {
      console.log(`  ✓  ${raceName} (raceId=${pred.raceId}) : modificationCount=${expected}, pénalités réelles=${realCount} → cohérent`);
    }
  }

  // 8. Contrôle explicite sur Monza (id=15), même si déjà couvert ci-dessus
  const controlAlreadyShown = modifiedPredictions.some(p => p.raceId === CONTROL_RACE_ID);
  if (!controlAlreadyShown) {
    const monzaName = await getRaceName(CONTROL_RACE_ID);
    const monzaPredSnap = await db.collection('predictions').doc(`${playerId}_${CONTROL_RACE_ID}`).get();
    const monzaModCount = monzaPredSnap.exists ? (monzaPredSnap.data().modificationCount ?? 0) : 0;
    const monzaRealCount = realCountByRaceId.get(CONTROL_RACE_ID) ?? 0;
    console.log(`\n=== Contrôle explicite — ${monzaName} (raceId=${CONTROL_RACE_ID}) ===`);
    console.log(`  modificationCount=${monzaModCount}, pénalités réelles=${monzaRealCount} → ${monzaModCount > monzaRealCount ? 'écart' : 'cohérent'}`);
  } else {
    console.log(`\n=== Contrôle explicite — Monza (raceId=${CONTROL_RACE_ID}) déjà listé ci-dessus ===`);
  }

  // Résumé final
  console.log('\n=== Résumé ===');
  if (gaps.length === 0) {
    console.log('  Aucun écart détecté sur aucun GP.');
  } else {
    console.log(`  ${gaps.length} GP en écart (pénalité probablement manquante) :`);
    gaps.forEach(g => {
      console.log(`    - ${g.raceName} (raceId=${g.raceId}) : ${g.expected} modification(s) attendue(s), ${g.realCount} pénalité(s) présente(s), écart=${g.gap}`);
    });
  }
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
