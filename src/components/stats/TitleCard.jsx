import { useState } from 'react'
import useElementWidth from '../../hooks/useElementWidth'
import { Info } from 'lucide-react'
import StatsCard from './StatsCard'
import BottomSheet from '../BottomSheet'
import { computeTitleRace } from '../../utils/titleRace'
import { ptsLabel } from '../../utils/standings'
import { MAX_POINTS_PER_GP, STREAK_BONUS } from '../../utils/statsData'

// « La course au titre » : moi et le premier (ou le deuxième si je suis premier) sur une piste
// jusqu'à l'arrivée. Une phrase donne le verdict, une ligne d'aide dit ce qu'il faut ; le détail
// du calcul est dans la feuille ⓘ. La carte n'existe pas quand il ne reste plus de GP : un écran
// de fin de saison prendra le relais.

const TRACK = '#2E2E42'
const MUTED = '#9494AC'
const CONNECTOR = 'rgba(255,255,255,0.22)'
const GOLD = '#FFD700'
const SURFACE = '#1E1E2E'
const MAX_WIDTH = 560
const X_START = 18
const RIGHT_MARGIN = 34 // place du drapeau d'arrivée
const NAME_CHAR_WIDTH = 6.2 // largeur approximative d'une lettre en 11 px gras
const ROW_1 = 82 // ligne de base des prénoms, premier niveau
const ROW_2 = 98 // deuxième niveau
const MIN_AVATAR_GAP = 44 // entre les centres des deux avatars (leur rayon est de 15 px : il reste 14 px entre les cercles)
const MIN_REMAINING_PX = 96 // tronçon « reste à jouer » : de quoi écrire « 150 pts à jouer »

