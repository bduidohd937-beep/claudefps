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
  m4a1: {
    id: 'm4a1', slot: 'primary', name: 'M4A1', price: 2900,
    damage: 30, fireInterval: 0.092, auto: true,
    mag: 30, reserve: 90,
    reloadTime: 2.45, reloadTimeEmpty: 3.0, drawTime: 0.8,
    falloff: { start: 28, end: 90, min: 0.55 },
    recoil: { pitch: 0.006, yaw: 0.002 },
    spreadMul: 0.8, fireSpread: 0.23, fireSpreadMax: 2.1, sound: 'm4_shot',
  },
  mp5: {
    id: 'mp5', slot: 'primary', name: 'MP5', price: 1750,
    damage: 23, fireInterval: 0.072, auto: true,
    mag: 30, reserve: 120,
    reloadTime: 2.0, reloadTimeEmpty: 2.6, drawTime: 0.55,
    falloff: { start: 13, end: 50, min: 0.4 },
    recoil: { pitch: 0.004, yaw: 0.0025 },
    spreadMul: 0.9, fireSpread: 0.36, fireSpreadMax: 3.0, sound: 'smg_shot',
  },
  shotgun: {
    id: 'shotgun', slot: 'primary', name: '펌프 샷건', price: 1600,
    damage: 11, pellets: 8, pelletSpread: 4.5, fireInterval: 0.9, auto: false,
    mag: 6, reserve: 24,
    reloadTime: 2.5, reloadTimeEmpty: 3.0, drawTime: 0.75,
    falloff: { start: 5, end: 23, min: 0.25 },
    recoil: { pitch: 0.032, yaw: 0.006 },
    spreadMul: 1, fireSpread: 1.2, fireSpreadMax: 4.0, sound: 'shotgun_shot',
  },
  awp: {
    id: 'awp', slot: 'primary', name: 'AWP', price: 4300,
    damage: 108, fireInterval: 1.55, auto: false,
    mag: 5, reserve: 20,
    reloadTime: 3.0, reloadTimeEmpty: 3.7, drawTime: 1.1,
    falloff: { start: 80, end: 280, min: 0.8 },
    recoil: { pitch: 0.048, yaw: 0.005 },
    spreadMul: 0.3, fireSpread: 2.5, fireSpreadMax: 4.0, sound: 'sniper_shot',
  },
  deagle: {
    id: 'deagle', slot: 'secondary', name: 'Desert Eagle', price: 900,
    damage: 52, fireInterval: 0.34, auto: false,
    mag: 7, reserve: 35,
    reloadTime: 2.0, reloadTimeEmpty: 2.5, drawTime: 0.55,
    falloff: { start: 25, end: 75, min: 0.6 },
    recoil: { pitch: 0.026, yaw: 0.005 },
    spreadMul: 0.8, fireSpread: 0.9, fireSpreadMax: 2.8, sound: 'deagle_shot',
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
