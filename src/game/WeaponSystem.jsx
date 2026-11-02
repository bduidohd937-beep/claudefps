import { useEffect, useMemo } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { CFG, TRAINING } from '../config'
import { live, refs, useGame } from '../store'
import { WEAPONS, WEAPON_IDS, calcDamage } from '../weapons'
import { enemies, targetMeshes } from '../enemies'
import { emit, kick, on } from '../fx'
import { play } from '../audio'
import { burst } from './Particles'
import { spawnImpact } from './Impacts'
import { VM, FALLBACK_BASE, VMSlot, VMRenderer } from './ViewModels'

const DEG = Math.PI / 180
const nowSec = () => performance.now() / 1000
const TUNE_KEY = 'claudefps.vmtune'
const blankTune = () => ({ x: 0, y: 0, z: 0, s: 1, rx: 0, ry: 0, rz: 0 })

try {
  const saved = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}')
  for (const id of WEAPON_IDS) live.vmTune[id] = { ...blankTune(), ...(saved[id] || {}) }
} catch {
  for (const id of WEAPON_IDS) live.vmTune[id] = blankTune()
}
const saveTune = () => { try { localStorage.setItem(TUNE_KEY, JSON.stringify(live.vmTune)) } catch {} }

const canAct = () => live.locked && !live.dead && (live.phase === 'live' || TRAINING)

// ---------- 재장전 ----------
function startReload() {
  const w = WEAPONS[live.weapon]
  if (w.melee) return
  const a = useGame.getState().ammo[w.id]
  if (live.reloading || a.mag >= w.mag || a.reserve <= 0) return
  const empty = a.mag === 0
  const time = empty ? w.reloadTimeEmpty : w.reloadTime
  live.reloading = true
  live.reloadStart = nowSec()
  live.reloadEnd = live.reloadStart + time
  play('reload')
  emit('reloadStart', { id: w.id, empty, time })
}

function finishReload() {
  const w = WEAPONS[live.weapon]
  const a = useGame.getState().ammo[w.id]
  const take = Math.min(w.mag - a.mag, a.reserve)
  useGame.getState().setAmmo(w.id, a.mag + take, a.reserve - take)
  live.reloading = false
}