// Les noms ne sont pas écrits sous les avatars : une légende dessous les donne en entier, quelle que
// soit leur longueur (un pseudo peut avoir jusqu'à 20 lettres).
export default function TitleCard({ data, minAvatarGap = MIN_AVATAR_GAP }) {
  const { me, list, completed, upcoming } = data
  const [info, setInfo] = useState(false)
  const [boxRef, boxWidth] = useElementWidth()
  const race = computeTitleRace({ list, me, remaining: upcoming.length })
  if (!race) return null

  const { scenario, remaining, leader, isLeader, rival, threat, gap, decided, potRelevant, bonusRelevant, perGp, leadOverThreat, leadMissing } = race
  const disputed = completed.length

  let headline, help
  if (scenario === 'leaderDecided') {
    headline = 'Tu es champion'
    help = 'Même si tu ne marques plus rien, personne ne peut te rattraper.'
  } else if (scenario === 'chaserDecided') {
    headline = `${leader.name} est champion`
    help = "Même s'il ne marque plus rien et que tu gagnes tous les GP, tu ne peux plus le rattraper."
  } else if (scenario === 'tie') {
    headline = `À égalité avec ${rival.name}`
    help = 'Le titre se joue sur les GP restants.'
  } else if (scenario === 'out') {
    headline = `Tu ne peux plus rattraper ${leader.name}`
    help = 'Le titre reste ouvert pour les autres.'
  } else if (scenario === 'leaderOpen') {
    headline = <>Tu mènes de <b style={{ color: me.color }}>{ptsLabel(gap)}</b> sur {rival.name}</>
    help = `Titre assuré dès que ton avance dépasse ${race.pot(threat)} pts.`
  } else {
    headline = <>Tu as <b style={{ color: me.color }}>{ptsLabel(gap)}</b> de retard sur {leader.name}</>
    help = <>Pour le rattraper : <b className="text-white">+{ptsLabel(perGp)} par GP</b> de plus que lui.</>
  }

  const W = Math.min(boxWidth, MAX_WIDTH)
  const X_END = W - RIGHT_MARGIN
  // Piste : sa longueur suit l'avancement de la saison, pas les points. Le tronçon pointillé jusqu'à
  // l'arrivée représente les GP restants (au moins MIN_REMAINING_PX pour écrire « 150 pts à jouer »),
  // le premier se tient à son début. L'écart se lit à la même échelle que ce tronçon : sa longueur
  // correspond aux points encore à jouer. Un écart plus long que la piste place le poursuivant au départ.
  const trackLength = X_END - X_START
  const totalGp = disputed + remaining
  const remainingPx = Math.max(MIN_REMAINING_PX, trackLength * (remaining / totalGp))
  const pxPerPoint = remainingPx / Math.max(potRelevant, 1)
  const ahead = isLeader ? me : leader
  const behind = isLeader ? rival : me
  let xAhead = X_END - remainingPx
  let xBehind = Math.max(X_START, xAhead - gap * pxPerPoint)
  if (xAhead - xBehind < minAvatarGap) {
    xBehind = Math.max(X_START, xAhead - minAvatarGap)
    if (xAhead - xBehind < minAvatarGap) xAhead = xBehind + minAvatarGap
  }

  // Prénoms : un trait discret descend de chaque avatar vers son prénom. Si les deux prénoms tiennent
  // côte à côte ils sont au même niveau ; s'ils se gêneraient (pseudo long), celui du rival passe un niveau
  // plus bas et son trait s'allonge. « Toi » reste toujours au premier niveau.
  const nameOf = p => (p.id === me.id ? 'Toi' : p.name)
  const other = behind.id === me.id ? ahead : behind
  const xMe = behind.id === me.id ? xBehind : xAhead
  const xOther = other.id === ahead.id ? xAhead : xBehind
  const maxChars = Math.floor((W - 8) / NAME_CHAR_WIDTH)
  const otherName = nameOf(other).length > maxChars ? `${nameOf(other).slice(0, maxChars - 1)}…` : nameOf(other)
  const otherHalf = (otherName.length * NAME_CHAR_WIDTH) / 2
  const otherCenter = Math.max(otherHalf + 2, Math.min(W - otherHalf - 2, xOther))
  const meHalf = ('Toi'.length * NAME_CHAR_WIDTH) / 2
  const overlaps = otherCenter - otherHalf - 6 < xMe + meHalf && otherCenter + otherHalf + 6 > xMe - meHalf
  const otherRow = overlaps ? 2 : 1
  const svgHeight = otherRow === 2 ? ROW_2 + 8 : ROW_1 + 8

  const bonusText = bonusRelevant > 0 ? ` + ${bonusRelevant} bonus × ${STREAK_BONUS} pts` : ''
  const potText = `${remaining} GP × ${MAX_POINTS_PER_GP} pts${bonusText}`
  const context = {
    leaderOpen: <><b className="text-white">{threat.name}</b> peut encore marquer au maximum <b className="text-white">{potRelevant} pts</b> : {potText}. Tu es champion dès que ton avance sur lui dépasse ce total. Aujourd'hui elle est de {leadOverThreat} pts : il t'en manque {leadMissing}.</>,
    leaderDecided: <>Ton avance sur {threat.name} ({leadOverThreat} pts) dépasse ce qu'il peut encore marquer ({potRelevant} pts : {potText}). Tu es champion avant la fin de la saison.</>,
    chaserOpen: <>Tu peux encore marquer au maximum <b className="text-white">{potRelevant} pts</b> : {potText}. Tu as {gap} pts de retard sur {leader.name} : il te faut {ptsLabel(perGp)} de plus que lui à chaque GP pour le rattraper.</>,
    out: <>Tu peux encore marquer au maximum <b className="text-white">{potRelevant} pts</b> : {potText}. C'est moins que ton retard sur {leader.name} ({gap} pts). Le titre reste ouvert pour les joueurs encore à portée.</>,
    chaserDecided: <>L'avance de {leader.name} sur {threat.name} ({leadOverThreat} pts) dépasse ce que {threat.name} peut encore marquer ({race.pot(threat)} pts). {leader.name} est champion avant la fin de la saison, tu ne peux plus le rattraper.</>,
    tie: <>{rival.name} et toi avez le même nombre de points. Tu peux encore marquer au maximum <b className="text-white">{potRelevant} pts</b> : {potText}. Le titre se joue sur les {remaining} GP restants.</>,
  }[scenario]

  return (
    <StatsCard
      title="La course au titre"
      sub={`${disputed} course${disputed > 1 ? 's' : ''} disputée${disputed > 1 ? 's' : ''} · ${remaining} restante${remaining > 1 ? 's' : ''}`}
      right={
        <button onClick={() => setInfo(true)} aria-label="Comment ça marche" className="w-11 h-11 -mr-3 -mt-2 flex items-center justify-center text-muted">
          <Info size={18} />
        </button>
      }
    >
      <p className="text-base font-black leading-snug">{headline}</p>
      <p className="text-sm text-muted leading-snug mt-0.5">{help}</p>

      <div ref={boxRef} className="mt-5">
        <svg viewBox={`0 0 ${W} ${svgHeight}`} width={W} height={svgHeight} className="block mx-auto" role="img" aria-label="Position des deux joueurs sur la piste vers la fin de saison">
          <line x1={X_START} x2={X_END} y1="46" y2="46" stroke={TRACK} strokeWidth="4" strokeLinecap="round" />
          <line x1={xAhead} x2={X_END} y1="46" y2="46" stroke={decided ? GOLD : 'rgba(255,255,255,0.28)'} strokeWidth="4" strokeDasharray={decided ? '0' : '2 6'} strokeLinecap="round" />
          <text x={X_END + 4} y="52" fontSize="20">{decided ? '🏆' : '🏁'}</text>
          {!decided && (
            <text x={(xAhead + X_END) / 2 + 8} y="34" fontSize="11" fill={MUTED} textAnchor="middle">{potRelevant} pts à jouer</text>
          )}
          {!decided && gap > 0 && (
            <>
              <line x1={xBehind} x2={xAhead} y1="18" y2="18" stroke="#fff" strokeWidth="1.5" />
              <line x1={xBehind} x2={xBehind} y1="14" y2="22" stroke="#fff" strokeWidth="1.5" />
              <line x1={xAhead} x2={xAhead} y1="14" y2="22" stroke="#fff" strokeWidth="1.5" />
              <text x={(xBehind + xAhead) / 2} y="10" fontSize="12" fontWeight="800" fill="#fff" textAnchor="middle">{ptsLabel(gap)}</text>
            </>
          )}
          {[[xBehind, behind], [xAhead, ahead]].map(([x, p]) => (
            <g key={p.id}>
              <circle cx={x} cy="46" r="15" fill={SURFACE} stroke={p.color} strokeWidth="2.5" />
              <text x={x} y="52" fontSize="16" textAnchor="middle">{p.avatar}</text>
              {decided && p.id === leader.id && <text x={x} y="26" fontSize="16" textAnchor="middle">👑</text>}
            </g>
          ))}
          {/* traits discrets vers les prénoms */}
          <line x1={xMe} x2={xMe} y1="63" y2={ROW_1 - 12} stroke={CONNECTOR} strokeWidth="1" />
          <line x1={xOther} x2={xOther} y1="63" y2={(otherRow === 2 ? ROW_2 : ROW_1) - 12} stroke={CONNECTOR} strokeWidth="1" />
          <text x={xMe} y={ROW_1} fontSize="11" fontWeight="700" fill={MUTED} textAnchor="middle">Toi</text>
          <text x={otherCenter} y={otherRow === 2 ? ROW_2 : ROW_1} fontSize="11" fontWeight="700" fill={MUTED} textAnchor="middle">{otherName}</text>
        </svg>
      </div>

      {info && (
        <BottomSheet isOpen onClose={() => setInfo(false)} title="La course au titre">
          <div className="px-5 pb-8 pt-3 space-y-3 text-sm leading-snug">
            <p>Un GP rapporte <b>{MAX_POINTS_PER_GP} pts au maximum</b> : 10 pour chaque place exacte, plus 5 pour un podium parfait.</p>
            <p>Tous les 3 GP gagnés d'affilée, un bonus de <b>{STREAK_BONUS} pts</b>.</p>
            <p>Le titre est acquis quand l'avance du premier est plus grande que tout ce que les autres peuvent encore marquer, même si lui ne marque plus rien.</p>
            <p className="rounded-lg bg-surfaceHigh/60 px-3 py-2 text-muted">{context}</p>
          </div>
        </BottomSheet>
      )}
    </StatsCard>
  )
}
