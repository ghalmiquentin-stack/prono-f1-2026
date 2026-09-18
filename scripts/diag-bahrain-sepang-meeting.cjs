/**
 * Script de DIAGNOSTIC — lecture seule stricte, aucune écriture Firestore,
 * aucun appel qui modifie quoi que ce soit (ni .set()/.update()/.delete(),
 * ni écriture sur OpenF1 qui est de toute façon en lecture seule).
 *
 * Objectif : vérifier si la désambiguïsation par `city` de resolveMeetingKey
 * (src/utils/openf1.js / functions/lib/fetchRaceResult.js) fonctionnera
 * correctement pour races/17.5 ("Bahreïn (Sepang)"), avant que
 * l'automatisation ne tente ce GP pour de vrai — country_name=Bahrain peut
 * renvoyer plusieurs réunions (nom sponsor, pas le pays hôte réel).
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/diag-bahrain-sepang-meeting.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const RACE_DOC_ID = '17.5';
const COUNTRY_NAME = 'Bahrain';
const YEAR = 2026;

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Fichier serviceAccountKey.json introuvable à la racine du projet.');
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(`\n🔎 Diagnostic — désambiguïsation OpenF1 pour races/${RACE_DOC_ID} ("Bahreïn (Sepang)")\n`);

  // 1. Lire races/17.5 en base
  const raceDoc = await db.collection('races').doc(RACE_DOC_ID).get();
  if (!raceDoc.exists) {
    console.error(`❌ Document races/${RACE_DOC_ID} introuvable. Arrêt.`);
    process.exit(1);
  }
  const race = raceDoc.data();
  console.log('=== Document races/' + RACE_DOC_ID + ' actuel ===');
  console.log(`  name        = ${JSON.stringify(race.name)}`);
  console.log(`  city        = ${JSON.stringify(race.city)}`);
  console.log(`  meeting_key = ${JSON.stringify(race.meeting_key)}`);

  // 2. Appel direct OpenF1 — lecture seule, aucun effet de bord
  const url = `https://api.openf1.org/v1/meetings?year=${YEAR}&country_name=${encodeURIComponent(COUNTRY_NAME)}`;
  console.log(`\n=== Appel OpenF1 ===\n  GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`❌ OpenF1 a répondu ${res.status}. Arrêt.`);
    process.exit(1);
  }
  const meetings = await res.json();

  console.log(`\n=== Réunions retournées (${meetings.length}) ===`);
  if (!meetings.length) {
    console.log('  (aucune)');
  } else {
    meetings.forEach((m, i) => {
      console.log(`  [${i}] meeting_key=${m.meeting_key} | meeting_name=${JSON.stringify(m.meeting_name)} | location=${JSON.stringify(m.location)} | date_start=${m.date_start}`);
    });
  }

  // 3. Comparaison location vs city actuel (insensible à la casse)
  const cityLower = String(race.city ?? '').toLowerCase();
  console.log(`\n=== Comparaison location vs city actuel ("${race.city}") ===`);
  const matches = [];
  meetings.forEach((m, i) => {
    const locationLower = String(m.location ?? '').toLowerCase();
    const isMatch = locationLower === cityLower;
    console.log(`  [${i}] location=${JSON.stringify(m.location)} → ${isMatch ? '✅ correspond' : '❌ ne correspond pas'}`);
    if (isMatch) matches.push(m);
  });

  // 4. Conclusion explicite
  console.log('\n=== Conclusion ===');
  if (matches.length === 1) {
    console.log(`✅ Exactement 1 réunion correspond à city="${race.city}" (meeting_key=${matches[0].meeting_key}).`);
    console.log('   La désambiguïsation par city fonctionnerait correctement telle quelle.');
  } else if (matches.length === 0) {
    console.log(`⚠️  PROBLÈME : 0 réunion ne correspond à city="${race.city}" parmi les ${meetings.length} retournée(s) par OpenF1.`);
    console.log('   La désambiguïsation échouerait — resolveMeetingKey retomberait sur meetings[0] (le premier résultat, arbitraire), pas nécessairement le bon GP.');
    console.log('   Valeurs de location réellement retournées : ' + JSON.stringify(meetings.map(m => m.location)));
  } else {
    console.log(`⚠️  PROBLÈME : ${matches.length} réunions correspondent à city="${race.city}" — toujours ambigu même après filtrage par city.`);
    console.log('   Détail des correspondances : ' + JSON.stringify(matches.map(m => ({ meeting_key: m.meeting_key, meeting_name: m.meeting_name, date_start: m.date_start }))));
  }
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
