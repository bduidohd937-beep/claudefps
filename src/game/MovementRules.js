// Pure traversal constraints, shared with the Rapier player controller.
export const MAX_AUTO_STEP = 0.38
export const MIN_AUTO_STEP = 0.055
export const MAX_MANUAL_MANTLE = 0.88

export function shouldStep({rise, forwardBlocked, upperClear, stableLanding, headClear, deliberateJump = false}) {
  const max = deliberateJump ? MAX_MANUAL_MANTLE : MAX_AUTO_STEP
  const min = deliberateJump ? 0.23 : MIN_AUTO_STEP
  return Number.isFinite(rise) && rise >= min && rise <= max &&
    !!forwardBlocked && !!upperClear && !!stableLanding && !!headClear
}

// Jump is an edge-triggered action; holding Space across landings does not auto-repeat.
export function isNewJump(held, previouslyHeld, active = true) {
  return !!active && !!held && !previouslyHeld
}
