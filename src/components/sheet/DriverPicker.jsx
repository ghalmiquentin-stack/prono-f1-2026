import { useMemo } from 'react'
import { Check, History } from 'lucide-react'
import BottomSheet from '../BottomSheet'
import Portrait from './Portrait'
import { shortTeam } from './driverUtils'
import { STEP } from './PodiumSlots'
import { TEAMS as STATIC_TEAMS } from '../../data/drivers'
import { computePodiumCounts, groupTeamsByPodiums, driverCode } from '../../utils/sheetStats'

const POS_TITLE = { P1: 'le vainqueur', P2: 'le 2e', P3: 'le 3e' }
const POS_SHORT = { P1: '1er', P2: '2e', P3: '3e' }
const POS_TAKEN = { P1: 'Déjà vainqueur', P2: 'Déjà 2e', P3: 'Déjà 3e' }

// Liste de secours quand la collection Firestore `drivers` n'est pas chargée.
function staticDrivers() {
  return STATIC_TEAMS.flatMap(t => t.drivers.map(n => ({
    _id: n, display_name: n, last_name: n, team_name: t.name, team_colour: t.color,
  })))
}

function metric(pos, c) {
  if (pos === 'P1') {
    const w = c?.wins ?? 0
    return w > 0 ? `${w} victoire${w > 1 ? 's' : ''}` : 'Aucune victoire'
  }
  const p = c?.podiums ?? 0
  return p > 0 ? `${p} podium${p > 1 ? 's' : ''}` : 'Aucun podium'
}

