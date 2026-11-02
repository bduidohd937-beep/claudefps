export const FOOTSTEP_GAITS = {
  run: { volume: 0.82, interval: 0.27, rate: 1.14 },
  walk: { volume: 0.44, interval: 0.45, rate: 1 },
  crouch: { volume: 0.13, interval: 0.66, rate: 0.85 },
}

export function spatialFootstep(source, listener, right, gait = 'walk') {
  const mode = FOOTSTEP_GAITS[gait] || FOOTSTEP_GAITS.walk
  const dx = source[0] - listener[0]
  const dy = source[1] - listener[1]
  const dz = source[2] - listener[2]
  const distance = Math.hypot(dx, dy, dz)
  const attenuation = distance >= 38 ? 0 : Math.pow(Math.max(0, 1 - distance / 38), 1.7)
  const horizontal = Math.hypot(dx, dz)
  const dot = horizontal > 0.01 ? (dx * right[0] + dz * right[2]) / horizontal : 0
  return {
    volume: mode.volume * attenuation,
    pan: Math.max(-0.85, Math.min(0.85, dot)),
    interval: mode.interval,
    rate: mode.rate,
    distance,
  }
}
