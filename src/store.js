import { create } from 'zustand'
import { CFG, MATCH, TRAINING } from './config.js'
import { WEAPONS } from './weapons.js'
import { emit, cam } from './fx.js'
import { enemies } from './enemies.js'
import { play } from './audio.js'
import { initialAmmo, initialOwned, initialBotEconomy, refillAllAmmo, loseEquipment, roundPayout, cappedMoney, absorbArmor, autoBuyBot } from './economy.js'

const readSens = () => {
  try {
    const v = Number(localStorage.getItem('claudefps.sens'))
    return v >= CFG.sensMin && v <= CFG.sensMax ? v : 1
  } catch {
    return 1
  }
}

const savedCrosshair = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
const savedCrosshairMode = ['dot', 'cross', 'dynamic'].includes(savedCrosshair('claudefps.crosshair.mode', 'dynamic'))
  ? savedCrosshair('claudefps.crosshair.mode', 'dynamic') : 'dynamic'
const savedCrosshairColor = /^#[0-9a-f]{6}$/i.test(savedCrosshair('claudefps.crosshair.color', '#ffffff'))
  ? savedCrosshair('claudefps.crosshair.color', '#ffffff') : '#ffffff'

const now = () => performance.now() / 1000

// React 리렌더가 필요한 UI 상태만 여기에 둡니다.
export const useGame = create((set, get) => ({
  // ----- 입력/설정 -----
  locked: false,
  spawnEditorOpen: false,
  tunerOpen: false,
  setTunerOpen: (open) => {
    live.tuner = open
    set(open ? { tunerOpen: true, spawnEditorOpen: false } : { tunerOpen: false })
    if (open) refs.unlock?.()
  },
  setSpawnEditorOpen: (open) => {
    set(open ? { spawnEditorOpen: true, tunerOpen: false } : { spawnEditorOpen: false })
    if (open) live.tuner = false
    if (open) refs.unlock?.()
  },
  crosshairMode: savedCrosshairMode,
  crosshairColor: savedCrosshairColor,
  setCrosshairMode: (mode) => {
    if (!['dot', 'cross', 'dynamic'].includes(mode)) return
    try { localStorage.setItem('claudefps.crosshair.mode', mode) } catch {}
    set({ crosshairMode: mode })
  },
  setCrosshairColor: (color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    try { localStorage.setItem('claudefps.crosshair.color', color) } catch {}
    set({ crosshairColor: color })
  },
  sensitivity: readSens(),
  lock: () => {}, // Controls 컴포넌트가 실제 함수로 교체
  setLocked: (locked) => set({ locked }),
  setSensitivity: (sensitivity) => {
    try { localStorage.setItem('claudefps.sens', String(sensitivity)) } catch {}
    set({ sensitivity })
  },

  // ----- 플레이어 -----
  hp: 100,
  armor: 0,
  money: MATCH.startMoney,
  lossStreak: 0,
  botEconomy: initialBotEconomy(),
  spawnProtectionUntil: 0,
  setBotArmor: (armor) => set((s) => ({ botEconomy: { ...s.botEconomy, armor } })),
  botShot: () => {
    const bot = get().botEconomy
    const slot = bot.ammo[bot.weapon]
    if (!slot || slot.mag <= 0) return false
    set((s) => ({ botEconomy: {
      ...s.botEconomy,
      ammo: { ...s.botEconomy.ammo,
        [bot.weapon]: { ...s.botEconomy.ammo[bot.weapon], mag: s.botEconomy.ammo[bot.weapon].mag - 1 } },
    } }))
    return true
  },
  botReload: () => {
    const bot = get().botEconomy
    const w = WEAPONS[bot.weapon]
    const a = bot.ammo[bot.weapon]
    if (!w || w.melee || a.reserve <= 0 || a.mag >= w.mag) return false
    const take = Math.min(w.mag - a.mag, a.reserve)
    set((s) => ({ botEconomy: {
      ...s.botEconomy, ammo: { ...s.botEconomy.ammo,
        [bot.weapon]: { mag: a.mag + take, reserve: a.reserve - take } },
    } }))
    return true
  },
  weapon: 'pistol',
  owned: initialOwned(),
  ammo: initialAmmo(),
  setAmmo: (id, mag, reserve) => set((s) => ({ ammo: { ...s.ammo, [id]: { mag, reserve } } })),

  equip: (id) => {
    if (!get().owned[id]) return
    live.weapon = id // 실제 교체 연출/딜레이는 WeaponSystem이 감지해서 처리
    set({ weapon: id })
  },
  equipSlot: (slot) => {
    const state = get()
    // Only one paid weapon per slot. Glock and knife return when the player dies.
    const id = Object.keys(WEAPONS).find((key) => state.owned[key] && WEAPONS[key].slot === slot)
    if (id) state.equip(id)
  },

  // 플레이어 피격: 아머가 데미지의 66%를 먼저 흡수, 나머지만 HP 차감
  damagePlayer: (amount, meta) => {
    if (get().phase === 'live' && now() < get().spawnProtectionUntil) return
    const { hp, armor } = get()
    if (hp <= 0) return
    const result = absorbArmor(hp, armor, amount)
    const nhp = result.hp
    set({ hp: nhp, armor: result.armor })
    cam.shake = Math.min(1.4, cam.shake + 0.45 + amount / 40)
    cam.flinchP += 0.025 + amount * 0.0012 // 카메라 킥백
    cam.flinchY += (Math.random() - 0.5) * 0.05
    emit('playerHit', { amount, hp: nhp })
    play('hurt')
    if (nhp === 0) {
      emit('kill', {
        killer: meta?.killer ?? `AI Lv.${get().difficulty}`,
        victim: '플레이어',
        weapon: meta?.weapon ?? 'AKS-74u',
        headshot: !!meta?.headshot,
        byPlayer: false,
      })
    }
  },

  // ----- 매치 -----
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  shopOpen: false,
  difficulty: 3,
  round: 1,
  score: { player: 0, ai: 0 },
  roundBanner: null, // { winner, reward }
  matchOver: null, // 'win' | 'lose'
  setDifficulty: (difficulty) => set({ difficulty }),

  startMatch: (difficulty) => {
    const d = difficulty ?? get().difficulty
    live.weapon = 'pistol'
    live.reloading = false
    set({
      difficulty: d, round: 1, score: { player: 0, ai: 0 },
      money: MATCH.startMoney, lossStreak: 0, botEconomy: initialBotEconomy(),
      spawnProtectionUntil: 0, hp: 100, armor: 0,
      owned: initialOwned(), ammo: initialAmmo(), weapon: 'pistol',
      matchOver: null, roundBanner: null,
    })
    get().beginRound()
  },

  // 라운드 시작: 위치 초기화 → 구매 단계(상점 자동 오픈, 포인터락 해제)
  beginRound: () => {
    set((s) => ({
      ammo: refillAllAmmo(s.ammo),
      botEconomy: autoBuyBot({ ...s.botEconomy, ammo: refillAllAmmo(s.botEconomy.ammo) }, s.round),
    }))
    refs.resetRound?.()
    live.reloading = false
    if (TRAINING) { set({ phase: 'live', shopOpen: false, hp: 100 }); return }
    live.buyEnd = now() + MATCH.buyTime
    live.roundTimeLeft = MATCH.roundTime
    set({ phase: 'buy', shopOpen: true, hp: 100, roundBanner: null })
    refs.unlock?.()
  },

  // 구매 종료 → 교전 시작
  endBuy: () => {
    if (get().phase !== 'buy') return
    live.roundTimeLeft = MATCH.roundTime
    set({ phase: 'live', shopOpen: false, spawnProtectionUntil: now() + 2.5 })
  },

  toggleShop: () => {
    const st = get()
    if (st.phase !== 'buy' && st.phase !== 'live') return
    if (st.shopOpen) {
      set({ shopOpen: false })
      st.lock()
    } else {
      set({ shopOpen: true })
      refs.unlock?.()
    }
  },

  endRound: (winner) => {
    if (get().phase !== 'live') return
    const score = { ...get().score }
    winner === 'player' ? score.player++ : score.ai++
    const pPayout = roundPayout(winner === 'player', get().lossStreak)
    const aiPayout = roundPayout(winner === 'ai', get().botEconomy.lossStreak)
    live.firing = false
    set((s) => ({
      phase: 'roundEnd', score,
      money: cappedMoney(s.money + pPayout.reward),
      lossStreak: pPayout.lossStreak,
      botEconomy: {
        ...s.botEconomy,
        money: cappedMoney(s.botEconomy.money + aiPayout.reward),
        lossStreak: aiPayout.lossStreak,
      },
      roundBanner: { winner, reward: pPayout.reward, bonus: pPayout.lossBonus },
    }))
    play(winner === 'player' ? 'round_win' : 'round_lose')

    setTimeout(() => {
      if (get().phase !== 'roundEnd') return
      if (score.player >= MATCH.winScore || score.ai >= MATCH.winScore) {
        set({ phase: 'matchEnd', matchOver: score.player >= MATCH.winScore ? 'win' : 'lose', shopOpen: false })
        refs.unlock?.()
        return
      }
      // Survivors retain paid gear; only the fighter actually killed loses it.
      const playerDied = get().hp <= 0
      const botDied = !!(enemies.get('bot')?.dead)
      if (playerDied) {
        set((s) => ({
          ...loseEquipment(s),
          money: s.money,
          lossStreak: s.lossStreak,
          botEconomy: s.botEconomy,
        }))
        get().equip('pistol')
      }
      if (botDied) {
        set((s) => ({ botEconomy: loseEquipment(s.botEconomy) }))
      }
      set((s) => ({ round: s.round + 1 }))
      get().beginRound()
    }, MATCH.endDelay * 1000)
  },

  // 상점 구매. 결과: { ok, msg }
  buy: (id) => {
    const st = get()
    if (st.phase !== 'buy') return { ok: false, msg: '구매 시간이 지났습니다' }
    const price = { armor_half: 650, armor_full: 1000 }[id] ?? WEAPONS[id]?.price
    if (price === undefined) return { ok: false, msg: '지원하지 않는 품목입니다' }
    if (st.money < price) return { ok: false, msg: '소지금이 부족합니다' }
    const pay = () => set((s) => ({ money: s.money - price }))

    if (id === 'armor_half' || id === 'armor_full') {
      const target = id === 'armor_half' ? 50 : 100
      if (st.armor >= target) return { ok: false, msg: '해당 방어구 이상을 이미 보유 중입니다' }
      pay()
      set((s) => ({ armor: Math.min(CFG.armorMax, target) }))
    } else if (WEAPONS[id] && !WEAPONS[id].melee) {
      if (st.owned[id]) {
        get().equip(id)
        return { ok: true, msg: WEAPONS[id].name + ' 장착' }
      }
      const slot = WEAPONS[id].slot
      pay()
      set((s) => ({
        owned: Object.fromEntries(Object.keys(WEAPONS).map((key) => [
          key,
          key === id ? true : WEAPONS[key].slot === slot ? false : !!s.owned[key],
        ])),
        ammo: { ...s.ammo, [id]: { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve } },
      }))
      get().equip(id)
    }
    play('buy')
    return { ok: true, msg: '구매 완료' }
  },
}))

