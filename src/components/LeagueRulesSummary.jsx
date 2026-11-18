import { PillOn, PillOff } from './StatusPill'

// Résumé en lecture seule des règles d'une ligue (trois lignes dans une carte) : récapitulatif de
// Créer une ligue et aperçu de Rejoindre une ligue. Même présentation que les champs de règles :
// montant rouge en gras quand une pénalité est activée, pastille grise « Désactivée », pastille
// verte « Activé » pour l'option sans montant. Mêmes valeurs par défaut que les Réglages de ligue
// quand une règle manque (activée, 5 et 10 points).
function Line({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-b-0">
      <p className="text-sm font-bold min-w-0">{label}</p>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Penalty({ on, amount }) {
  return on
    ? <p className="text-base font-black text-accent text-right">−{amount} pts</p>
    : <PillOff>Désactivée</PillOff>
}

export default function LeagueRulesSummary({ rules = {} }) {
  const mod = rules.modificationPenalty
  const late = rules.postQualifsPenalty
  const modOn = mod?.enabled ?? true
  const lateOn = late?.enabled ?? true
  const hideOn = rules.hidePredictionsBeforeRace?.enabled ?? true
  return (
    <div className="card px-4">
      <Line label="Pénalité sur modification"><Penalty on={modOn} amount={mod?.amount ?? 5} /></Line>
      <Line label="Pénalité après les qualifs"><Penalty on={lateOn} amount={late?.amount ?? 10} /></Line>
      <Line label="Pronostics masqués avant la course">
        {hideOn ? <PillOn>Activé</PillOn> : <PillOff>Désactivé</PillOff>}
      </Line>
    </div>
  )
}
