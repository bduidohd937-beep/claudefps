// 모든 튜닝 값은 여기서 조절합니다. (단위: m, s, 도(deg))
const params = new URLSearchParams(window.location.search)
export const AUTO_ENTER = params.get('enter') === '1'
// Emergency regression fallback: ?movement=legacy uses the previous physics controller.
export const LEGACY_MOVEMENT = params.get('movement') === 'legacy'
// 라운드 사이에만 안전한 근접 스폰을 무작위 선택. 1:1 경기 중 즉시 부활은 하지 않음.
export const DYNAMIC_SPAWNS = params.get('spawnMode') !== 'fixed'
const levelParam = Number(params.get('level'))
export const START_LEVEL = Number.isInteger(levelParam) && levelParam >= 1 && levelParam <= 5
  ? levelParam : 3

export const TRAINING = params.get('training') === '1' // ?training=1 → 상점/라운드 없이 더미 사격 연습
export const BOT_MODEL_URL = '/models/enemy.glb'

export const MAPS = {
  arena: null, // 내장 테스트 아레나 (GLB 없이 동작)
  pvp: '/maps/fps_map_pvp_pve_games.glb',
  warface: '/maps/warface_pvp_map_fps.glb',
  brutalist: '/maps/brutalist_concrete_map_free_retro_prop.glb',
  fps: '/maps/fps_map.glb',
  ghost: '/maps/fps_map_ghost_city.glb',
  offense: '/maps/lethal_company_offense_map.glb',
}

// 맵마다 크기/스폰 위치가 다릅니다. GLB 맵은 게임 중 F4(내 위치=플레이어 스폰) / F3(내 위치=봇 스폰)로
// 현재 위치를 저장할 수 있어서, 숫자를 직접 고치지 않아도 됩니다.
export const MAP_SETTINGS = {
  arena: { scale: 1, spawn: [0, 2, 22], botSpawn: [0, 2, -22] },
  pvp: { scale: 1, spawn: [0, 5, 0], botSpawn: [0, 5, -15] },
  brutalist: { scale: 1, spawn: [0, 5, 0], botSpawn: [0, 5, -15] },
  warface: { scale: 1, spawn: [0, 4, 4], botSpawn: [0, 4, -4] },
  fps: { scale: 1, spawn: [0, 8, 15], botSpawn: [10, 8, -15] },
  ghost: { scale: 1, spawn: [0, 8, 4], botSpawn: [0, 8, 15] },
  offense: { scale: 1, spawn: [0, 5, 0], botSpawn: [0, 5, -15] },
}

// Only include maps with known 3D assets in the selector. Offense is kept as a legacy URL but not recommended.
export const MAP_CHOICES = [
  { id: 'arena', label: '테스트 아레나', detail: '기본 맵 · 설치 불필요' },
  { id: 'pvp', label: 'FPS PVP/PVE', detail: '약 22×42m · 1:1 추천' },
  { id: 'warface', label: 'Warface PVP', detail: '약 24×15m · 근거리 전투' },
  { id: 'brutalist', label: 'Brutalist', detail: '약 6×7m · 초소형 테스트' },
  { id: 'fps', label: 'FPS Map', detail: '약 217×214m · 대형 전장' },
  { id: 'ghost', label: 'Ghost City', detail: '약 127×115m · 도시형 전장' },
]

const mapKey = MAPS[params.get('map')] !== undefined ? params.get('map') : 'arena'

const num3 = (s) => {
  const a = s?.split(',').map(Number)
  return a?.length === 3 && a.every(Number.isFinite) ? a : null
}
const ok3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)

const SPAWN_KEY = `claudefps.spawn.${mapKey}`
let stored = {}
try { stored = JSON.parse(localStorage.getItem(SPAWN_KEY) || '{}') } catch {}

export const SPAWNS = {
  player: num3(params.get('spawn')) || (ok3(stored.player) && stored.player) || MAP_SETTINGS[mapKey].spawn,
  bot: num3(params.get('bot')) || (ok3(stored.bot) && stored.bot) || MAP_SETTINGS[mapKey].botSpawn,
}

export const SPAWN_MANUAL = {
  player: !!num3(params.get('spawn')) || ok3(stored.player),
  bot: !!num3(params.get('bot')) || ok3(stored.bot),
}

export function clearSpawnOverrides() {
  stored = {}
  SPAWN_MANUAL.player = false
  SPAWN_MANUAL.bot = false
  SPAWNS.player = [...MAP_SETTINGS[mapKey].spawn]
  SPAWNS.bot = [...MAP_SETTINGS[mapKey].botSpawn]
  try { localStorage.removeItem(SPAWN_KEY) } catch {}
}

export function saveSpawn(kind, pos) {
  if (kind !== 'player' && kind !== 'bot' || !ok3(pos)) return
  SPAWN_MANUAL[kind] = true
  SPAWNS[kind] = pos
  stored[kind] = pos
  try { localStorage.setItem(SPAWN_KEY, JSON.stringify(stored)) } catch {}
}

export const ACTIVE_MAP = {
  key: mapKey,
  url: MAPS[mapKey],
  scale: MAP_SETTINGS[mapKey].scale,
  spawn: SPAWNS.player,
}

// 매치 규칙 / 경제
export const MATCH = {
  startMoney: 1000,
  maxMoney: 10000,
  killReward: 200,
  winReward: 2300,
  lossReward: 1900,
  lossBonusStep: 200,
  maxLossBonus: 600,
  winScore: 5, // 5라운드 선승제
  roundTime: 90, // 시간 초과 시 AI 승리
  buyTime: 15,
  endDelay: 3, // 라운드 종료 후 다음 라운드까지 (초)
}

export const CFG = {
  fov: 80,
  vmFov: 62, // 1인칭 총기 전용 카메라 FOV
  gravity: -20,
  killY: -60,
  spawnProbeTop: 40,
  spawnProbeDepth: 120,
  spawnMinDistance: 8,

  capsuleHalfHeight: 0.45,
  capsuleRadius: 0.35,
  groundRayLen: 0.9,

  // 이동 속도 (m/s): 기본 = 걷기, Shift = 달리기, C = 앉기
  walkSpeed: 3.6,
  runSpeed: 6.4,
  crouchSpeed: 2.2,
  jumpVelocity: 6.2,
  groundAccel: 14,
  groundBrake: 22,
  airAccel: 2.2,

  eyeStand: 0.75,
  eyeCrouch: 0.2,
  eyeDead: -0.55,
  eyeLerp: 14,

  // 이동 탄 퍼짐 (원뿔 반각, 도)
  baseSpread: 0.15,
  moveSpread: 4.2,
  airSpread: 6.5,
  crouchMul: 0.5,
  brakeThreshold: 1.0,
  spreadGrow: 25,
  spreadRecover: 9,

  maxRange: 300,

  // 아머: 피격 데미지의 66%를 아머가 먼저 흡수, 나머지 34%만 HP 차감
  armorRatio: 0.66,
  armorMax: 100,

  // ?training=1 용 더미 위치 (플레이어 스폰 기준 오프셋)
  dummies: [[0, -12], [-10, -22], [14, -27], [-4, -20]],

  sensMin: 0.1,
  sensMax: 3,
}
