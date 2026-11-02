import { create } from 'zustand'
import { CFG, MATCH, TRAINING } from './config'
import { WEAPONS } from './weapons'
import { emit, cam } from './fx'
import { play } from './audio'

const readSens = () => {
  try {
    const v = Number(localStorage.getItem('claudefps.sens'))
    return v >= CFG.sensMin && v <= CFG.sensMax ? v : 1
  } catch {
    return 1
  }
}

const initialAmmo = () =>
  Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, { mag: w.mag, reserve: w.reserve }]))
const initialOwned = () => ({ rifle: false, pistol: true, knife: true })
const now = () => performance.now() / 1000

// React 리렌더가 필요한 UI 상태만 여기에 둡니다.
export const useGame = create((set, get) => ({
  // ----- 입력/설정 -----
  locked: false,
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
  weapon: 'pistol',
  owned: initialOwned(),
  ammo: initialAmmo(),
  setAmmo: (id, mag, reserve) => set((s) => ({ ammo: { ...s.ammo, [id]: { mag, reserve } } })),

  equip: (id) => {
    if (!get().owned[id]) return
    live.weapon = id // 실제 교체 연출/딜레이는 WeaponSystem이 감지해서 처리
    set({ weapon: id })
  },

  // 플레이어 피격: 아머가 데미지의 66%를 먼저 흡수, 나머지만 HP 차감
  damagePlayer: (amount, meta) => {
    const { hp, armor } = get()
    if (hp <= 0) return
    const absorbed = Math.min(armor, amount * CFG.armorRatio)
    const nhp = Math.max(0, hp - (amount - absorbed))
    set({ hp: nhp, armor: armor - absorbed })
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
      money: MATCH.startMoney, hp: 100, armor: 0,
      owned: initialOwned(), ammo: initialAmmo(), weapon: 'pistol',
      matchOver: null, roundBanner: null,
    })
    get().beginRound()
  },

  // 라운드 시작: 위치 초기화 → 구매 단계(상점 자동 오픈, 포인터락 해제)
  beginRound: () => {
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
    set({ phase: 'live', shopOpen: false })
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
    const reward = winner === 'player' ? MATCH.winReward : MATCH.lossReward
    live.firing = false
    set((s) => ({
      phase: 'roundEnd', score,
      money: Math.min(MATCH.maxMoney, s.money + reward),
      roundBanner: { winner, reward },
    }))
    play(winner === 'player' ? 'round_win' : 'round_lose')

    setTimeout(() => {
      if (get().phase !== 'roundEnd') return
      if (score.player >= MATCH.winScore || score.ai >= MATCH.winScore) {
        set({ phase: 'matchEnd', matchOver: score.player >= MATCH.winScore ? 'win' : 'lose', shopOpen: false })
        refs.unlock?.()
        return
      }
      // 생존자는 장비 유지 / 사망자는 주무기·아머 상실, 돈은 유지
      if (get().hp <= 0) {
        set((s) => ({
          owned: { ...s.owned, rifle: false },
          armor: 0,
          ammo: { ...s.ammo, rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve },
                  pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
        }))
        get().equip('pistol')
      }
      set((s) => ({ round: s.round + 1 }))
      get().beginRound()
    }, MATCH.endDelay * 1000)
  },

  // 상점 구매. 결과: { ok, msg }
  buy: (id) => {
    const st = get()
    if (st.phase !== 'buy') return { ok: false, msg: '구매 시간이 지났습니다' }
    const price = { armor_half: 650, armor_full: 1000, rifle: WEAPONS.rifle.price, pistol: 0, ammo: 100 }[id]
    if (st.money < price) return { ok: false, msg: '소지금이 부족합니다' }
    const pay = () => set((s) => ({ money: s.money - price }))

    if (id === 'armor_half' || id === 'armor_full') {
      if (st.armor >= CFG.armorMax) return { ok: false, msg: '아머가 가득 찼습니다' }
      const add = id === 'armor_half' ? 25 : 50
      pay()
      set((s) => ({ armor: Math.min(CFG.armorMax, s.armor + add) }))
    } else if (id === 'rifle') {
      if (st.owned.rifle) return { ok: false, msg: '이미 보유 중입니다' }
      pay()
      set((s) => ({
        owned: { ...s.owned, rifle: true },
        ammo: { ...s.ammo, rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve } },
      }))
      get().equip('rifle')
    } else if (id === 'pistol') {
      get().equip('pistol')
      return { ok: true, msg: 'Glock 장착' }
    } else if (id === 'ammo') {
      const w = WEAPONS[st.weapon]
      if (w.melee) return { ok: false, msg: '나이프는 탄약이 필요 없습니다' }
      const a = st.ammo[w.id]
      if (a.reserve >= w.reserve) return { ok: false, msg: '예비 탄약이 가득 찼습니다' }
      pay()
      get().setAmmo(w.id, a.mag, w.reserve)
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
