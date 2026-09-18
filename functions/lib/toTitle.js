// Copie fidèle de toTitle() (définie localement dans
// src/screens/ReglagesSuperAdmin.jsx) — fonction pure (aucune dépendance
// React/Firebase), copiée telle quelle, aucune adaptation nécessaire.
// Utilisée par buildEntry() en repli quand un pilote n'est pas trouvé dans
// la collection `drivers` : met en forme le numéro de pilote brut.
function toTitle(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null
}

module.exports = { toTitle }
