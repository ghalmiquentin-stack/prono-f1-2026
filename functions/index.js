const { setGlobalOptions } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { fetchRaceResult } = require("./lib/fetchRaceResult");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
setGlobalOptions({ maxInstances: 10 });

// No arguments: in the Cloud Functions runtime, credentials are provided
// automatically by the platform (Application Default Credentials) — unlike
// the one-shot scripts/*.cjs, which run locally and must load
// serviceAccountKey.json explicitly.
admin.initializeApp();
const db = admin.firestore();

// Only start checking once a race has been running for a while (official
// results aren't posted instantly), and give up marking it after a longer
// delay so a genuinely stuck/unmappable race doesn't get retried forever.
const START_CHECKING_AFTER_MS = 2 * 60 * 60 * 1000; // 2h
const GIVE_UP_AFTER_MS = 3.5 * 60 * 60 * 1000; // 3h30

exports.autoFetchRaceResults = onSchedule(
  { schedule: "every 15 minutes", region: "europe-west9" },
  async () => {
    const now = Date.now();
    logger.info("[autoFetchRaceResults] Démarrage du passage planifié.");

    // Petite collection (~12 documents 'upcoming' à tout instant) — un seul
    // filtre d'égalité Firestore suffit, pas besoin d'index composite. Le
    // filtre temporel (raceStartAt) se fait ensuite côté code.
    const upcomingSnap = await db.collection("races").where("status", "==", "upcoming").get();
    if (upcomingSnap.empty) {
      logger.info("[autoFetchRaceResults] Aucune course 'upcoming', rien à faire.");
      return;
    }

    for (const raceDoc of upcomingSnap.docs) {
      const race = raceDoc.data();

      if (!race.raceStartAt) {
        logger.debug(`[autoFetchRaceResults] ${race.name} (id=${race.id}) sans raceStartAt exploitable, ignorée.`);
        continue;
      }

      const elapsedMs = now - race.raceStartAt.toMillis();
      if (elapsedMs < START_CHECKING_AFTER_MS) {
        logger.debug(`[autoFetchRaceResults] ${race.name} (id=${race.id}) pas encore candidate (départ il y a ${Math.round(elapsedMs / 60000)} min).`);
        continue;
      }

      logger.info(`[autoFetchRaceResults] Course candidate : ${race.name} (id=${race.id}), départ il y a ${Math.round(elapsedMs / 60000)} min.`);

      if (elapsedMs >= GIVE_UP_AFTER_MS) {
        if (race.autoFetchGaveUp !== true) {
          await raceDoc.ref.update({ autoFetchGaveUp: true });
          logger.warn(`[autoFetchRaceResults] Abandon pour ${race.name} (id=${race.id}) — plus de 3h30 sans résultat publié. autoFetchGaveUp posé.`);
        } else {
          logger.info(`[autoFetchRaceResults] ${race.name} (id=${race.id}) déjà marquée autoFetchGaveUp, ignorée.`);
        }
        continue;
      }

      let result;
      try {
        result = await fetchRaceResult(db, race);
      } catch (err) {
        logger.error(`[autoFetchRaceResults] Erreur OpenF1 pour ${race.name} (id=${race.id}) : ${err.message}`);
        continue;
      }

      if (!result) {
        logger.info(`[autoFetchRaceResults] Résultat pas encore publié pour ${race.name} (id=${race.id}), on retentera au prochain passage.`);
        continue;
      }

      // Relecture immédiate avant écriture : une saisie manuelle a pu
      // compléter le résultat entre le début de ce passage et maintenant.
      const freshSnap = await raceDoc.ref.get();
      if (freshSnap.data()?.status === "completed") {
        logger.info(`[autoFetchRaceResults] ${race.name} (id=${race.id}) déjà complété manuellement, ignoré.`);
        continue;
      }

      // Mise à jour ciblée UNIQUEMENT sur ces champs, jamais un .set() ni un
      // merge du document complet (le pattern de saveResult() dans
      // ReglagesSuperAdmin.jsx, qui réétale ...selectedRace en entier —
      // acceptable pour une saisie manuelle ponctuelle depuis un state déjà
      // à jour, mais risqué ici : ça écraserait silencieusement tout autre
      // champ avec une copie de course potentiellement obsolète).
      await raceDoc.ref.update({
        result,
        status: "completed",
        resultSource: "auto",
        autoFetchGaveUp: admin.firestore.FieldValue.delete(),
      });
      logger.info(`[autoFetchRaceResults] ✅ Résultat écrit automatiquement pour ${race.name} (id=${race.id}) : ${JSON.stringify(result)}`);
    }

    logger.info("[autoFetchRaceResults] Passage terminé.");
  }
);
