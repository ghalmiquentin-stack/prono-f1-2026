// Pastilles d'état des règles d'une ligue : verte « Activé », grise « Désactivé(e) ». Partagées par les champs
// de règles (RuleAccordionItem) et le résumé en lecture seule (LeagueRulesSummary) pour que les deux
// écrans disent la même chose de la même façon.
const PILL = 'inline-flex items-center px-2.5 h-6 rounded-full border text-xs font-bold leading-none'

export function PillOn({ children }) {
  return <span className={`${PILL} border-green-500/40 bg-green-500/15 text-green-400`}>{children}</span>
}

export function PillOff({ children }) {
  return <span className={`${PILL} border-border bg-surfaceHigh text-muted`}>{children}</span>
}
