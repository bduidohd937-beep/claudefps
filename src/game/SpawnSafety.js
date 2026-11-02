// Pure restrictions for safe, non-exposed duel spawn candidates.
export function exposedAtCloseRange(distance, hasWall, limit = 26) {
  return Number.isFinite(distance) && distance < limit && !hasWall
}
export function exposedWithoutCover(opponentDistance, mapSpan, hasNearbyCover) {
  return mapSpan > 25 && opponentDistance < 40 && !hasNearbyCover
}
export function spawnScore(recentDistance, opponentDistance, radius, jitter = 0, coverBonus = 0) {
  return Math.min(recentDistance, radius) * 0.6 +
    Math.min(opponentDistance, 35) * 0.4 + jitter + coverBonus
}