export default function WeaponSystem() {
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()

  const vmScene = useMemo(() => new THREE.Scene(), [])
  const vmCamera = useMemo(() => new THREE.PerspectiveCamera(CFG.vmFov, 1, 0.01, 10), [])
  const mk = () => Object.fromEntries(WEAPON_IDS.map((id) => [id, { current: null }]))
  const wraps = useMemo(mk, [])
  const apis = useMemo(mk, [])
  const flashes = useMemo(mk, [])

  const t = useMemo(() => ({
    ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }),
    rc: new THREE.Raycaster(),
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(0, 0, 0, 'YXZ'),
    bob: 0,
    flashUntil: 0,
    lastWeapon: null,
    // 플레이어/봇 본체 콜라이더는 총알 판정에서 제외 (적 피격은 히트박스로 따로 판정)
    notActors: (c) => {
      const h = c.parent()?.handle
      return h !== refs.playerBody?.handle && h !== refs.botBody?.handle
    },
  }), [rapier])

  // ----- 입력 -----
  useEffect(() => {
    const md = (e) => {
      if (e.button !== 0 || !canAct()) return
      live.firing = true
      live.fireEdge = true
    }
    const mu = (e) => { if (e.button === 0) live.firing = false }
    const kd = (e) => {
      if (e.code === 'F2') {
        e.preventDefault()
        if (!e.repeat) {
          const st = useGame.getState()
          st.setTunerOpen(!st.tunerOpen)
        }
        return
      }
      if (!live.locked) return

      // 뷰모델 튜너 (F2로 켠 뒤 사용)
      if (live.tuner) {
        const tn = live.vmTune[live.weapon]
        const step = 0.01
        const map = {
          KeyJ: () => (tn.x -= step), KeyL: () => (tn.x += step),
          KeyK: () => (tn.y -= step), KeyI: () => (tn.y += step),
          KeyU: () => (tn.z -= step), KeyO: () => (tn.z += step),
          KeyZ: () => (tn.s *= 0.95), KeyX: () => (tn.s *= 1.05),
          KeyN: () => (tn.ry -= 0.1), KeyM: () => (tn.ry += 0.1),
          KeyT: () => (tn.rx += 0.1), KeyG: () => (tn.rx -= 0.1),
          Backspace: () => Object.assign(tn, blankTune()),
        }
        if (map[e.code]) {
          map[e.code]()
          saveTune()
          console.log(`[vm tune] ${live.weapon}`, JSON.stringify(tn))
          return
        }
      }

      if (e.repeat || !canAct()) return
      if (e.code === 'KeyR') startReload()
      else if (e.code === 'Digit1') useGame.getState().equipSlot('primary')
      else if (e.code === 'Digit2') useGame.getState().equipSlot('secondary')
      else if (e.code === 'Digit3') useGame.getState().equip('knife')
      else if (e.code === 'KeyH') useGame.getState().damagePlayer(18) // 피격 연출 테스트
    }
    window.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('keydown', kd)
    return () => {
      window.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('keydown', kd)
    }
  }, [])

  // 재장전 애니메이션: 클립 길이를 재장전 시간에 맞춰 재생 속도 조절
  useEffect(() => on('reloadStart', ({ id, empty, time }) => {
    const api = apis[id].current
    if (!api) return
    const key = empty && api.hasClip('reloadEmpty') ? 'reloadEmpty' : 'reload'
    const dur = api.duration(key)
    if (dur > 0) api.play(key, { timeScale: dur / time, fade: 0.1 })
  }), [apis])

  // ----- 적 피격 처리 (총/나이프 공용) -----
  const hitEnemy = (hit, w, dmg, dirSign = -1) => {
    const { enemyId, part } = hit.object.userData
    const enemy = enemies.get(enemyId)
    const head = part === 'head'
    const res = enemy.takeDamage(dmg)
    burst(hit.point.x, hit.point.y, hit.point.z, dirSign * t.dir.x, dirSign * t.dir.y, dirSign * t.dir.z, head ? 'headBlood' : 'blood')
    play(head ? 'headshot' : 'hit_marker', { volume: head ? 1 : 0.8 })
    emit('hit', { part, damage: dmg, headshot: head, killed: res.killed })
    if (res.killed) emit('kill', { killer: '플레이어', victim: enemy.name, weapon: w.name, headshot: head, byPlayer: true })
  }

  const worldRay = (maxDist) => {
    const ray = t.ray
    ray.origin.x = t.origin.x; ray.origin.y = t.origin.y; ray.origin.z = t.origin.z
    ray.dir.x = t.dir.x; ray.dir.y = t.dir.y; ray.dir.z = t.dir.z
    return world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined, undefined, t.notActors)
  }

  const shoot = (w, now) => {
    live.nextShot = now + w.fireInterval
    const st = useGame.getState()
    const a = st.ammo[w.id]
    st.setAmmo(w.id, a.mag - 1, a.reserve)

    // Shotgun pellets use independent raycasts, whereas regular guns fire one hitscan shot.
    const pellets = w.pellets || 1
    const pelletSpread = w.pelletSpread || 0
    for (let i = 0; i < pellets; i++) {
      const spread = Math.max(0.01, live.totalSpread + pelletSpread)
      const r = Math.tan(spread * DEG) * Math.sqrt(Math.random())
      const ang = Math.random() * Math.PI * 2
      t.dir.set(Math.cos(ang) * r, Math.sin(ang) * r, -1).normalize().applyQuaternion(camera.quaternion)
      t.origin.copy(camera.position)

      const wh = worldRay(CFG.maxRange)
      const worldDist = wh ? wh.timeOfImpact : CFG.maxRange
      t.rc.set(t.origin, t.dir)
      t.rc.near = 0
      t.rc.far = worldDist
      const hits = t.rc.intersectObjects(targetMeshes, false)
      const hit = hits.find((h) => !enemies.get(h.object.userData.enemyId)?.dead)

      if (hit) {
        const dmg = Math.round(calcDamage(w, hit.object.userData.part, hit.distance))
        hitEnemy(hit, w, dmg)
      } else if (wh && (pellets === 1 || i === 0)) {
        const px = t.origin.x + t.dir.x * worldDist
        const py = t.origin.y + t.dir.y * worldDist
        const pz = t.origin.z + t.dir.z * worldDist
        spawnImpact(px, py, pz)
        burst(px, py, pz, wh.normal.x, wh.normal.y, wh.normal.z, 'dust')
      }
    }

    kick(camera, w.recoil.pitch, (Math.random() * 2 - 1) * w.recoil.yaw)
    live.viewKick = Math.min(live.viewKick + 1, 2)
    live.crossKick = 1
    live.fireSpread = Math.min(live.fireSpread + w.fireSpread, w.fireSpreadMax)
    t.flashUntil = now + 0.032
    play(w.sound || (w.slot === 'secondary' ? 'pistol_shot' : 'rifle_shot'), { rate: 0.96 + Math.random() * 0.08 })
    emit('combatNoise', { position: camera.position.toArray(), radius: w.id === 'awp' ? 75 : 58, kind: 'gunshot' })
    apis[w.id].current?.play('fire', { timeScale: VM[w.id].fireSpeed || 1, fade: 0.02, restart: true })

    if (a.mag - 1 <= 0) startReload() // 탄창이 비면 자동 재장전
  }

  const melee = (w, now) => {
    live.nextShot = now + w.fireInterval
    live.swing = 1
    live.crossKick = 0.6
    play('knife_swing')
    emit('combatNoise', { position: camera.position.toArray(), radius: 7, kind: 'melee' })
    camera.getWorldDirection(t.dir)
    t.origin.copy(camera.position)
    const wh = worldRay(w.range)
    t.rc.set(t.origin, t.dir)
    t.rc.near = 0
    t.rc.far = wh ? wh.timeOfImpact : w.range
    const hit = t.rc.intersectObjects(targetMeshes, false).find((h) => !enemies.get(h.object.userData.enemyId)?.dead)
    if (hit) {
      const dmg = Math.round(w.damage * (hit.object.userData.part === 'legs' ? 0.75 : 1))
      hitEnemy(hit, w, dmg)
    }
  }

  // ----- 매 프레임 -----
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = nowSec()

    // 무기 교체 감지: 재장전 취소, 교체 딜레이, 교체 애니메이션
    if (live.weapon !== t.lastWeapon) {
      apis[t.lastWeapon]?.current?.idle()
      t.lastWeapon = live.weapon
      const nw = WEAPONS[live.weapon]
      live.reloading = false
      live.drawStart = now
      live.drawUntil = now + nw.drawTime
      live.nextShot = Math.max(live.nextShot, now + nw.drawTime)
      const api = apis[live.weapon].current
      api?.idle()
      if (api?.hasClip('draw')) api.play('draw', { timeScale: api.duration('draw') / nw.drawTime, fade: 0.05 })
    }
    const w = WEAPONS[live.weapon]

    if (live.reloading && now >= live.reloadEnd) finishReload()

    live.fireSpread *= Math.exp(-7 * dt)
    live.totalSpread = live.spread * w.spreadMul + live.fireSpread
    live.crossKick *= Math.exp(-14 * dt)

    // 사격 / 나이프
    const wantFire = canAct() && (w.auto ? live.firing : live.fireEdge)
    if (wantFire && !live.reloading && now >= live.nextShot) {
      if (w.melee) {
        melee(w, now)
      } else {
        const a = useGame.getState().ammo[w.id]
        if (a.mag > 0) shoot(w, now)
        else if (a.reserve > 0) startReload()
        else { live.nextShot = now + 0.25; play('dry_fire') }
      }
    }
    live.fireEdge = false

    // ----- 1인칭 총기 표시 -----
    live.viewKick *= Math.exp(-16 * dt)
    live.swing *= Math.exp(-7 * dt)
    live.reloadProgress = live.reloading
      ? THREE.MathUtils.clamp((now - live.reloadStart) / (live.reloadEnd - live.reloadStart), 0, 1)
      : 0

    for (const id of WEAPON_IDS) {
      const wr = wraps[id].current
      if (wr) wr.visible = id === live.weapon
    }
    const wrap = wraps[live.weapon].current
    if (!wrap) return
    const api = apis[live.weapon].current
    const def = VM[live.weapon]
    const fb = live.vmFallback[live.weapon]
    const tn = live.vmTune[live.weapon]

    if (api) {
      const busy = live.reloading || now < live.drawUntil
      const moving = live.grounded && live.speed > 1 && live.locked
      api.setLoco(!busy && moving ? (live.state === 'run' ? 'run' : 'walk') : null)
      api.update(dt)
    }

    // 임시 모델이거나 클립이 없을 때만 코드로 재장전/교체 동작을 흉내
    const dip = fb && live.reloading ? Math.sin(live.reloadProgress * Math.PI) : 0
    const drawing = now < live.drawUntil && (!api || !api.hasClip('draw'))
    const dp = drawing ? 1 - THREE.MathUtils.clamp((now - live.drawStart) / w.drawTime, 0, 1) : 0

    t.bob += dt * live.speed * (live.grounded ? 1.4 : 0)
    const base = fb ? FALLBACK_BASE[live.weapon] : def.pos
    const bobAmp = api && api.hasClip('walk') ? 0 : 1 // 걷기 클립이 있으면 코드 흔들림은 끔
    wrap.position.set(
      base[0] + tn.x + Math.cos(t.bob) * 0.004 * bobAmp,
      base[1] + tn.y + Math.abs(Math.sin(t.bob)) * 0.006 * bobAmp - dip * 0.2 - dp * 0.35,
      base[2] + tn.z + live.viewKick * 0.03 + live.swing * 0.08,
    )
    t.e.set(
      tn.rx + live.viewKick * 0.045 - dip * 0.9 - dp * 0.8 - live.swing * 0.5,
      (fb ? 0 : def.rotY) + tn.ry,
      (tn.rz ?? 0) + dip * 0.5 + live.swing * 0.7,
    )
    wrap.quaternion.setFromEuler(t.e)
    wrap.scale.setScalar((fb ? 1 : def.scale) * tn.s)

    // 머즐 플래시
    for (const id of WEAPON_IDS) if (flashes[id].current) flashes[id].current.visible = false
    const fl = flashes[live.weapon].current
    if (fl && now < t.flashUntil) {
      fl.visible = true
      fl.rotation.z = Math.random() * Math.PI
      fl.scale.setScalar(0.55 + Math.random() * 0.25)
    }
  })

  return (
    <>
      <VMRenderer vmScene={vmScene} vmCamera={vmCamera} />
      {createPortal(
        <>
          <ambientLight intensity={1.3} />
          <hemisphereLight args={['#ffffff', '#555566', 1.0]} />
          <directionalLight position={[1, 2, 1.5]} intensity={2.2} />
          {WEAPON_IDS.map((id) => (
            <group key={id} ref={(el) => { wraps[id].current = el }} visible={false}>
              <VMSlot id={id} apiRef={apis[id]} flashRef={flashes[id]} />
            </group>
          ))}
        </>,
        vmScene,
      )}
    </>
  )
}
