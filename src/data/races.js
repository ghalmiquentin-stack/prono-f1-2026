// raceTime    = heure française locale (affichage)
// raceTimeUTC = heure UTC correspondante (countdown)
//   France : CET (UTC+1) avant le 29 mars, CEST (UTC+2) du 29 mars au 25 oct, CET ensuite
export const RACES = [
  { id:  1, name: 'Australie',          flag: '🇦🇺', city: 'Melbourne',    circuit: 'Albert Park',          date: '2026-03-08', raceTime: '05:00', raceTimeUTC: '04:00', status: 'upcoming', result: null },
  { id:  2, name: 'Chine',              flag: '🇨🇳', city: 'Shanghai',     circuit: 'Shanghai',             date: '2026-03-15', raceTime: '08:00', raceTimeUTC: '07:00', status: 'upcoming', result: null },
  { id:  3, name: 'Japon',              flag: '🇯🇵', city: 'Suzuka',       circuit: 'Suzuka',               date: '2026-03-29', raceTime: '07:00', raceTimeUTC: '05:00', status: 'upcoming', result: null },
  { id:  4, name: 'Bahreïn',            flag: '🇧🇭', city: 'Sakhir',       circuit: 'Sakhir',               date: '2026-04-12', raceTime: '17:00', raceTimeUTC: '15:00', status: 'upcoming', result: null },
  { id:  5, name: 'Arabie Saoudite',    flag: '🇸🇦', city: 'Djeddah',      circuit: 'Djeddah',              date: '2026-04-19', raceTime: '19:00', raceTimeUTC: '17:00', status: 'upcoming', result: null },
  { id:  6, name: 'Miami',              flag: '🇺🇸', city: 'Miami',        circuit: 'Miami International',  date: '2026-05-03', raceTime: '22:00', raceTimeUTC: '20:00', status: 'upcoming', result: null },
  { id:  7, name: 'Canada',             flag: '🇨🇦', city: 'Montréal',     circuit: 'Gilles Villeneuve',    date: '2026-05-24', raceTime: '22:00', raceTimeUTC: '20:00', status: 'upcoming', result: null },
  { id:  8, name: 'Monaco',             flag: '🇲🇨', city: 'Monte-Carlo',  circuit: 'Circuit de Monaco',    date: '2026-06-07', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id:  9, name: 'Espagne',            flag: '🇪🇸', city: 'Barcelone',    circuit: 'Circuit de Barcelone', date: '2026-06-14', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 10, name: 'Autriche',           flag: '🇦🇹', city: 'Spielberg',    circuit: 'Red Bull Ring',        date: '2026-06-28', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 11, name: 'Grande-Bretagne',    flag: '🇬🇧', city: 'Silverstone',  circuit: 'Silverstone',          date: '2026-07-05', raceTime: '16:00', raceTimeUTC: '14:00', status: 'upcoming', result: null },
  { id: 12, name: 'Belgique',           flag: '🇧🇪', city: 'Spa',          circuit: 'Spa-Francorchamps',    date: '2026-07-19', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 13, name: 'Hongrie',            flag: '🇭🇺', city: 'Budapest',     circuit: 'Hungaroring',          date: '2026-07-26', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 14, name: 'Pays-Bas',           flag: '🇳🇱', city: 'Zandvoort',    circuit: 'Zandvoort',            date: '2026-08-23', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 15, name: 'Italie',             flag: '🇮🇹', city: 'Monza',        circuit: 'Monza',                date: '2026-09-06', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 16, name: 'Espagne (Madrid)',   flag: '🇪🇸', city: 'Madrid',       circuit: 'IFEMA Madrid',         date: '2026-09-13', raceTime: '15:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
  { id: 17, name: 'Azerbaïdjan',        flag: '🇦🇿', city: 'Bakou',        circuit: 'Bakou',                date: '2026-09-26', raceTime: '13:00', raceTimeUTC: '11:00', status: 'upcoming', result: null },
  { id: 18, name: 'Singapour',          flag: '🇸🇬', city: 'Marina Bay',   circuit: 'Marina Bay',           date: '2026-10-11', raceTime: '14:00', raceTimeUTC: '12:00', status: 'upcoming', result: null },
  { id: 19, name: 'États-Unis',         flag: '🇺🇸', city: 'Austin',       circuit: 'COTA',                 date: '2026-10-25', raceTime: '21:00', raceTimeUTC: '20:00', status: 'upcoming', result: null },
  { id: 20, name: 'Mexique',            flag: '🇲🇽', city: 'Mexico',       circuit: 'Hermanos Rodríguez',   date: '2026-11-01', raceTime: '21:00', raceTimeUTC: '20:00', status: 'upcoming', result: null },
  { id: 21, name: 'Brésil',             flag: '🇧🇷', city: 'São Paulo',    circuit: 'Interlagos',           date: '2026-11-08', raceTime: '18:00', raceTimeUTC: '17:00', status: 'upcoming', result: null },
  { id: 22, name: 'Las Vegas',          flag: '🇺🇸', city: 'Las Vegas',    circuit: 'Las Vegas Strip',      date: '2026-11-22', raceTime: '05:00', raceTimeUTC: '04:00', status: 'upcoming', result: null },
  { id: 23, name: 'Qatar',              flag: '🇶🇦', city: 'Losail',       circuit: 'Losail',               date: '2026-11-29', raceTime: '17:00', raceTimeUTC: '16:00', status: 'upcoming', result: null },
  { id: 24, name: 'Abu Dhabi',          flag: '🇦🇪', city: 'Yas Marina',   circuit: 'Yas Marina',           date: '2026-12-06', raceTime: '14:00', raceTimeUTC: '13:00', status: 'upcoming', result: null },
]