// 매 프레임 바뀌는 값은 zustand에 넣지 않고(리렌더 방지) 변경 가능한 객체로 공유합니다.
export const live = {
  locked: false,
  phase: 'menu', // useGame.phase 미러 (프레임 루프에서 빠르게 읽기)
  shopOpen: false,
  dead: false,
  firing: false,
  fireEdge: false,
  spread: CFG.baseSpread,
  fireSpread: 0,
  totalSpread: CFG.baseSpread,
  crossKick: 0, // 크로스헤어 사격 킥백
  speed: 0,
  grounded: true,
  crouch: false,
  run: false,
  state: 'stand', // stand | walk | run | crouch | air

  weapon: 'pistol',
  reloading: false,
  reloadStart: 0,
  reloadEnd: 0,
  reloadProgress: 0,
  nextShot: 0,
  viewKick: 0,
  swing: 0, // 나이프 휘두르기
  drawStart: 0,
  drawUntil: 0,

  buyEnd: 0,
  roundTimeLeft: MATCH.roundTime,

  // 뷰모델 튜너 (F2)
  tuner: false,
  vmTune: {},
  vmFallback: {}, // GLB 로드 실패 시 임시 모델 사용 여부
}

export const refs = {
  playerBody: null,
  botBody: null,
  teleportPlayer: null,
  snapSpawn: null,
  mapBounds: null,
  safePlayerSpawn: null,
  safeBotSpawn: null,
  resetRound: null, // Match가 등록
  resetBot: null, // Bot이 등록
  unlock: null, // Controls가 등록
}

// 프레임 루프용 미러 값 동기화
useGame.subscribe((s) => {
  live.phase = s.phase
  live.shopOpen = s.shopOpen
  live.dead = s.hp <= 0
})
