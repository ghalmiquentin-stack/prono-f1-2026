// Résumé en lecture seule des règles d'une ligue (trois lignes dans une carte) : récapitulatif de
// Créer une ligue et aperçu de Rejoindre une ligue. Mêmes valeurs par défaut que les Réglages de
// ligue quand une règle manque (activée, 5 et 10 points).
function Line({ label, value, red = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-b-0">
      <p className="text-sm font-bold min-w-0">{label}</p>
      <p className={`text-base font-black text-right shrink-0 ${red ? 'text-accent' : 'text-white'}`}>{value}</p>
    </div>
  )
}

export default function LeagueRulesSummary({ rules = {} }) {
  const mod = rules.modificationPenalty
  const late = rules.postQualifsPenalty
  const modOn = mod?.enabled ?? true
  const lateOn = late?.enabled ?? true
  const hideOn = rules.hidePredictionsBeforeRace?.enabled ?? true
  return (
    <div className="card px-4">
      <Line label="Pénalité sur modification" value={modOn ? `−${mod?.amount ?? 5} pts` : 'Désactivée'} red={modOn} />
      <Line label="Pénalité après les qualifs" value={lateOn ? `−${late?.amount ?? 10} pts` : 'Désactivée'} red={lateOn} />
      <Line label="Pronostics masqués avant la course" value={hideOn ? 'Activé' : 'Désactivé'} />
    </div>
  )
}
