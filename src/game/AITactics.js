// Pure tactical decisions used by the 3D bot; Node can test these without WebGL.
export function canBotFire({ visible, spotted, seenAt, time, reaction }) {
  return !!visible && !!spotted && Number.isFinite(seenAt) && time - seenAt >= reaction
}

export function investigationTarget({ visible, lastKnown, investigateUntil, patrolGoal, time }) {
  if (visible) return null
  if (lastKnown && time < investigateUntil) return lastKnown
  return patrolGoal ?? null
}

export function validStepHeight(delta, min = 0.18, max = 0.9) {
  return Number.isFinite(delta) && delta > min && delta < max
}
