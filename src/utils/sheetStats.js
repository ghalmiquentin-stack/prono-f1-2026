// Calculs d'affichage de la feuille de GP (aucun accès Firestore, aucune écriture).

// Nom sous lequel un pilote est enregistré dans les pronostics et les résultats
// (même règle que l'ancien choix de pilote).
export function driverKey(driver) {
  return driver.display_name ?? driver.name_acronym ?? String(driver._id)
}

// Code à trois lettres d'un pilote pour un tableau compact (ANT, NOR…).
export function driverCode(drivers, name) {
  if (!name) return ''
  const d = drivers?.find(x => driverKey(x) === name || x.last_name?.toLowerCase() === name.toLowerCase())
  return (d?.name_acronym ?? name.slice(0, 3)).toUpperCase()
}

// { [nom]: { podiums, wins } } sur les courses terminées avec résultat.
export function computePodiumCounts(races) {
  const counts = {}
  for (const race of races ?? []) {
    if (race.status !== 'completed' || !race.result) continue
    ;['P1', 'P2', 'P3'].forEach((pos, i) => {
      const name = race.result[pos]
      if (!name) return
      if (!counts[name]) counts[name] = { podiums: 0, wins: 0 }
      counts[name].podiums += 1
      if (i === 0) counts[name].wins += 1
    })
  }
  return counts
}

// Écuries triées par podiums de la saison (puis ordre alphabétique), pilotes
// triés de la même façon dans chaque écurie. Les pilotes désactivés sont ignorés.
export function groupTeamsByPodiums(drivers, counts) {
  const map = {}
  for (const d of (drivers ?? []).filter(x => x.active !== false)) {
    const team = d.team_name ?? 'Autres'
    if (!map[team]) map[team] = { name: team, colour: d.team_colour ?? '#6B6B8A', drivers: [], podiums: 0 }
    const key = driverKey(d)
    map[team].drivers.push({ ...d, key, podiums: counts[key]?.podiums ?? 0, wins: counts[key]?.wins ?? 0 })
    map[team].podiums += counts[key]?.podiums ?? 0
  }
  const teams = Object.values(map)
  teams.forEach(t => t.drivers.sort((a, b) => b.podiums - a.podiums || a.key.localeCompare(b.key, 'fr')))
  return teams.sort((a, b) => b.podiums - a.podiums || a.name.localeCompare(b.name, 'fr'))
}

// « 1er », « 2e »…
export function ordinal(n) {
  return n === 1 ? '1er' : `${n}e`
}

// Rang par nombre de joueurs strictement meilleurs (les ex æquo partagent le rang).
export function rankOf(list, net) {
  return 1 + list.filter(p => p.net != null && p.net > net).length
}

// Longues listes : on garde les `top` premiers et le joueur courant ; un tronçon
// masqué d'au moins 2 joueurs devient { type: 'gap', count }. (Même règle que
// la carte « Dernière course » de l'Accueil.)
export function limitListWithMe(list, meId, top = 5) {
  const meIndex = list.findIndex(p => p.id === meId)
  const keep = new Set()
  for (let i = 0; i < Math.min(top, list.length); i++) keep.add(i)
  if (meIndex >= 0) keep.add(meIndex)
  const items = []
  let i = 0
  while (i < list.length) {
    if (keep.has(i)) { items.push({ type: 'player', player: list[i] }); i += 1; continue }
    let j = i
    while (j < list.length && !keep.has(j)) j += 1
    if (j - i <= 1) { for (let k = i; k < j; k++) items.push({ type: 'player', player: list[k] }) }
    else items.push({ type: 'gap', count: j - i })
    i = j
  }
  return items
}

// « Dimanche 8 novembre »
export function formatLongDate(dateStr) {
  const text = new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Nom de circuit raccourci et dédoublonné avec la ville :
// « Circuit de Barcelone » + « Barcelone » -> « Barcelone » ;
// « Interlagos » + « São Paulo » -> « Interlagos · São Paulo ».
export function circuitLabel(race) {
  const city = race?.city ?? ''
  let short = (race?.circuit ?? '')
    .replace(/^Circuit (de |of the )?/i, '')
    .replace(/ International( Circuit)?$/i, '')
    .replace(/ Circuit$/i, '')
    .trim()
  if (!short) return city
  if (!city) return short
  const a = short.toLowerCase(); const b = city.toLowerCase()
  if (a.includes(b)) return short
  if (b.includes(a)) return city
  return `${short} · ${city}`
}

// Kilomètres à la française : 4.309 -> « 4,309 km ».
export function formatKm(km) {
  return `${String(km).replace('.', ',')} km`
}

// Délai avant le départ, en cases : [{ n, unit }]. Plus de 24 h : jours, heures,
// minutes ; moins de 24 h : heures, minutes ; moins d'une heure : minutes.
export function countdownParts(ms) {
  if (!(ms > 0)) return []
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  const parts = []
  if (d > 0) parts.push({ n: d, unit: 'j' })
  if (d > 0 || h > 0) parts.push({ n: h, unit: 'h' })
  parts.push({ n: m, unit: 'min' })
  return parts
}
