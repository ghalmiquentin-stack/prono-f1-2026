/**
 * Copie volontairement dupliquée de RACE_COUNTRY_MAP (src/utils/openf1.js),
 * sans aucun import de l'app — l'original ne peut pas être réutilisé tel
 * quel ici : son fichier porteur (src/utils/openf1.js) importe upsertDoc
 * depuis src/hooks/useFirestore.js, qui utilise le SDK Firestore CLIENT et
 * src/firebase.js (config lue via import.meta.env, syntaxe Vite indisponible
 * dans l'environnement Cloud Functions/Node).
 *
 * À garder synchronisée manuellement si RACE_COUNTRY_MAP est modifiée côté
 * app — aucune dépendance entre les deux fichiers, donc aucune mise à jour
 * automatique.
 */
const RACE_COUNTRY_MAP = {
  'Australie': 'Australia', 'Chine': 'China', 'Japon': 'Japan',
  'Bahreïn': 'Bahrain', 'Arabie Saoudite': 'Saudi Arabia',
  'Miami': 'United States', 'Émilie-Romagne': 'Italy', 'Monaco': 'Monaco',
  'Canada': 'Canada', 'Espagne': 'Spain', 'Barcelone-Catalunya': 'Spain',
  'Espagne (Madrid)': 'Spain', 'Autriche': 'Austria',
  'Grande-Bretagne': 'United Kingdom', 'Belgique': 'Belgium',
  'Hongrie': 'Hungary', 'Pays-Bas': 'Netherlands', 'Italie': 'Italy',
  'Azerbaïdjan': 'Azerbaijan', 'Singapour': 'Singapore',
  // Bahrain GP relocated to Sepang/Kuala Lumpur — OpenF1 still lists it under
  // country_name 'Bahrain' (the official race branding), not 'Malaysia'.
  'Bahreïn (Sepang)': 'Bahrain',
  'États-Unis': 'United States', 'Mexique': 'Mexico', 'Brésil': 'Brazil',
  'Las Vegas': 'United States', 'Qatar': 'Qatar', 'Abu Dhabi': 'United Arab Emirates',
}

module.exports = { RACE_COUNTRY_MAP }
