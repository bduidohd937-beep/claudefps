// 무기 데이터
export const WEAPONS = {
  rifle: {
    id: 'rifle', slot: 'primary', name: 'AKS-74u', price: 2500,
    damage: 34, fireInterval: 0.09, auto: true,
    mag: 30, reserve: 90,
    reloadTime: 2.6, reloadTimeEmpty: 3.2, drawTime: 1.0,
    falloff: { start: 22, end: 80, min: 0.5 }, // start(m)까지 100%, end(m)에서 min배
    recoil: { pitch: 0.0085, yaw: 0.003 },
    spreadMul: 1, fireSpread: 0.3, fireSpreadMax: 2.5,
  },
  pistol: {
    id: 'pistol', slot: 'secondary', name: 'Glock', price: 0, // 기본 지급
    damage: 26, fireInterval: 0.15, auto: false,
    mag: 17, reserve: 51,
    reloadTime: 1.7, reloadTimeEmpty: 2.2, drawTime: 0.5,
    falloff: { start: 12, end: 50, min: 0.45 },
    recoil: { pitch: 0.011, yaw: 0.002 },
    spreadMul: 0.85, fireSpread: 0.8, fireSpreadMax: 2.5,
  },
  knife: {
    id: 'knife', slot: 'melee', name: '나이프', price: 0, melee: true,
    damage: 40, range: 2.3, fireInterval: 0.55, auto: false,
    mag: 0, reserve: 0, reloadTime: 0, reloadTimeEmpty: 0, drawTime: 0.5,
    falloff: { start: 999, end: 1000, min: 1 },
    recoil: { pitch: 0, yaw: 0 },
    spreadMul: 1, fireSpread: 0, fireSpreadMax: 0,
  },
}
export const WEAPON_IDS = Object.keys(WEAPONS)

export const PART_MUL = { head: 3, body: 1, legs: 0.75 }

// 거리 감쇄: start까지 1.0, start~end 구간에서 선형으로 min까지 감소, 이후 min 유지
export function distanceFalloff(w, dist) {
  const { start, end, min } = w.falloff
  if (dist <= start) return 1
  if (dist >= end) return min
  return 1 - ((dist - start) / (end - start)) * (1 - min)
}

export const calcDamage = (w, part, dist) => w.damage * PART_MUL[part] * distanceFalloff(w, dist)
