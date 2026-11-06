import { ordinal } from './sheetStats'

// « 2e sur 4 » ; en grande ligue (20 joueurs ou plus) on parle en pourcentage : « Top 12 % ».
export function rankLabel(rank, count) {
  if (count >= 20) return `Top ${Math.max(1, Math.round((rank / count) * 100))} %`
  return `${ordinal(rank)} sur ${count}`
}

// Un chiffre après la virgule, à la française : 4,8 (et 15 plutôt que 15,0).
export function oneDecimal(value) {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}
