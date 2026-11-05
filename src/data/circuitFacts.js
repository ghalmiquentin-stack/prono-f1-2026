// Faits des circuits du calendrier 2026 affichés dans la feuille de GP :
// longueur, nombre de tours, record du tour (temps, pilote, année).
// Relevés le 5 novembre 2026 sur les pages de chaque GP de formula1.com
// (faits chiffrés uniquement, aucun texte repris). Clé : le nom de la course
// (`race.name`), comme dans circuitTracks.js.
// À METTRE À JOUR si un record du tour est battu en cours de saison.
export const CIRCUIT_FACTS = {
  'Australie':           { km: 5.278, laps: 58, record: { time: '1:19.813', driver: 'Leclerc',    year: 2024 } },
  'Chine':               { km: 5.451, laps: 56, record: { time: '1:32.238', driver: 'Schumacher', year: 2004 } },
  'Japon':               { km: 5.807, laps: 53, record: { time: '1:30.965', driver: 'Antonelli',  year: 2025 } },
  'Bahreïn':             { km: 5.412, laps: 57, record: { time: '1:31.447', driver: 'de la Rosa', year: 2005 } },
  'Arabie Saoudite':     { km: 6.174, laps: 50, record: { time: '1:30.734', driver: 'Hamilton',   year: 2021 } },
  'Miami':               { km: 5.412, laps: 57, record: { time: '1:29.708', driver: 'Verstappen', year: 2023 } },
  'Canada':              { km: 4.361, laps: 70, record: { time: '1:13.078', driver: 'Bottas',     year: 2019 } },
  'Monaco':              { km: 3.337, laps: 78, record: { time: '1:12.909', driver: 'Hamilton',   year: 2021 } },
  'Barcelone-Catalunya': { km: 4.657, laps: 66, record: { time: '1:15.743', driver: 'Piastri',    year: 2025 } },
  'Autriche':            { km: 4.326, laps: 71, record: { time: '1:07.924', driver: 'Piastri',    year: 2025 } },
  'Grande-Bretagne':     { km: 5.891, laps: 52, record: { time: '1:27.097', driver: 'Verstappen', year: 2020 } },
  'Belgique':            { km: 7.004, laps: 44, record: { time: '1:44.701', driver: 'Perez',      year: 2024 } },
  'Hongrie':             { km: 4.381, laps: 70, record: { time: '1:16.627', driver: 'Hamilton',   year: 2020 } },
  'Pays-Bas':            { km: 4.259, laps: 72, record: { time: '1:11.097', driver: 'Hamilton',   year: 2021 } },
  'Italie':              { km: 5.793, laps: 53, record: { time: '1:20.901', driver: 'Norris',     year: 2025 } },
  'Espagne (Madrid)':    { km: 5.414, laps: 57, record: { time: '1:35.587', driver: 'Russell',    year: 2026 } },
  'Azerbaïdjan':         { km: 6.003, laps: 51, record: { time: '1:43.009', driver: 'Leclerc',    year: 2019 } },
  'Bahreïn (Sepang)':    { km: 5.543, laps: 56, record: { time: '1:34.080', driver: 'Vettel',     year: 2017 } },
  'Singapour':           { km: 4.927, laps: 62, record: { time: '1:33.808', driver: 'Hamilton',   year: 2025 } },
  'États-Unis':          { km: 5.513, laps: 56, record: { time: '1:36.169', driver: 'Leclerc',    year: 2019 } },
  'Mexique':             { km: 4.304, laps: 71, record: { time: '1:17.774', driver: 'Bottas',     year: 2021 } },
  'Brésil':              { km: 4.309, laps: 71, record: { time: '1:10.540', driver: 'Bottas',     year: 2018 } },
  'Las Vegas':           { km: 6.201, laps: 50, record: { time: '1:33.365', driver: 'Verstappen', year: 2025 } },
  'Qatar':               { km: 5.419, laps: 57, record: { time: '1:22.384', driver: 'Norris',     year: 2024 } },
  'Abu Dhabi':           { km: 5.281, laps: 58, record: { time: '1:25.637', driver: 'Magnussen',  year: 2024 } },
}
