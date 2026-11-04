import { useState } from 'react'
import {
  POINTS_EXACT,
  POINTS_PODIUM,
  PERFECT_PODIUM_BONUS,
  STREAK_LENGTH,
  STREAK_BONUS,
} from '../utils/scoring'
import ActiveLeagueBadge from '../components/ActiveLeagueBadge'
import LeagueSwitcher from '../components/LeagueSwitcher'

const POINT_TILES = [
  { value: `+${POINTS_EXACT}`, label: 'Bonne position', color: '#22C55E' },
  { value: `+${POINTS_PODIUM}`, label: 'Sur le podium, mauvaise place', color: '#F59E0B' },
  { value: '0', label: 'Hors podium', color: '#6B6B8A' },
]

const WEEKEND_STEPS = [
  {
    title: 'Avant les qualifs',
    detail: "Pronostique et modifie autant que tu veux. C'est gratuit.",
    color: '#22C55E',
  },
  {
    title: 'Dès le départ des qualifs',
    detail: 'Un premier prono ou une modification peut coûter des points, selon les réglages de ta ligue.',
    color: '#F59E0B',
  },
  {
    title: 'Au départ de la course',
    detail: 'Plus rien ne bouge. Les pronostics sont verrouillés.',
    color: '#E8002D',
  },
]

const GOOD_TO_KNOW = [
  {
    icon: '🏆',
    title: 'Un prono par ligue',
    detail: "Tu pronostiques ligue par ligue. Tes choix peuvent être différents d'une ligue à l'autre.",
  },
  {
    icon: '🏁',
    title: 'Les Grands Prix seulement',
    detail: 'Les courses Sprint ne se pronostiquent pas.',
  },
  {
    icon: '🕒',
    title: 'Les horaires sont à ton heure',
    detail: "Qualifs et course s'affichent dans ton fuseau horaire.",
  },
  {
    icon: '🤝',
    title: 'Égalité',
    detail: 'À points égaux, les joueurs partagent le même rang.',
  },
  {
    icon: '🛡️',
    title: 'Une pénalité injuste ?',
    detail: "L'admin de ta ligue peut l'annuler.",
  },
]

function SectionTitle({ children }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent mb-2.5">{children}</p>
}

// Une ligne de réglage de ligue : libellé, moment d'application, valeur.
function RuleRow({ title, detail, value, color }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[11px] border-t border-border">
      <div className="min-w-0">
        <p className="text-[13px] font-bold">{title}</p>
        <p className="text-xs text-muted mt-0.5 leading-snug">{detail}</p>
      </div>
      <p className="text-[15px] font-black whitespace-nowrap" style={{ color }}>{value}</p>
    </div>
  )
}

function penaltyValue(rule) {
  return rule?.enabled ? { value: `-${rule.amount} pt${rule.amount > 1 ? 's' : ''}`, color: '#E8002D' } : { value: 'Désactivée', color: '#9494AC' }
}

// Bloc « Ta ligue » : les réglages de la ligue consultée. Avec plusieurs ligues,
// le même menu que l'en-tête permet de CONSULTER une autre ligue sans changer la
// ligue active de l'application (le changement de ligue se fait par l'en-tête
// des écrans principaux ou depuis « Mes ligues »).
function LeagueRulesBlock({ leagues, activeLeagueId }) {
  const [viewedId, setViewedId] = useState(activeLeagueId)
  const viewed = leagues.find(l => l.id === viewedId) ?? leagues.find(l => l.id === activeLeagueId) ?? leagues[0]
  if (!viewed) return null

  const rules = viewed.rules ?? {}
  const modification = penaltyValue(rules.modificationPenalty)
  const late = penaltyValue(rules.postQualifsPenalty)
  const hidden = rules.hidePredictionsBeforeRace?.enabled

  return (
    <div className="mt-6">
      <SectionTitle>Ta ligue</SectionTitle>
      <div className="card p-3.5">
        <div className="flex items-center justify-between gap-3">
          {leagues.length > 1 ? (
            <div className="flex min-w-0">
              <LeagueSwitcher
                activeLeagueId={viewed.id}
                activeName={viewed.name}
                options={leagues}
                onSelect={setViewedId}
                markedLeagueId={activeLeagueId}
              />
            </div>
          ) : (
            <ActiveLeagueBadge name={viewed.name} />
          )}
          {viewed.id === activeLeagueId && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-green-500">Ligue active</span>
          )}
        </div>

        <div className="mt-3">
          <RuleRow
            title="Modifier ton podium"
            detail="Après le départ des qualifs"
            value={modification.value}
            color={modification.color}
          />
          <RuleRow
            title="Premier prono tardif"
            detail="Après le départ des qualifs"
            value={late.value}
            color={late.color}
          />
          <RuleRow
            title="Pronostics masqués"
            detail="Invisibles des autres jusqu'au départ de la course"
            value={hidden ? 'Activé' : 'Désactivé'}
            color={hidden ? '#22C55E' : '#9494AC'}
          />
        </div>
      </div>
    </div>
  )
}

