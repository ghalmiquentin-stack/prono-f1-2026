/**
 * Inventaire en lecture seule de la collection "players".
 * ------------------------------------------------------------------
 * Pour chaque document de "players", affiche :
 *   - son id (doc.id)
 *   - son leagueId, accompagné du nom de la ligue correspondante
 *     (lookup dans "leagues"), ou un avertissement si la ligue est
 *     introuvable / le champ absent
 *   - son authUid
 *   - si ce authUid correspond encore à un compte Firebase Authentication
 *     existant (admin.auth().getUsers())
 *   - le champ "active" s'il existe
 *   - les champs obsolètes encore présents (nickname, displayName, avatar,
 *     color, pin — remplacés depuis par la collection "profiles" et par
 *     l'authentification Firebase)
 *
 * Trié par ligue (nom alphabétique), les players sans ligue valide en
 * dernier. N'effectue AUCUNE écriture ni suppression : uniquement de
 * l'affichage.
 *
 * PRÉREQUIS
 *   - serviceAccountKey.json présent à la racine du projet.
 *
 * USAGE
 *   node scripts/inventaire-players.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const OBSOLETE_FIELDS = ['nickname', 'displayName', 'avatar', 'color', 'pin'];
const AUTH_BATCH_SIZE = 100; // limite de admin.auth().getUsers() par appel

async function fetchExistingAuthUids(authUids) {
  const existing = new Set();
  const unique = [...new Set(authUids)];

  for (let i = 0; i < unique.length; i += AUTH_BATCH_SIZE) {
    const batch = unique.slice(i, i + AUTH_BATCH_SIZE);
    const result = await admin.auth().getUsers(batch.map(uid => ({ uid })));
    for (const user of result.users) existing.add(user.uid);
  }

  return existing;
}

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

  console.log('\n🔍 Inventaire de la collection "players" (lecture seule)\n');

  const [leaguesSnap, playersSnap] = await Promise.all([
    db.collection('leagues').get(),
    db.collection('players').get(),
  ]);

  const leagueNames = new Map();
  for (const doc of leaguesSnap.docs) {
    leagueNames.set(doc.id, doc.data().name ?? '(sans nom)');
  }

  const players = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const authUids = players.map(p => p.authUid).filter(Boolean);
  const existingAuthUids = await fetchExistingAuthUids(authUids);

  // Regroupe par ligue, triée alphabétiquement ; les players sans ligue
  // valide (leagueId absent ou introuvable dans "leagues") passent en dernier.
  const groups = new Map(); // leagueId|__NO_LEAGUE__ -> players[]
  const NO_LEAGUE_KEY = '__NO_LEAGUE__';

  for (const player of players) {
    const key = player.leagueId && leagueNames.has(player.leagueId) ? player.leagueId : NO_LEAGUE_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  }

  const sortedLeagueIds = [...groups.keys()]
    .filter(k => k !== NO_LEAGUE_KEY)
    .sort((a, b) => leagueNames.get(a).localeCompare(leagueNames.get(b)));

  let danglingAuthCount = 0;
  let missingLeagueCount = 0;
  let obsoleteFieldsCount = 0;

  const printPlayer = (player) => {
    const hasLeague = player.leagueId && leagueNames.has(player.leagueId);
    if (!hasLeague) missingLeagueCount++;

    const authUid = player.authUid ?? null;
    let authStatus = '— (aucun authUid)';
    if (authUid) {
      if (existingAuthUids.has(authUid)) {
        authStatus = '✅ compte existant';
      } else {
        authStatus = '❌ compte introuvable dans Firebase Auth';
        danglingAuthCount++;
      }
    }

    const activeDisplay = 'active' in player ? String(player.active) : '(absent)';

    const obsoletePresent = OBSOLETE_FIELDS.filter(f => f in player);
    if (obsoletePresent.length > 0) obsoleteFieldsCount++;

    console.log(`  • ${player.id}`);
    console.log(`      leagueId   : ${player.leagueId ?? '(absent)'}${hasLeague ? ` — "${leagueNames.get(player.leagueId)}"` : ' ⚠️  ligue introuvable'}`);
    console.log(`      authUid    : ${authUid ?? '(absent)'}`);
    console.log(`      auth       : ${authStatus}`);
    console.log(`      active     : ${activeDisplay}`);
    if (obsoletePresent.length > 0) {
      console.log(`      ⚠️  champs obsolètes présents : ${obsoletePresent.join(', ')}`);
    }
    console.log('');
  };

  for (const leagueId of sortedLeagueIds) {
    const leaguePlayers = groups.get(leagueId);
    console.log(`\n🏆 Ligue "${leagueNames.get(leagueId)}" (${leagueId}) — ${leaguePlayers.length} joueur(s)\n`);
    for (const player of leaguePlayers) printPlayer(player);
  }

  if (groups.has(NO_LEAGUE_KEY)) {
    const orphanPlayers = groups.get(NO_LEAGUE_KEY);
    console.log(`\n⚠️  Sans ligue valide — ${orphanPlayers.length} joueur(s)\n`);
    for (const player of orphanPlayers) printPlayer(player);
  }

  console.log('📊 Résumé :\n');
  console.log(`  players au total                          : ${players.length}`);
  console.log(`  ligues distinctes                         : ${sortedLeagueIds.length}`);
  console.log(`  players sans ligue valide                 : ${missingLeagueCount}`);
  console.log(`  players avec authUid orphelin (compte absent de Firebase Auth) : ${danglingAuthCount}`);
  console.log(`  players avec champs obsolètes             : ${obsoleteFieldsCount}`);
  console.log('\nTerminé — aucune donnée n\'a été modifiée.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
