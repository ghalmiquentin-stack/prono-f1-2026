/**
 * Simulation des scénarios du retrait automatique des pénalités injectées par
 * un horaire provisoire (functions/lib/penaltyRetraction.js, LOT 4).
 *
 * Objet : vérifier, sans aucune donnée réelle, que le retrait supprime
 * uniquement les pénalités automatiques dont l'eventTime précède l'heure réelle
 * de début des qualifications, qu'il journalise chaque retrait dans
 * penaltyJournal, qu'il ne recrée jamais une pénalité retirée (le journal reste
 * le marqueur, y compris vis-à-vis du moteur existant penaltyEngine : rejeu
 * d'événement et rattrapage), qu'il reprend correctement après un échec, qu'il
 * respecte le plafond par passage, et que le marqueur de course n'est posé que
 * dans les cas prévus.
 *
 * Usage (depuis la racine du dépôt) :
 *   node scripts/sim-penalty-retraction.cjs
 * Code de sortie 0 si toutes les vérifications passent, 1 sinon.
 *
 * Simulation LOCALE : Firestore est remplacé par un faux en mémoire, aucun
 * réseau, aucun accès à la base. JAMAIS exécuté en production.
 */

const path = require('path');
const LIB = path.join(__dirname, '..', 'functions', 'lib');
const engine = require(path.join(LIB, 'penaltyEngine.js'));
const ret = require(path.join(LIB, 'penaltyRetraction.js'));

const MIN = 60000;
const S = Date.parse('2026-10-11T12:00:00.000Z'); // horaire programmé
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const RULES = { rules: { postQualifsPenalty: { enabled: true, amount: 5 }, modificationPenalty: { enabled: true, amount: 2 } } };
const RULES2 = { rules: { postQualifsPenalty: { enabled: true, amount: 7 }, modificationPenalty: { enabled: true, amount: 3 } } };

function makeStore() {
  const st = { races: new Map(), penalties: new Map(), journal: new Map(), leagues: new Map([['L1', RULES], ['L2', RULES2]]), logs: [], deletes: [], commits: 0, failOn: new Set(), failList: new Set(), clock: S + 200 * MIN };
  const logger = { info: (m) => st.logs.push(['info', m]), warn: (m) => st.logs.push(['warn', m]), error: (m) => st.logs.push(['error', m]), debug() {} };
  st.logger = logger;
  const serverTimestamp = () => ts(st.clock);
  st.serverTimestamp = serverTimestamp;
  // dépendances du moteur existant (penaltyEngine)
  st.engineDeps = {
    readRace: async (id) => st.races.get(String(id)) ?? null,
    readLeague: async (id) => st.leagues.get(id) ?? null,
    readJournal: async (id) => st.journal.get(id) ?? null,
    listJournal: async (pid) => [...st.journal.entries()].filter(([k]) => k.startsWith(pid + '_')).map(([k, v]) => ({ id: k, ...v })),
    commit: async ({ penalty, journal }) => {
      if ((penalty && st.penalties.has(penalty.id)) || st.journal.has(journal.id)) return 'already-exists';
      if (penalty) st.penalties.set(penalty.id, penalty.doc);
      st.journal.set(journal.id, journal.doc);
      return 'created';
    },
    createJournalOnly: async (id, doc) => { if (st.journal.has(id)) return false; st.journal.set(id, doc); return true; },
    toTimestamp: (d) => ts(d.getTime()), serverTimestamp, logger,
  };
  // dépendances du module de retrait
  st.retDeps = {
    listActualRaces: async () => { if (st.listRacesError) throw new Error('boom listRaces'); return [...st.races.entries()].filter(([, r]) => r.qualifyingStartSource === 'actual').map(([id, data]) => ({ id, data })); },
    listPenaltiesByRace: async (raceId) => { if (st.failList.has(raceId)) throw new Error('boom list ' + raceId); return [...st.penalties.entries()].filter(([, p]) => p.raceId === raceId).map(([id, data]) => ({ id, data })); },
    readJournal: async (id) => st.journal.get(id) ?? null,
    commitRetraction: async ({ penaltyId, journalId, journalDoc }) => {
      if (st.failOn.has(penaltyId)) throw new Error('boom commit ' + penaltyId);
      st.deletes.push(penaltyId); st.commits += 1;
      st.penalties.delete(penaltyId);
      st.journal.set(journalId, { ...(st.journal.get(journalId) ?? {}), ...journalDoc });
    },
    countRetracted: async (raceId) => [...st.journal.values()].filter((j) => j.raceId === raceId && j.retractReason === ret.RETRACT_REASON).length,
    markDone: async (docId, count, note) => { const r = st.races.get(String(docId)); r.penaltyRetractionDoneAt = ts(st.clock); r.penaltyRetractionCount = count; if (note) r.penaltyRetractionNote = note; st.marks = (st.marks || 0) + 1; },
    serverTimestamp, logger,
  };
  return st;
}
const race = (o = {}) => ({ id: 21, name: 'Test', status: 'upcoming', raceStartAt: ts(S + 600 * MIN), qualifyingStartAt: ts(S), qualifyingScheduledStartAt: ts(S), qualifyingStartSource: 'scheduled', ...o });
// écrit une pénalité automatique + son entrée de journal (même forme que le moteur)
function addAuto(st, { pid, key, type = 'late', eventMs, raceId = 21, leagueId = 'L1', amount = 5, withJournal = true, source = 'auto', eventTime }) {
  const penId = `pen_auto_${type}_${pid}_${key}`;
  st.penalties.set(penId, { playerId: pid.split('_')[0], raceId, leagueId, type, amount, source, eventTime: eventTime !== undefined ? eventTime : ts(eventMs), predictionId: pid, createdAt: ts(eventMs) });
  if (withJournal) st.journal.set(`${pid}_${key}`, { predictionId: pid, raceId, playerId: pid.split('_')[0], leagueId, eventType: 'create', eventTime: ts(eventMs), source: 'event', decision: type === 'late' ? 'applied-late' : 'applied-change', penaltyId: penId });
  return penId;
}
const iso = (ms) => new Date(ms).toISOString();
const ev = (id, ms, pid, before, after) => ({ id, time: iso(ms), predictionId: pid, before, after });
const pr = (pid, leagueId, podium, extra = {}) => ({ raceId: 21, playerId: pid.split('_')[0], leagueId, prediction: podium, modificationCount: 0, ...extra });

