// Read-only summary of a league's rules — shared between the "Rejoindre une
// ligue" preview and the "Voir les règles" view for existing members.
export default function LeagueRulesSummary({ rules = {} }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
        <p className="text-sm font-bold">Pénalité modification podium</p>
        <p className="font-bold text-sm" style={{ color: rules.modificationPenalty?.enabled ? '#E8002D' : undefined }}>
          {rules.modificationPenalty?.enabled ? `-${rules.modificationPenalty.amount} pts` : 'Désactivée'}
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
        <p className="text-sm font-bold">Pénalité prono après qualifs</p>
        <p className="font-bold text-sm" style={{ color: rules.postQualifsPenalty?.enabled ? '#E8002D' : undefined }}>
          {rules.postQualifsPenalty?.enabled ? `-${rules.postQualifsPenalty.amount} pts` : 'Désactivée'}
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl bg-surfaceHigh/50">
        <p className="text-sm font-bold">Pronostics masqués avant course</p>
        <p className="font-bold text-sm">{rules.hidePredictionsBeforeRace?.enabled ? 'Activé' : 'Désactivé'}</p>
      </div>
    </div>
  )
}
