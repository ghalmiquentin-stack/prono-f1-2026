import ActiveLeagueBadge from './ActiveLeagueBadge'
import LeagueSwitcher from './LeagueSwitcher'
import PlayerBadge from './PlayerBadge'

// Rangée du haut des écrans Accueil, Courses, Classement et Stats : pastille de
// la ligue à gauche, pastille du joueur à droite.
//   - une seule ligue : le nom en texte simple (non cliquable) ;
//   - plusieurs ligues : pastille avec chevron qui ouvre le menu de changement.
// Aucune limite en caractères : quand la place manque, seule la pastille de la
// ligue se rétrécit (largeur minimale d'environ 10 caractères, 96 px). La
// pastille du joueur ne se coupe qu'en dernier recours (écran très étroit) :
// elle garde au moins la place de la ligue minimale (max-w de PlayerBadge) et
// c'est alors le pseudo qui se coupe avec « … ». Avatar et points restent visibles.
export default function HeaderBadges({
  leagueName,
  leagueId,
  leagueOptions = [],
  onSwitchLeague,
  onManageLeagues,
  player,
  onOpenProfile,
}) {
  const canSwitch = leagueOptions.length > 1 && !!onSwitchLeague
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      {leagueName ? (
        canSwitch ? (
          <LeagueSwitcher
            activeLeagueId={leagueId}
            activeName={leagueName}
            options={leagueOptions}
            onSelect={onSwitchLeague}
            onManage={onManageLeagues}
          />
        ) : (
          <ActiveLeagueBadge name={leagueName} />
        )
      ) : (
        <span />
      )}
      <PlayerBadge {...player} onClick={onOpenProfile} />
    </div>
  )
}