const results = []; let failures = 0;
function check(scn, label, cond, detail = '') { results.push({ scn, label, ok: !!cond, detail }); if (!cond) failures++; }
const hasLog = (st, level, re) => st.logs.some(([l, m]) => l === level && re.test(m));

(async () => {
  // ───────────── S1 : flux complet avec le VRAI moteur
  {
    const st = makeStore(); const scn = 'S1 heure réelle +30 min';
    st.races.set('21', race());
    const P = { P1: 'Norris', P2: 'Piastri', P3: 'Leclerc' }, P2 = { P1: 'Piastri', P2: 'Norris', P3: 'Leclerc' };
    const rA = await engine.handleActiveWrite(st.engineDeps, ev('e1', S - 5 * MIN, 'A_21', null, pr('A_21', 'L1', P)));          // avant l'horaire programmé : gratuit
    const rB = await engine.handleActiveWrite(st.engineDeps, ev('e2', S + 10 * MIN, 'B_21', null, pr('B_21', 'L1', P)));         // entre programmé et réel : late
    const rA2 = await engine.handleActiveWrite(st.engineDeps, ev('e3', S + 20 * MIN, 'A_21', pr('A_21', 'L1', P), pr('A_21', 'L1', P2, { modificationCount: 1 }))); // change
    check(scn, "avant l'horaire programmé : gratuit", rA.decision === 'free');
    check(scn, 'entre programmé et réel : 2 pénalités posées par le moteur (provisoire)', rB.decision === 'applied-late' && rA2.decision === 'applied-change' && st.penalties.size === 2);
    // l'heure réelle est posée (étape B) : +30 min, programmé conservé
    Object.assign(st.races.get('21'), { qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' });
    const rLate = await engine.handleActiveWrite(st.engineDeps, ev('e5', S + 15 * MIN, 'D_21', null, pr('D_21', 'L1', P))); // événement tardif arrivé après la pose de l'heure réelle
    check(scn, 'événement S+15 min traité APRES la pose de l\'heure réelle : gratuit', rLate.decision === 'free');
    const rC = await engine.handleActiveWrite(st.engineDeps, ev('e4', S + 95 * MIN, 'C_21', null, pr('C_21', 'L1', P)));   // après l'heure réelle : late conservée
    check(scn, "après l'heure réelle : pénalité posée", rC.decision === 'applied-late');
    check(scn, '3 pénalités avant retrait', st.penalties.size === 3);
    const nowMs = S + 100 * MIN; st.clock = nowMs;
    const sum = await ret.runPenaltyRetraction(st.retDeps, nowMs);
    check(scn, '2 pénalités retirées (eventTime < heure réelle)', sum.retracted === 2, JSON.stringify(sum));
    check(scn, 'la pénalité après l\'heure réelle est conservée', [...st.penalties.keys()].some((k) => k.includes('C_21')) && st.penalties.size === 1);
    const jB = st.journal.get(rB.journalId);
    check(scn, 'journal enrichi : retractedAt, retractReason, qualifyingStartAtActual', jB.retractedAt && jB.retractReason === 'qualification-started-later' && jB.qualifyingStartAtActual.toMillis() === S + 30 * MIN);
    check(scn, "l'entrée de journal n'est pas supprimée et garde sa décision d'origine", jB.decision === 'applied-late' && jB.penaltyId);
    const race21 = st.races.get('21');
    check(scn, 'marqueur posé + compteur = 2', race21.penaltyRetractionDoneAt && race21.penaltyRetractionCount === 2);
    // deuxième passage : aucun effet
    const before = st.commits; const sum2 = await ret.runPenaltyRetraction(st.retDeps, nowMs + 15 * MIN);
    check('S3 deuxième passage', 'sans effet (marqueur), aucun lot supplémentaire', st.commits === before && sum2.retracted === 0 && sum2.skipped['already-done'] === 1);
    // rejeu de l'événement e2 : le journal reste le marqueur, la pénalité n'est pas recréée
    const replay = await engine.handleActiveWrite(st.engineDeps, ev('e2', S + 10 * MIN, 'B_21', null, pr('B_21', 'L1', P)));
    check(scn, "rejeu de l'événement retiré : replay, pénalité NON recréée", replay.status === 'replay' && ![...st.penalties.keys()].some((k) => k.includes('B_21')));
    // rattrapage : le pronostic B (updatedAt = événement e2) ne recrée rien
    const outcome = await engine.catchUpOne(st.engineDeps, nowMs + 30 * MIN, { id: 'B_21', data: { ...pr('B_21', 'L1', P), updatedAt: ts(S + 10 * MIN) } });
    check(scn, 'rattrapage du pronostic dont la pénalité a été retirée : up-to-date, rien recréé', outcome === 'up-to-date' && ![...st.penalties.keys()].some((k) => k.includes('B_21')));
    // rattrapage d'un événement vraiment manqué APRES l'heure réelle : pénalité posée normalement
    const miss = await engine.catchUpOne(st.engineDeps, S + 300 * MIN, { id: 'E_21', data: { ...pr('E_21', 'L1', P), updatedAt: ts(S + 120 * MIN) } });
    check(scn, 'rattrapage inchangé : pronostic sans journal => needs-review, AUCUNE pénalité', miss === 'created' && st.journal.get('E_21_catchup-' + (S + 120 * MIN))?.decision === 'needs-review' && ![...st.penalties.keys()].some((k) => k.includes('E_21')));
  }

  // ───────────── S2 : pénalité déjà supprimée par l'admin
  {
    const st = makeStore(); const scn = 'S2 supprimée par un admin';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    const p1 = addAuto(st, { pid: 'B_21', key: 'e2', eventMs: S + 10 * MIN });
    const p2 = addAuto(st, { pid: 'A_21', key: 'e3', type: 'change', amount: 2, eventMs: S + 20 * MIN });
    st.penalties.delete(p1); // l'admin a supprimé la première
    const sum = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'seule la pénalité restante est retirée', sum.retracted === 1 && st.deletes.length === 1 && st.deletes[0] === p2);
    check(scn, "le journal de la pénalité déjà supprimée n'est pas touché", !st.journal.get('B_21_e2').retractedAt);
    check(scn, 'marqueur posé, compteur = 1', st.races.get('21').penaltyRetractionCount === 1);
  }

  // ───────────── S4 : échec en cours de lot, reprise
  {
    const st = makeStore(); const scn = 'S4 échec en cours de lot';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    const ids = [1, 2, 3].map((i) => addAuto(st, { pid: `P${i}_21`, key: `k${i}`, eventMs: S + (5 + i) * MIN }));
    st.failOn.add(ids[1]);
    const s1 = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'passage 1 : 1re retirée, 2e en échec, 3e non touchée', st.deletes.length === 1 && st.deletes[0] === ids[0] && st.penalties.has(ids[1]) && st.penalties.has(ids[2]));
    check(scn, 'marqueur NON posé, erreur journalisée avec l\'id de la course', !st.races.get('21').penaltyRetractionDoneAt && s1.errors === 1 && hasLog(st, 'error', /course id=21.*échec du retrait/));
    st.failOn.clear();
    const s2 = await ret.runPenaltyRetraction(st.retDeps, S + 115 * MIN);
    check(scn, 'passage 2 : reprise, 2 pénalités restantes retirées, aucune double suppression', s2.retracted === 2 && st.deletes.length === 3 && new Set(st.deletes).size === 3);
    check(scn, 'marqueur posé, compteur = 3 (cumul des deux passages)', st.races.get('21').penaltyRetractionDoneAt && st.races.get('21').penaltyRetractionCount === 3);
  }

  // ───────────── S5 : écart nul ou faible => marqueur à 0, rien retiré ni ajouté
  {
    const scn = 'S5 aucun retard (marqueur à 0)';
    const run = async (qMs, label, penMs = S + 50) => {
      const st = makeStore();
      st.races.set('21', race({ qualifyingStartAt: ts(qMs), qualifyingStartSource: 'actual' }));
      addAuto(st, { pid: 'B_21', key: 'e2', eventMs: penMs });
      const n = st.penalties.size;
      const sum = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
      const r = st.races.get('21');
      check(scn, `${label} : marqueur posé, compteur 0, note 'aucun-retard'`, !!r.penaltyRetractionDoneAt && r.penaltyRetractionCount === 0 && r.penaltyRetractionNote === 'aucun-retard' && sum.noDelayMarkers === 1);
      check(scn, `${label} : aucune pénalité retirée ni ajoutée`, st.deletes.length === 0 && st.penalties.size === n && st.journal.size === 1);
      const logsAfterPass1 = st.logs.length;
      const before = st.marks;
      const sum2 = await ret.runPenaltyRetraction(st.retDeps, S + 115 * MIN);
      const newLogs = st.logs.slice(logsAfterPass1);
      check(scn, `${label} : deuxième passage sans effet (aucun marqueur de plus, course ignorée)`, st.marks === before && sum2.skipped['already-done'] === 1 && st.deletes.length === 0);
      check(scn, `${label} : aucun log répété au 2e passage (seulement la synthèse)`, newLogs.length === 1 && newLogs[0][0] === 'info' && /Passage terminé/.test(newLogs[0][1]));
      return st;
    };
    const st1 = await run(S + 100, 'écart 0,1 s');
    // le log de marqueur n'est émis qu'UNE fois (au passage qui pose le marqueur)
    check(scn, "écart 0,1 s : le log « aucun retard » n'apparaît qu'une seule fois sur les 2 passages", st1.logs.filter(([, m]) => /aucun retard/.test(m)).length === 1);
    await run(S, 'écart nul (0 ms)');
    await run(S + 2000, 'écart EXACTEMENT 2 s');
    await run(S - 10 * MIN, 'heure réelle ANTERIEURE à l\'horaire programmé', S + 10 * MIN);
    // 2,001 s : le retrait s'applique (pas de marqueur "aucun-retard")
    const st = makeStore();
    st.races.set('21', race({ qualifyingStartAt: ts(S + 2001), qualifyingStartSource: 'actual' }));
    addAuto(st, { pid: 'B_21', key: 'e2', eventMs: S + 50 });
    await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'écart 2,001 s : le retrait agit (pénalité retirée), note absente, compteur 1', st.deletes.length === 1 && st.races.get('21').penaltyRetractionCount === 1 && st.races.get('21').penaltyRetractionNote === undefined);
  }

  // ───────────── S6 : le marqueur n'est PAS posé si la course n'est pas éligible
  {
    const scn = 'S6 course non éligible : pas de marqueur';
    const notMarked = async (label, data, nowMs = S + 100 * MIN) => {
      const st = makeStore();
      st.races.set('21', race({ qualifyingStartAt: ts(S + 100), qualifyingStartSource: 'actual', ...data }));
      addAuto(st, { pid: 'B_21', key: 'e2', eventMs: S + 50 });
      await ret.runPenaltyRetraction(st.retDeps, nowMs);
      const r = st.races.get('21');
      check(scn, label, !r.penaltyRetractionDoneAt && r.penaltyRetractionNote === undefined && st.deletes.length === 0 && st.penalties.size === 1);
    };
    await notMarked("source 'scheduled' (même avec écart nul)", { qualifyingStartSource: 'scheduled' });
    await notMarked("source 'manual'", { qualifyingStartSource: 'manual' });
    await notMarked('course annulée', { status: 'cancelled' });
    await notMarked('terminée depuis plus de 7 jours', { status: 'completed', raceStartAt: ts(S) }, S + 8 * 24 * 60 * MIN);
    await notMarked('heure programmée absente', { qualifyingScheduledStartAt: undefined });
    await notMarked('heure réelle illisible', { qualifyingStartAt: 'abc' });
    // terminée depuis moins de 7 jours : éligible => marqueur à 0
    const st = makeStore();
    st.races.set('21', race({ qualifyingStartAt: ts(S + 100), qualifyingStartSource: 'actual', status: 'completed', raceStartAt: ts(S) }));
    await ret.runPenaltyRetraction(st.retDeps, S + 6 * 24 * 60 * MIN);
    check(scn, 'terminée depuis moins de 7 jours : éligible, marqueur à 0', st.races.get('21').penaltyRetractionCount === 0 && !!st.races.get('21').penaltyRetractionDoneAt);
  }

  // ───────────── S7 : source manual / scheduled ignorées, statuts
  {
    const st = makeStore(); const scn = 'S7 source et statut';
    check(scn, 'source manual ignorée', ret.evaluateRace(race({ qualifyingStartSource: 'manual', qualifyingStartAt: ts(S + 30 * MIN) }), S).reason === 'source-not-actual');
    check(scn, 'source scheduled ignorée', ret.evaluateRace(race({ qualifyingStartAt: ts(S + 30 * MIN) }), S).reason === 'source-not-actual');
    const base = { qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' };
    check(scn, 'course terminée depuis < 7 j : examinée', ret.evaluateRace(race({ ...base, status: 'completed', raceStartAt: ts(S) }), S + 6 * 24 * 60 * MIN).eligible === true);
    check(scn, 'course terminée depuis > 7 j : ignorée', ret.evaluateRace(race({ ...base, status: 'completed', raceStartAt: ts(S) }), S + 8 * 24 * 60 * MIN).reason === 'completed-too-old');
    check(scn, 'course annulée : ignorée', ret.evaluateRace(race({ ...base, status: 'cancelled' }), S).reason === 'status');
    check(scn, 'marqueur déjà posé : ignorée', ret.evaluateRace(race({ ...base, penaltyRetractionDoneAt: ts(S) }), S).reason === 'already-done');
    check(scn, 'heure programmée absente : ignorée (warn)', ret.evaluateRace(race({ ...base, qualifyingScheduledStartAt: undefined }), S).reason === 'invalid-times');
    check(scn, 'heure réelle illisible : ignorée', ret.evaluateRace(race({ ...base, qualifyingStartAt: 'abc' }), S).reason === 'invalid-times');
  }

  // ───────────── S8 : eventTime invalide => conservée
  {
    const st = makeStore(); const scn = 'S8 eventTime invalide';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    const bad1 = addAuto(st, { pid: 'X_21', key: 'k1', eventMs: S + 5 * MIN, eventTime: 'garbage' });
    const bad2 = addAuto(st, { pid: 'Y_21', key: 'k2', eventMs: S + 5 * MIN, eventTime: null });
    const good = addAuto(st, { pid: 'Z_21', key: 'k3', eventMs: S + 6 * MIN });
    const sum = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'les 2 pénalités sans eventTime valide sont CONSERVÉES, la valide retirée', st.penalties.has(bad1) && st.penalties.has(bad2) && !st.penalties.has(good) && sum.kept === 2 && hasLog(st, 'warn', /sans eventTime exploitable/));
  }

  // ───────────── S9 : course sans pénalité
  {
    const st = makeStore(); const scn = 'S9 course sans pénalité';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    const sum = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'aucune suppression, marqueur posé, compteur = 0', sum.retracted === 0 && st.races.get('21').penaltyRetractionCount === 0 && st.races.get('21').penaltyRetractionDoneAt);
  }

  // ───────────── S10 : plusieurs ligues
  {
    const st = makeStore(); const scn = 'S10 plusieurs ligues';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    addAuto(st, { pid: 'A_21', key: 'k1', eventMs: S + 5 * MIN, leagueId: 'L1' });
    addAuto(st, { pid: 'A2_21', key: 'k2', type: 'change', amount: 3, eventMs: S + 6 * MIN, leagueId: 'L2' });
    addAuto(st, { pid: 'C_21', key: 'k3', eventMs: S + 40 * MIN, leagueId: 'L2', amount: 7 });
    await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'pénalités des deux ligues retirées, celle après l\'heure réelle conservée', st.deletes.length === 2 && st.penalties.size === 1 && [...st.penalties.values()][0].leagueId === 'L2');
  }

  // ───────────── S11 : pénalité sans entrée de journal
  {
    const st = makeStore(); const scn = 'S11 sans entrée de journal';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    addAuto(st, { pid: 'A_21', key: 'e7', eventMs: S + 5 * MIN, withJournal: false });
    check(scn, 'avant : aucune entrée', !st.journal.has('A_21_e7'));
    await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    const j = st.journal.get('A_21_e7');
    check(scn, 'pénalité supprimée + entrée CRÉÉE avec le même id (marqueur)', st.penalties.size === 0 && j && j.retractReason && j.source === 'retraction' && j.decision === 'retracted-without-journal' && j.predictionId === 'A_21');
    const rep = await engine.handleActiveWrite(st.engineDeps, ev('e7', S + 5 * MIN, 'A_21', null, pr('A_21', 'L1', { P1: 'a', P2: 'b', P3: 'c' })));
    check(scn, "rejeu de l'événement : replay, rien recréé", rep.status === 'replay' && st.penalties.size === 0);
  }

  // ───────────── S12 : plafond par passage
  {
    const st = makeStore(); const scn = 'S12 plafond';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    for (let i = 1; i <= 7; i++) addAuto(st, { pid: `P${i}_21`, key: `k${i}`, eventMs: S + i * MIN });
    const a = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN, { maxPerPass: 3 });
    check(scn, 'passage 1 : 3 retirées, pas de marqueur, warn de plafond', a.retracted === 3 && !st.races.get('21').penaltyRetractionDoneAt && hasLog(st, 'warn', /plafond de 3/));
    const b = await ret.runPenaltyRetraction(st.retDeps, S + 115 * MIN, { maxPerPass: 3 });
    check(scn, 'passage 2 : 3 de plus, toujours pas de marqueur', b.retracted === 3 && !st.races.get('21').penaltyRetractionDoneAt);
    const c = await ret.runPenaltyRetraction(st.retDeps, S + 130 * MIN, { maxPerPass: 3 });
    check(scn, 'passage 3 : la dernière, marqueur posé, compteur = 7, aucune double suppression', c.retracted === 1 && st.races.get('21').penaltyRetractionCount === 7 && new Set(st.deletes).size === 7 && st.deletes.length === 7);
    // plafond exactement atteint par la dernière pénalité : marqueur posé
    const st2 = makeStore(); st2.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    for (let i = 1; i <= 3; i++) addAuto(st2, { pid: `Q${i}_21`, key: `k${i}`, eventMs: S + i * MIN });
    await ret.runPenaltyRetraction(st2.retDeps, S + 100 * MIN, { maxPerPass: 3 });
    check(scn, 'exactement 3 pénalités et plafond 3 : tout est fait, marqueur posé', st2.races.get('21').penaltyRetractionDoneAt && st2.races.get('21').penaltyRetractionCount === 3);
    check(scn, 'valeur de production proposée', ret.MAX_RETRACTIONS_PER_PASS === 200);
  }

  // ───────────── S13 : une course en erreur n'empêche pas les autres
  {
    const st = makeStore(); const scn = 'S13 isolation des erreurs';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    st.races.set('22', race({ id: 22, qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    addAuto(st, { pid: 'A_21', key: 'k1', eventMs: S + 5 * MIN, raceId: 21 });
    addAuto(st, { pid: 'B_22', key: 'k2', eventMs: S + 5 * MIN, raceId: 22 });
    st.failList.add(21);
    const sum = await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'course 21 en erreur (error avec son id, sans marqueur), course 22 traitée', hasLog(st, 'error', /course id=21 : erreur : boom list 21/) && !st.races.get('21').penaltyRetractionDoneAt && st.races.get('22').penaltyRetractionCount === 1 && sum.errors === 1);
    // erreur de lecture des courses : propagée à l'appelant (index.js la journalise, error)
    st.listRacesError = true;
    let thrown = null; try { await ret.runPenaltyRetraction(st.retDeps, S); } catch (e) { thrown = e; }
    check(scn, 'erreur globale (liste des courses) remontée à l\'appelant', thrown && /boom listRaces/.test(thrown.message));
  }

  // ───────────── S14 : pénalités non automatiques intactes, id non standard
  {
    const st = makeStore(); const scn = 'S14 non automatiques / id atypique';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    st.penalties.set('pen_change_X_21_1793612953360', { playerId: 'X', raceId: 21, leagueId: 'L1', type: 'change', amount: 2, createdAt: ts(S + 5 * MIN) }); // ancienne, sans source
    st.penalties.set('pen_late_X_21_1793612953361', { playerId: 'X', raceId: 21, leagueId: 'L1', type: 'late', amount: 5, source: 'manual', eventTime: ts(S + 5 * MIN) });
    st.penalties.set('custom-id', { playerId: 'Y', raceId: 21, leagueId: 'L1', type: 'late', amount: 5, source: 'auto', eventTime: ts(S + 5 * MIN), predictionId: 'Y_21' });
    await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    check(scn, 'pénalités sans source ou source manual : jamais touchées', st.penalties.has('pen_change_X_21_1793612953360') && st.penalties.has('pen_late_X_21_1793612953361'));
    check(scn, 'id atypique : retirée, journal de secours retract_<id> créé', !st.penalties.has('custom-id') && st.journal.get('retract_custom-id')?.retractReason);
  }

  // ───────────── S15 : pronostic créé APRES (nouvel événement) avec l'heure réelle — non affecté
  {
    const st = makeStore(); const scn = 'S15 moteur inchangé après retrait';
    st.races.set('21', race({ qualifyingStartAt: ts(S + 30 * MIN), qualifyingStartSource: 'actual' }));
    addAuto(st, { pid: 'B_21', key: 'e2', eventMs: S + 10 * MIN });
    await ret.runPenaltyRetraction(st.retDeps, S + 100 * MIN);
    const r = await engine.handleActiveWrite(st.engineDeps, ev('e9', S + 200 * MIN, 'N_21', null, pr('N_21', 'L1', { P1: 'a', P2: 'b', P3: 'c' })));
    check(scn, 'un nouvel événement après l\'heure réelle est pénalisé normalement', r.decision === 'applied-late' && st.penalties.size === 1);
  }

  // ───────────── résultats
  const byScn = {};
  results.forEach((r) => { (byScn[r.scn] ||= []).push(r); });
  for (const [scn, rs] of Object.entries(byScn)) {
    console.log(`\n${scn}`);
    rs.forEach((r) => console.log(`  ${r.ok ? 'OK ' : 'KO '} ${r.label}${r.ok ? '' : '  → ' + r.detail}`));
  }
  console.log(`\n${results.length} vérifications, ${failures} échec(s)`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('ERREUR HARNAIS', e); process.exit(2); });
