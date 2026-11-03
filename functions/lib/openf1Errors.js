/**
 * Classification des erreurs HTTP d'OpenF1 — sert uniquement à choisir le
 * NIVEAU et le TEXTE d'un log, jamais le flux de contrôle.
 *
 * fetchQualifying.js et fetchRaceResult.js lèvent, pour toute réponse HTTP non
 * OK : `OpenF1 error <status> (<appel>)` (appel = sessions, meetings,
 * starting_grid, session_result). Le format est figé ici ; le script de
 * simulation des logs vérifie, avec les vrais modules, qu'il correspond.
 *
 * Deux cas attendus, qui ne sont PAS des erreurs :
 *   - 404 sur starting_grid : la grille n'est pas encore publiée ;
 *   - 401 : OpenF1 limite l'accès temps réel pendant une séance live.
 * Dans les deux cas le passage suivant (15 min plus tard) retente.
 */

const OPENF1_ERROR_RE = /^OpenF1 error (\d{3}) \(([^)]+)\)$/

/** @returns {{ status: number, call: string } | null}  null = autre erreur (réseau, 5xx lu autrement, JSON...) */
function classifyOpenF1Error(err) {
  const m = OPENF1_ERROR_RE.exec(String(err?.message ?? ''))
  return m ? { status: Number(m[1]), call: m[2] } : null
}

const isGridNotPublished = (info) => info?.status === 404 && info.call === 'starting_grid'
const isRealtimeLimited = (info) => info?.status === 401

// Texte commun du 401 (accès temps réel limité pendant une séance live).
const OPENF1_401_TEXT = 'OpenF1 répond 401 (accès temps réel limité pendant une séance)'

module.exports = { classifyOpenF1Error, isGridNotPublished, isRealtimeLimited, OPENF1_401_TEXT }