// Choix d'un pilote pour une place du podium. Le pilote est le cœur de l'écran ;
// l'encart « Dans le rétro » (dernier podium du joueur, podium de l'an dernier)
// n'est qu'un repère. Toucher un pilote ne ferme pas la feuille : on enchaîne les
// trois places, puis « Valider le podium ». Toucher le pilote déjà choisi le retire.
export default function DriverPicker({
  isOpen, onClose, onValidate, onSelectPosition, position, draft, drivers, races, onChoose,
  lastPodium, previousPodium, previousYear, raceFlag,
}) {
  const list = drivers?.length ? drivers : staticDrivers()
  const counts = useMemo(() => computePodiumCounts(races), [races])
  const teams = useMemo(() => groupTeamsByPodiums(list, counts), [list, counts])
  if (!position) return null

  const step = STEP[position]
  const current = draft[position]
  const usedElsewhere = name => ['P1', 'P2', 'P3'].find(p => p !== position && draft[p] === name)

  const aidRows = [
    ['Ton dernier podium', lastPodium, null],
    [`Podium${previousYear ? ' ' + previousYear : ''}`, previousPodium, raceFlag],
  ].filter(r => r[1]?.length)

  const header = (
    <div className="px-5 pt-1 pb-3 border-b border-border">
      <div className="flex items-center gap-2.5 min-h-[30px] pr-10">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-black text-bg" style={{ background: step.fill }}>{step.label}</span>
        <h2 className="text-xl font-black leading-tight">Choisir {POS_TITLE[position]}</h2>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {['P1', 'P2', 'P3'].map(p => {
          const d = draft[p]; const s = STEP[p]; const active = p === position
          return (
            <button key={p} onClick={() => onSelectPosition?.(p)} aria-pressed={active} aria-label={`Passer à la place ${POS_SHORT[p]}`} className={`rounded-xl border px-1.5 py-1.5 flex items-center gap-1.5 min-w-0 text-left ${active ? 'bg-surfaceHigh' : 'bg-bg/50 border-border/70'}`} style={active ? { borderColor: s.color } : undefined}>
              {d
                ? <Portrait drivers={list} name={d} className="w-6 h-6" />
                : <div className="w-6 h-6 rounded-full border-2 border-dashed shrink-0" style={{ borderColor: s.color }} />}
              <span className="min-w-0 leading-tight">
                <span className="block text-[11px] font-bold" style={{ color: s.color }}>{POS_SHORT[p]}</span>
                <span className={`block text-[11px] font-black truncate ${d ? '' : 'text-muted font-normal'}`}>{d ?? (active ? 'à choisir' : '—')}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  // Pied fixe : « Valider le podium » ramène à la feuille (l'enregistrement,
  // lui, reste le bouton de la feuille). Les choix déjà faits sont gardés.
  const filled = ['P1', 'P2', 'P3'].filter(p => draft[p]).length
  const footer = (
    <div className="px-5 pt-2 pb-2">
      <button
        onClick={onValidate}
        disabled={filled === 0}
        className={`w-full py-3 rounded-xl font-black text-lg tracking-wide transition-all active:scale-95 ${
          filled === 3 ? 'bg-accent text-white shadow-glow-red'
            : filled > 0 ? 'bg-surfaceHigh text-white'
            : 'bg-surfaceHigh text-muted cursor-not-allowed'
        }`}
      >
        {filled === 3 ? 'Valider le podium' : filled > 0 ? `Valider (${filled} sur 3)` : 'Choisis un pilote'}
      </button>
    </div>
  )

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} bare fixedHeight header={header} footer={footer}>
      <div className="pb-4">
        {aidRows.length > 0 && (
          <div className="px-5 pt-3">
            <div className="rounded-2xl border border-dashed border-border bg-bg/40 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase text-muted"><History size={12} />Dans le rétro</p>
              {aidRows.map(([label, names, flag]) => (
                <div key={label} className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-muted w-[104px] shrink-0 leading-tight whitespace-nowrap flex items-center gap-1">
                    {label}{flag && <span className="text-[15px] leading-none">{flag}</span>}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {names.map(name => {
                      const used = usedElsewhere(name); const sel = current === name
                      return (
                        <button
                          key={name}
                          onClick={() => onChoose(name)}
                          disabled={!!used}
                          aria-pressed={sel}
                          aria-label={sel ? `${name}, retirer` : name}
                          className={`flex-1 min-w-0 flex items-center justify-center gap-1 rounded-full border pl-0.5 pr-1.5 py-0.5 ${sel ? 'bg-surfaceHigh' : 'bg-surfaceHigh/40 border-border/70'} ${used ? 'opacity-35' : ''}`}
                          style={sel ? { borderColor: step.color } : undefined}
                        >
                          <Portrait drivers={list} name={name} className="w-[18px] h-[18px]" />
                          <span className="text-[11px] font-bold">{driverCode(list, name)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pt-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-base font-black">Tous les pilotes</p>
            <p className="text-[11px] text-muted">Écuries classées par podiums</p>
          </div>
          {teams.map(t => (
            <div key={t.name} className="mb-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: t.colour }} />
                <span className="text-[11px] font-bold tracking-widest uppercase text-muted">{shortTeam(t.name)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {t.drivers.map(d => {
                  const name = d.key
                  const used = usedElsewhere(name); const sel = current === name
                  return (
                    <button
                      key={name}
                      onClick={() => onChoose(name)}
                      disabled={!!used}
                      aria-pressed={sel}
                      aria-label={sel ? `${name}, retirer` : name}
                      className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left min-h-[52px] ${sel ? 'bg-surfaceHigh' : 'bg-surfaceHigh/40 border-border/70'} ${used ? 'opacity-35' : ''}`}
                      style={sel ? { borderColor: step.color, boxShadow: `0 0 14px ${step.color}33` } : undefined}
                    >
                      <span className="relative shrink-0">
                        <Portrait drivers={list} name={name} className="w-10 h-10" ring={sel ? t.colour : undefined} />
                        {sel && (
                          <span className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center text-bg" style={{ background: step.color }}>
                            <Check size={11} strokeWidth={3.5} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-sm font-black truncate">{d.last_name ?? name}</span>
                        <span className="block text-[11px] text-muted truncate">{used ? POS_TAKEN[used] : metric(position, d)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
