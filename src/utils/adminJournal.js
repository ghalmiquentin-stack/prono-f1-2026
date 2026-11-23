// Journal des interventions des admins (collection adminLog, ajout seul) : libellés partagés par l'écran du
// journal et le lien du Classement. Aucune dépendance à React ni à Firebase.

// Familles pour les filtres de l'écran.
export const KIND_GROUP = {
  'prediction-create': 'pronos',
  'prediction-edit': 'pronos',
  'penalty-add': 'penalites',
  'penalty-remove': 'penalites',
}

const POSITIONS = ['P1', 'P2', 'P3']

export function journalTitle(entry) {
  const by = entry.byName || 'Un admin'
  const who = entry.playerName || 'un joueur'
  switch (entry.kind) {
    case 'prediction-create': return `${by} a saisi le prono de ${who}`
    case 'prediction-edit': return `${by} a corrigé le prono de ${who}`
    case 'penalty-add': return `${by} a ajouté une pénalité à ${who}`
    case 'penalty-remove': return `${by} a retiré une pénalité à ${who}`
    default: return `${by} est intervenu sur ${who}`
  }
}

// Ligne « pénalité » d'une entrée du journal (null si la ligue n'avait rien à appliquer).
export function journalPenaltyLine(entry) {
  if (entry.kind === 'penalty-add' || entry.kind === 'penalty-remove') {
    const which = entry.penaltyType === 'change' ? 'de modification' : 'de retard'
    const auto = entry.kind === 'penalty-remove' && entry.penaltySource === 'auto' ? ' automatique' : ''
    return entry.kind === 'penalty-add'
      ? `Pénalité ${which} ajoutée : −${entry.penaltyAmount} pts`
      : `Pénalité${auto} ${which} retirée : ${entry.penaltyAmount} pts rendus`
  }
  const type = entry.penaltyType === 'change' || entry.kind === 'prediction-edit' ? 'de modification' : 'de retard'
  if (entry.penaltyChoice === 'applied') return `Pénalité ${type} appliquée : −${entry.penaltyAmount} pts`
  if (entry.penaltyChoice === 'waived') return `Pénalité ${type} non appliquée`
  return null
}

// Podium d'une intervention en codes pilotes : « VER · RUS · HAD » (codeOf : nom -> code).
export function podiumLine(podium, codeOf) {
  if (!podium) return null
  return POSITIONS.map(pos => (podium[pos] ? codeOf(podium[pos]) : '?')).join(' · ')
}

const toMs = (v) => {
  if (v == null) return Date.now() // écriture locale pas encore confirmée : la plus récente
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

// Plus récent d'abord.
export const sortJournal = (entries) => [...entries].sort((a, b) => toMs(b.at) - toMs(a.at))