// Page « Règles ». `leagues` ([{ id, name, rules }]) et `activeLeagueId`
// alimentent le bloc « Ta ligue » ; sans eux (écrans Créer / Rejoindre une
// ligue, où ce composant s'ouvre en feuille), seul le contenu commun à toutes
// les ligues s'affiche.
export default function ReglesDuJeu({ leagues = null, activeLeagueId = null }) {
  const hasLeagues = Array.isArray(leagues) && leagues.length > 0

  return (
    <div className="pb-4">
      <div className="px-5 pt-5 pb-1">
        <h1 className="text-2xl font-black tracking-tight">Règles</h1>
        <p className="text-sm text-muted">L'essentiel, en une minute</p>
      </div>

      <div className="px-5">
        {/* ── Les points ── */}
        <div className="mt-6">
          <SectionTitle>Les points</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {POINT_TILES.map(tile => (
              <div key={tile.label} className="card px-1.5 py-3 text-center">
                <p className="text-[26px] font-black leading-none" style={{ color: tile.color }}>{tile.value}</p>
                <p className="text-[11px] text-muted mt-1.5 leading-tight">{tile.label}</p>
              </div>
            ))}
          </div>

          <div className="card flex items-center gap-3 px-3 py-2.5 mt-2">
            <p className="text-xl font-black text-gold min-w-[44px]">+{PERFECT_PODIUM_BONUS}</p>
            <div>
              <p className="text-[13px] font-extrabold">Podium parfait</p>
              <p className="text-xs text-muted leading-snug">Les 3 places sont exactes.</p>
            </div>
          </div>

          <div className="card flex items-center gap-3 px-3 py-2.5 mt-2">
            <p className="text-xl font-black text-gold min-w-[44px]">+{STREAK_BONUS}</p>
            <div>
              <p className="text-[13px] font-extrabold">Bonus série</p>
              <p className="text-xs text-muted leading-snug">
                Meilleur score net sur {STREAK_LENGTH} Grands Prix d'affilée.
              </p>
            </div>
          </div>

          <div className="mt-2 ml-3 pl-3 border-l-2 border-gold space-y-1.5">
            <p className="text-xs text-muted leading-snug">
              Le meilleur score net d'un GP (pénalités comprises) le gagne. {STREAK_LENGTH} victoires d'affilée = +{STREAK_BONUS}, et ça se répète.
            </p>
            <p className="text-xs text-muted leading-snug">
              Ex æquo en tête : tous gagnent le GP. Une course sans victoire remet le compteur à zéro.
            </p>
          </div>
        </div>

        {/* ── Un week-end de course ── */}
        <div className="mt-6">
          <SectionTitle>Un week-end de course</SectionTitle>
          <div className="relative pl-[26px] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border before:content-['']">
            {WEEKEND_STEPS.map(step => (
              <div key={step.title} className="relative mb-3.5 last:mb-0">
                <span
                  className="absolute -left-[26px] top-[3px] w-4 h-4 rounded-full border-[3px] border-bg"
                  style={{ backgroundColor: step.color }}
                  aria-hidden="true"
                />
                <p className="text-sm font-extrabold">{step.title}</p>
                <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bon à savoir ── */}
        <div className="mt-6">
          <SectionTitle>Bon à savoir</SectionTitle>
          <div className="divide-y divide-border">
            {GOOD_TO_KNOW.map(item => (
              <div key={item.title} className="flex gap-3 py-3 first:pt-0">
                <div className="w-8 h-8 rounded-lg bg-surfaceHigh flex items-center justify-center shrink-0 text-base" aria-hidden="true">
                  {item.icon}
                </div>
                <div>
                  <p className="text-[13.5px] font-extrabold">{item.title}</p>
                  <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ta ligue (réglages de la ligue consultée) ── */}
        {hasLeagues && <LeagueRulesBlock leagues={leagues} activeLeagueId={activeLeagueId} />}
      </div>
    </div>
  )
}
