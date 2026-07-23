import RuleAccordionItem from './RuleAccordionItem'

export default function LeagueRulesFields({
  modEnabled, setModEnabled, modAmount, setModAmount, modAmountInvalid,
  postQualEnabled, setPostQualEnabled, postQualAmount, setPostQualAmount, postQualAmountInvalid,
  hideEnabled, setHideEnabled,
}) {
  return (
    <div>
      <RuleAccordionItem
        title="Pénalité sur modification du podium"
        description="Un joueur peut changer son pronostic autant de fois qu'il veut avant le départ. Chaque changement coûte des points s'il est activé."
        checked={modEnabled}
        onToggle={setModEnabled}
        amount={modAmount}
        onAmountChange={setModAmount}
        amountInvalid={modAmountInvalid}
      />
      <RuleAccordionItem
        title="Pénalité sur pronostic après les qualifications"
        description="Un pronostic fait après les qualifications est fait en connaissant la grille de départ. Cette pénalité le signale à l'administrateur."
        checked={postQualEnabled}
        onToggle={setPostQualEnabled}
        amount={postQualAmount}
        onAmountChange={setPostQualAmount}
        amountInvalid={postQualAmountInvalid}
      />
      <RuleAccordionItem
        title="Masquer les pronostics avant le départ de la course"
        description="Les pronostics des autres joueurs restent invisibles jusqu'au départ de la course, pour éviter toute influence."
        checked={hideEnabled}
        onToggle={setHideEnabled}
      />
    </div>
  )
}
