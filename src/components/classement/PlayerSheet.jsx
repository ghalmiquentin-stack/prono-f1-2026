import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, Star } from 'lucide-react'
import BottomSheet from '../BottomSheet'
import { ordinal } from '../../utils/sheetStats'
import { ptsLabel } from '../../utils/standings'

// Feuille de détail d'un joueur : d'où viennent ses points (pronostics,
// podiums parfaits, bonus série, pénalités), quelques stats, puis ses GP du
// plus récent au plus ancien. Un GP touché ouvre sa feuille (onOpenRace),
// sans recopier ce que la feuille d'un GP terminé montre déjà.

const GP_PREVIEW = 5

function BreakdownLine({ label, count, value, muted, alert }) {
  return (
    <div className="flex items-center gap-2 min-h-[34px]">
      <span className={`flex-1 text-sm flex items-center gap-1.5 ${muted ? 'text-muted' : 'text-white/85'}`}>
        {alert && <AlertTriangle size={14} className="text-accent shrink-0" />}
        {label}
        {count > 0 && <span className="text-[11px] text-muted">× {count}</span>}
      </span>
      <span className={`text-sm font-black tabular-nums ${muted ? 'text-muted' : ''}`}>{value}</span>
    </div>
  )
}

export default function PlayerSheet({ player, count, completedRaces, meTotal = null, onClose, onOpenRace }) {
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { setShowAll(false) }, [player?.id])
  if (!player) return null

  const scores = player.raceScores ?? []
  const played = scores.filter(rs => rs.net !== null)
  const rawTotal = played.reduce((sum, rs) => sum + rs.raw, 0)
  const perfects = played.filter(rs => rs.perfectPodium).length
  const bonusTotal = played.reduce((sum, rs) => sum + rs.bonus, 0)
  const penaltyTotal = played.reduce((sum, rs) => sum + rs.penalty, 0)
  const penaltyCount = played.filter(rs => rs.penalty > 0).length
  const bestScore = played.reduce((best, rs) => Math.max(best, rs.net), played.length ? -Infinity : 0)
  const average = played.length
    ? (played.reduce((sum, rs) => sum + rs.net, 0) / played.length).toFixed(1).replace('.', ',')
    : '0'

  // Du plus récent au plus ancien, avec l'état du joueur sur chaque GP terminé.
  const rows = [...completedRaces].reverse().map(race => ({
    race,
    score: scores.find(rs => rs.raceId === race.id) ?? null,
  }))
  const shown = showAll ? rows : rows.slice(0, GP_PREVIEW)

  return (
    <BottomSheet isOpen onClose={onClose} bare fullHeight>
      <div className="px-5 pt-3 pb-24">
        <div className="flex items-center gap-3 pr-10">
          <span className="text-4xl leading-none">{player.avatar}</span>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-xl font-black truncate" style={{ color: player.color }}>{player.displayName}</p>
            <p className="text-xs text-muted">
              {player.isMe ? 'vous · ' : ''}{ordinal(player.rank)}{player.tied ? ' ex æquo' : ''} sur {count}
            </p>
          </div>
          <p className="text-3xl font-black leading-none" style={{ color: player.color }}>
            {player.total}<span className="text-sm text-muted font-bold ml-1">pts</span>
          </p>
        </div>

        {/* Écart avec moi, en toutes lettres (la liste ne montre que « −90 » ou « +12 ») */}
        {meTotal != null && !player.isMe && (
          <p className="mt-3 text-sm text-white/85">
            {player.total === meTotal
              ? 'Ex æquo avec vous'
              : <><b className="font-black">{ptsLabel(player.total - meTotal)}</b> {player.total > meTotal ? 'devant' : 'derrière'} vous</>}
          </p>
        )}

        <p className="text-[11px] uppercase text-muted font-bold mt-6 mb-1">D'où viennent les points</p>
        <div className="rounded-xl bg-bg/50 border border-border/70 px-3 py-1">
          <BreakdownLine label="Pronostics" value={`+${rawTotal}`} />
          <BreakdownLine label="Podiums parfaits" count={perfects} value={bonusTotal ? `+${bonusTotal}` : '0'} muted={!bonusTotal} />
          <BreakdownLine label="Bonus série" value={player.streakBonus ? `+${player.streakBonus}` : '0'} muted={!player.streakBonus} />
          <BreakdownLine label="Pénalités" count={penaltyCount} value={penaltyTotal ? `−${penaltyTotal}` : '0'} muted={!penaltyTotal} alert={penaltyTotal > 0} />
          <div className="flex items-center gap-2 min-h-[40px] border-t border-border mt-1">
            <span className="flex-1 text-sm font-black">Total</span>
            <span className="text-base font-black tabular-nums" style={{ color: player.color }}>{player.total}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          {[['GP joués', played.length], ['Moyenne', average], ['Meilleur GP', bestScore]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-bg/50 border border-border/70 py-2">
              <p className="text-base font-black leading-tight">{value}</p>
              <p className="text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-[11px] uppercase text-muted font-bold mt-6 mb-1">Ses GP, du plus récent au plus ancien</p>
            <div>
              {shown.map(({ race, score }) => (
                <button
                  key={race.id}
                  type="button"
                  onClick={() => onOpenRace(race)}
                  className="w-full min-h-[44px] flex items-center gap-2 border-t border-border/60 first:border-t-0 text-left active:opacity-70"
                >
                  <span className="text-lg leading-none">{race.flag}</span>
                  <span className="flex-1 min-w-0 text-sm truncate text-white/85">{race.name}</span>
                  {score?.perfectPodium && <Star size={14} className="text-gold fill-gold shrink-0" aria-label="Podium parfait" />}
                  {score?.penalty > 0 && <AlertTriangle size={14} className="text-accent shrink-0" aria-label="Pénalité" />}
                  {score && score.net !== null
                    ? <span className="min-w-9 text-right text-sm font-black tabular-nums">{score.net}</span>
                    : <span className="text-xs text-muted shrink-0">Pas de prono</span>}
                  <ChevronRight size={14} className="text-muted shrink-0" />
                </button>
              ))}
              {!showAll && rows.length > GP_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surfaceHigh text-[13px] font-bold active:scale-95 transition-transform"
                >
                  Voir les {rows.length - GP_PREVIEW} autres GP <ChevronDown size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
