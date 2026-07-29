import { PROFILE_COLORS, PROFILE_AVATARS } from '../data/profileOptions'

// Same neutral identity used when a deleted account's profile doc is
// anonymized (see MonProfil.jsx) — kept in sync so both paths render the
// same "gone" look.
const NEUTRAL_AVATAR = '❔'
const NEUTRAL_COLOR = '#6B6B8A'

/**
 * Identity (displayName/avatar/color) now lives in the "profiles" collection,
 * keyed by authUid — players documents only hold league/game data.
 *
 * When a player has no authUid (account unlinked or deleted), falls back to
 * displayNameOverride set directly on the players doc, with a neutral
 * avatar/color, instead of leaking a raw technical value (doc id, etc.) to
 * callers.
 */
export function getProfile(profiles, player) {
  const authUid = player?.authUid ?? null
  if (authUid) return profiles.find(p => p._id === authUid) ?? null

  if (player?.displayNameOverride) {
    return {
      displayName: player.displayNameOverride,
      avatar: NEUTRAL_AVATAR,
      color: NEUTRAL_COLOR,
    }
  }

  return null
}

/**
 * Same as getProfile, but always returns a usable identity: any player who
 * hasn't set up their own color/avatar yet (or has no profile doc at all)
 * gets one deterministically assigned from the shared picker palette by
 * their position in the roster — not a fixed table of hardcoded player IDs
 * (that only ever matched the original single-league roster).
 */
export function getPlayerIdentity(profiles, player, index = 0) {
  const identity = getProfile(profiles, player)
  if (identity) return identity
  return {
    displayName: player?.id ?? '',
    color: PROFILE_COLORS[index % PROFILE_COLORS.length],
    avatar: PROFILE_AVATARS[index % PROFILE_AVATARS.length],
  }
}
