export const FOOTSTEP_GAITS = {
  run: { volume: 1.0, interval: 0.27, rate: 1.12 },
  walk: { volume: 0.72, interval: 0.43, rate: 1.0 },
  crouch: { volume: 0.23, interval: 0.66, rate: 0.85 },
}

export function spatialFootstep(source, listener, right, gait = 'walk') {
  const mode = FOOTSTEP_GAITS[gait] || FOOTSTEP_GAITS.walk
  const dx = source[0] - listener[0]
  const dy = source[1] - listener[1]
  const dz = source[2] - listener[2]
  const distance = Math.hypot(dx, dy, dz)
  const attenuation = distance >= 43 ? 0 : Math.pow(Math.max(0, 1 - distance / 43), 1.35)
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
