import { Component, Suspense, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { BOT_MODEL_URL, CFG, SPAWNS } from '../config'
import { live, refs, useGame } from '../store'
import { WEAPONS, calcDamage } from '../weapons'
import { absorbArmor } from '../economy'
import { enemies, targetMeshes } from '../enemies'
import { play, playBotFootstep } from '../audio'
import { FOOTSTEP_GAITS } from './FootstepMath.js'
import { on } from '../fx'
import { canBotFire, investigationTarget, validStepHeight } from './AITactics.js'
import { spawnImpact } from './Impacts'

useGLTF.preload(BOT_MODEL_URL)

const DEG = Math.PI / 180
const BOT_H = 1.75 // 모델을 이 키(m)로 맞춤
const now = () => performance.now() / 1000
const rand = (a, b) => a + Math.random() * (b - a)
const randInt = (a, b) => Math.floor(rand(a, b + 1))

// ───────── 난이도 1~5 ─────────
// react: 플레이어 발견 후 첫 사격까지 지연(초) / err: 기본 조준 오차(도) / moveErr: 이동 중 추가 오차
// headChance: 버스트마다 머리를 조준할 확률 / brake: true면 멈춰 서서 쏨(브레이킹) / cover: 엄폐 사용
const DIFF = {
  1: { react: 1.2, err: 7.0, moveErr: 4.0, interval: 0.5, burst: [1, 2], rest: [0.9, 1.6], headChance: 0.01, speed: 2.6, brake: false, cover: false },
  2: { react: 0.8, err: 5.0, moveErr: 3.5, interval: 0.38, burst: [2, 3], rest: [0.7, 1.3], headChance: 0.03, speed: 3.0, brake: false, cover: false },
  3: { react: 0.5, err: 3.0, moveErr: 2.5, interval: 0.22, burst: [3, 5], rest: [0.5, 1.0], headChance: 0.07, speed: 3.4, brake: false, cover: true },
  4: { react: 0.38, err: 1.6, moveErr: 2.0, interval: 0.15, burst: [4, 7], rest: [0.35, 0.8], headChance: 0.12, speed: 3.8, brake: true, cover: true },
  5: { react: 0.3, err: 0.9, moveErr: 1.6, interval: 0.12, burst: [5, 8], rest: [0.25, 0.55], headChance: 0.18, speed: 4.1, brake: true, cover: true },
}

// ───────── 봇 모델 (swat.glb: ValveBiped 본, 애니메이션 클립 없음 → 코드로 자세/걷기 구현) ─────────
const _q = new THREE.Quaternion()
const _a = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const AXIS_X = new THREE.Vector3(1, 0, 0)

// bone의 모델 루트 기준 현재 회전 (루트 → bone 로컬 쿼터니언을 곱함)
function rootQ(bone, root, out) {
  out.identity()
  const chain = []
  for (let o = bone; o && o !== root; o = o.parent) chain.push(o)
  for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion)
  return out
}

const SwatModel = forwardRef(function SwatModel(_props, ref) {
  const { scene } = useGLTF(BOT_MODEL_URL)

  const rig = useMemo(() => {
    const root = cloneSkinned(scene)
    const bones = []
    const mats = []
    root.traverse((o) => {
      if (o.isBone) bones.push(o)
      if (o.isMesh) {
        o.frustumCulled = false
        const fix = (m) => {
          const c = m.clone()
          if ('metalness' in c) c.metalness = Math.min(c.metalness ?? 0, 0.3)
          if ('emissive' in c) mats.push(c)
          return c
        }
        o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material)
      }
    })
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    let h = box.max.y - box.min.y
    if (!(h > 0.5 && h < 10)) h = 1.4
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0
    const scale = BOT_H / h

    // GLTFLoader가 이름의 '.'를 지우므로 정규식으로 찾습니다 (예: ValveBipedBip01_L_UpperArm_22)
    const find = (re) => bones.find((b) => re.test(b.name))
    const P = {
      lUp: find(/L_UpperArm/i), lFore: find(/L_Forearm/i), lHand: find(/L_Hand/i),
      rUp: find(/R_UpperArm/i), rFore: find(/R_Forearm/i), rHand: find(/R_Hand/i),
      lThigh: find(/L_Thigh/i), lCalf: find(/L_Calf/i),
      rThigh: find(/R_Thigh/i), rCalf: find(/R_Calf/i),
    }
    const rest = new Map()
    Object.values(P).forEach((b) => { if (b) rest.set(b, rootQ(b, root, new THREE.Quaternion())) })
    return { root, mats, scale, minY, P, rest }
  }, [scene])

  // 모델 루트 프레임 기준 회전 R을 적용 (R = 월드축 회전, 본의 로컬 축 방향과 무관)
  const setRot = (bone, R) => {
    if (!bone) return
    _a.copy(R).multiply(rig.rest.get(bone))
    rootQ(bone.parent, rig.root, _q).invert()
    bone.quaternion.copy(_q).multiply(_a)
  }
  const euler = (x, y) => new THREE.Quaternion().setFromEuler(_e.set(x, y, 0, 'XYZ'))
  const POSE = useMemo(() => ({
    lUp: euler(0.45, -1.25), lFore: euler(0.1, -2.0),
    rUp: euler(0.45, 1.25), rFore: euler(0.1, 2.0),
  }), []) // eslint-disable-line

  let gait = 0
  let flashOn = false

  useImperativeHandle(ref, () => ({
    // speed: 수평 속력, dead: 사망 여부 → 조준 자세 + 걷기 사이클
    update(dt, speed) {
      const { P } = rig
      setRot(P.lUp, POSE.lUp); setRot(P.lFore, POSE.lFore)
      setRot(P.rUp, POSE.rUp); setRot(P.rFore, POSE.rFore)
      gait += dt * speed * 2.1
      const k = Math.min(1, speed / 3.2)
      const sw = Math.sin(gait) * 0.55 * k
      const knee = (Math.max(0, Math.cos(gait)) * 0.7 + 0.1) * k
      const knee2 = (Math.max(0, -Math.cos(gait)) * 0.7 + 0.1) * k
      const ax = (ang) => _a.setFromAxisAngle(AXIS_X, ang).clone()
      setRot(P.lThigh, ax(sw)); setRot(P.lCalf, ax(sw + knee))
      setRot(P.rThigh, ax(-sw)); setRot(P.rCalf, ax(-sw + knee2))
      rig.root.updateMatrixWorld(true)
    },
    // 두 손의 중간 월드 좌표 (총 위치용)
    handMid(out) {
      const { lHand, rHand } = rig.P
      if (!lHand || !rHand) return false
      lHand.getWorldPosition(_v1)
      rHand.getWorldPosition(_v2)
      out.addVectors(_v1, _v2).multiplyScalar(0.5)
      return true
    },
    setFlash(on) {
      if (on === flashOn) return
      flashOn = on
      rig.mats.forEach((m) => m.emissive?.set(on ? '#ff2a1a' : '#000000'))
    },
  }), [rig, POSE]) // eslint-disable-line

  return (
    <group scale={rig.scale} position={[0, -rig.minY * rig.scale, 0]}>
      <primitive object={rig.root} />
    </group>
  )
})

// GLB를 못 불러왔을 때 쓰는 임시 박스 봇
function BoxBot() {
  return (
    <>
      <mesh position={[0, 0.45, 0]}><boxGeometry args={[0.5, 0.9, 0.3]} /><meshStandardMaterial color="#3a4a5c" /></mesh>
      <mesh position={[0, 1.2, 0]}><boxGeometry args={[0.62, 0.62, 0.3]} /><meshStandardMaterial color="#5f6b3a" /></mesh>
      <mesh position={[0, 1.6, 0]}><sphereGeometry args={[0.17, 14, 10]} /><meshStandardMaterial color="#d2a47c" /></mesh>
    </>
  )
}

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.warn(`[claudefps] 봇 모델 로드 실패 → 박스 봇 사용 (${BOT_MODEL_URL})`, err) }
  render() { return this.state.failed ? <BoxBot /> : this.props.children }
}

// 봇이 들고 있는 임시 소총 (+z 방향이 총구)
function BotGun({ gunRef, flashRef, weapon }) {
  const m = (p, s, c) => (
    <mesh position={p}><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={0.6} metalness={0.3} /></mesh>
  )
  return (
    <group ref={gunRef}>
      {(WEAPONS[weapon]?.slot === 'secondary') ? (
        <>
          {m([0, 0.04, 0.12], [0.09, 0.095, 0.28], '#222831')}
          {m([0, -0.08, 0], [0.07, 0.24, 0.10], '#30353a')}
        </>
      ) : (
        <>
          {m([0, 0, 0.05], [0.06, 0.1, 0.5], '#2b3036')}
          {m([0, 0.01, 0.45], [0.028, 0.028, 0.4], '#1c2024')}
          {m([0, -0.01, -0.28], [0.05, 0.11, 0.2], '#3b3f44')}
          {m([0, -0.12, 0.08], [0.045, 0.16, 0.07], '#1f2327')}
        </>
      )}
      <mesh ref={flashRef} position={weapon === 'pistol' ? [0, 0.05, 0.29] : [0, 0.01, 0.72]} visible={false}>
        <planeGeometry args={[0.10, 0.10]} />
        <meshBasicMaterial color="#ffd27a" opacity={0.5} transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ───────── 봇 본체 (물리 + AI) ─────────
export default function Bot() {
  const body = useRef()
  const group = useRef()
  const visual = useRef()
  const gun = useRef()
  const flash = useRef()
  const head = useRef()
  const torso = useRef()
  const legs = useRef()
  const barWrap = useRef()
  const barFill = useRef()
  const camera = useThree((s) => s.camera)
  const botWeapon = useGame((s) => s.botEconomy.weapon)
  const { world, rapier } = useRapier()

  const tmp = useMemo(() => ({
    losRay: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    probeRay: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    groundRay: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    cameraRight: new THREE.Vector3(),
    footstepVariant: 0,
    mid: new THREE.Vector3(),
    notBot: (c) => c.parent()?.handle !== body.current?.handle,
  }), [rapier])

  const S = useRef({
    hp: 100, dead: false, deadAt: 0, deadYaw: 0, flash: 0, yaw: 0, speed: 0,
    seen: false, seenAt: 0, lastSeen: -9, los: false, nextLos: 0,
    state: 'seek', nextShot: 0, burstLeft: 0, restUntil: 0, reloadUntil: 0, aimHead: false,
    strafe: 1, strafeUntil: 0, coverPos: null, coverUntil: 0, nextCover: 0,
    hurtAt: -9, stuckAt: 0, stuckX: 0, stuckZ: 0, unstuckUntil: 0, ux: 0, uz: 0, flashUntil: 0,
    lastKnown: null, heardAt: -9, investigateUntil: 0, nextHear: 0,
    patrolGoal: null, nextPatrol: 0, nextHop: 0, avoidSign: 0, avoidUntil: 0,
    nextFootstep: 0,
  })

  // 레지스트리 등록 (플레이어 사격 판정이 사용)
  useEffect(() => {
    const st = S.current
    enemies.set('bot', {
      get name() { return `AI Lv.${useGame.getState().difficulty}` },
      get dead() { return st.dead },
      get hp() { return st.hp },
      takeDamage(dmg) {
        if (st.dead) return { killed: false }
        const econ = useGame.getState()
        const hit = absorbArmor(st.hp, econ.botEconomy.armor, dmg)
        st.hp = hit.hp
        econ.setBotArmor(hit.armor)
        st.flash = 0.1
        st.hurtAt = now()
        // 맞으면 즉시 플레이어를 인지
        if (!st.seen) { st.seen = true; st.seenAt = now() - 0.3 }
        const target = refs.playerBody?.translation()
        if (target) { st.lastKnown = { x: target.x, z: target.z }; st.investigateUntil = now() + 5 }
        st.lastSeen = now()
        if (st.hp === 0) {
          st.dead = true
          st.deadAt = now()
          st.deadYaw = st.yaw
          body.current?.setEnabled(false) // 시체는 충돌/피격 판정에서 제외
          return { killed: true }
        }
        return { killed: false }
      },
    })
    const offNoise = on('combatNoise', ({ position, radius, kind }) => {
      const b = body.current
      if (!b || st.dead || live.phase !== 'live' || !Array.isArray(position)) return
      const p = b.translation()
      const distance = Math.hypot(p.x - position[0], p.y - position[1], p.z - position[2])
      const time = now()
      if (distance > radius || (kind === 'footstep' && time < st.nextHear)) return
      // Inexact hearing: a gunshot is more informative than a distant footstep.
      const uncertainty = Math.min(kind === 'gunshot' ? 2.6 : 5, 0.6 + distance * 0.09)
      st.lastKnown = {
        x: position[0] + rand(-uncertainty, uncertainty),
        z: position[2] + rand(-uncertainty, uncertainty),
      }
      st.heardAt = time
      st.investigateUntil = time + (kind === 'gunshot' ? 7 : 4)
      st.nextHear = time + (kind === 'gunshot' ? 0.8 : 0.55)
    })
    const ms = [head.current, torso.current, legs.current]
    ms.forEach((m) => targetMeshes.push(m))

    // 라운드 리셋
    refs.resetBot = (pos) => {
      const b = body.current
      Object.assign(st, {
        hp: 100, dead: false, deadAt: 0, flash: 0, seen: false, seenAt: 0,
        lastSeen: -9, los: false, nextLos: 0, state: 'seek', nextShot: 0, reloadUntil: 0,
        burstLeft: 0, restUntil: 0, aimHead: false, coverPos: null, coverUntil: 0,
        nextCover: 0, hurtAt: -9, speed: 0, stuckAt: 0, unstuckUntil: 0,
        flashUntil: 0, lastKnown: null, heardAt: -9, investigateUntil: 0,
        nextHear: 0, patrolGoal: null, nextPatrol: 0, nextHop: 0, avoidSign: 0, avoidUntil: 0,
        nextFootstep: 0,
      })
      if (b) {
        b.setEnabled(true)
        b.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true)
        b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
    return () => {
      offNoise()
      enemies.delete('bot')
      refs.resetBot = null
      ms.forEach((m) => {
        const i = targetMeshes.indexOf(m)
        if (i >= 0) targetMeshes.splice(i, 1)
      })
    }
  }, [])

  // 플레이어까지 시야가 트였는지 (벽에 막히면 false)
  const hasLos = (ex, ey, ez, dx, dy, dz, dist) => {
    const r = tmp.losRay
    r.origin.x = ex; r.origin.y = ey; r.origin.z = ez
    r.dir.x = dx / dist; r.dir.y = dy / dist; r.dir.z = dz / dist
    const h = world.castRay(r, dist, true, undefined, undefined, undefined, undefined, tmp.notBot)
    if (!h) return true
    return h.collider.parent()?.handle === refs.playerBody?.handle
  }

  const probe = (px, py, pz, dx, dz, len) => {
    const r = tmp.probeRay
    r.origin.x = px; r.origin.y = py; r.origin.z = pz
    r.dir.x = dx; r.dir.y = 0; r.dir.z = dz
    const h = world.castRay(r, len, true, undefined, undefined, undefined, undefined, tmp.notBot)
    return h ? h.timeOfImpact : len
  }

  // Find a patrol point on the SAME collision floor with a mostly clear short approach.
  // This is deliberately local steering, not a claim of full multi-floor pathfinding.
  const choosePatrol = (p) => {
    const ray = tmp.groundRay
    for (let i = 0; i < 18; i++) {
      const angle = rand(0, Math.PI * 2)
      const distance = rand(4, 13)
      const dx = Math.cos(angle), dz = Math.sin(angle)
      if (probe(p.x, p.y - 0.05, p.z, dx, dz, distance) < distance - 0.6) continue
      const x = p.x + dx * distance, z = p.z + dz * distance
      ray.origin.x = x; ray.origin.y = p.y + 1.4; ray.origin.z = z
      ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0
      const ground = world.castRayAndGetNormal(ray, 3.4, true, undefined, undefined, undefined, undefined, tmp.notBot)
      if (!ground || ground.normal.y < 0.72) continue
      const floorY = ray.origin.y - ground.timeOfImpact
      if (Math.abs(floorY - (p.y - CFG.capsuleHalfHeight - CFG.capsuleRadius)) > 0.55) continue
      return { x, z }
    }
    return null
  }

  // 플레이어 시야가 막히는 가까운 지점 찾기 (엄폐)
  const findCover = (p, ex, ey, ez) => {
    let best = null
    let bestD = 1e9
    const a0 = Math.random() * Math.PI * 2
    for (let i = 0; i < 10; i++) {
      const ang = a0 + (i * Math.PI * 2) / 10
      const r = rand(4, 9)
      const dx = Math.cos(ang), dz = Math.sin(ang)
      if (probe(ex, ey - 0.3, ez, dx, dz, r) < r - 0.5) continue // 가는 길이 막힘
      const cx = p.x + dx * r, cz = p.z + dz * r
      const tx = camera.position.x - cx, ty = camera.position.y - ey, tz = camera.position.z - cz
      const dist = Math.hypot(tx, ty, tz)
      if (hasLos(cx, ey, cz, tx, ty, tz, dist)) continue // 여전히 보임
      // A tactical cover point must have a standable floor at the bot's current level.
      const ray = tmp.groundRay
      ray.origin.x = cx; ray.origin.y = p.y + 1.25; ray.origin.z = cz
      ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0
      const floor = world.castRayAndGetNormal(ray, 3.0, true, undefined, undefined, undefined, undefined, tmp.notBot)
      if (!floor || floor.normal.y < 0.72) continue
      const floorY = ray.origin.y - floor.timeOfImpact
      if (Math.abs(floorY - (p.y - CFG.capsuleHalfHeight - CFG.capsuleRadius)) > 0.55) continue
      if (r < bestD) { bestD = r; best = { x: cx, z: cz } }
    }
    return best
  }

  const botShoot = (cfg, st, ex, ey, ez, pp, dist, weapon) => {
    // 조준점: 몸통 또는 머리
    const ty = pp.y + (st.aimHead ? 0.62 : 0.05)
    let dx = pp.x - ex, dy = ty - ey, dz = pp.z - ez
    const L = Math.hypot(dx, dy, dz) || 1
    dx /= L; dy /= L; dz /= L
    // 오차 원뿔 (이동 중이면 오차 증가)
    const err = cfg.err + (st.speed > 1.2 ? cfg.moveErr : 0)
    const rr = Math.tan(err * DEG) * Math.sqrt(Math.random())
    const a = Math.random() * Math.PI * 2
    _v1.set(dx, dy, dz)
    _v2.crossVectors(_v1, AXIS_Y).normalize()
    const up = new THREE.Vector3().crossVectors(_v2, _v1)
    const fx = dx + _v2.x * Math.cos(a) * rr + up.x * Math.sin(a) * rr
    const fy = dy + _v2.y * Math.cos(a) * rr + up.y * Math.sin(a) * rr
    const fz = dz + _v2.z * Math.cos(a) * rr + up.z * Math.sin(a) * rr
    const fl = Math.hypot(fx, fy, fz)

    const r = tmp.losRay
    r.origin.x = ex; r.origin.y = ey; r.origin.z = ez
    r.dir.x = fx / fl; r.dir.y = fy / fl; r.dir.z = fz / fl
    const h = world.castRay(r, 150, true, undefined, undefined, undefined, undefined, tmp.notBot)
    if (h) {
      const t = h.timeOfImpact
      if (h.collider.parent()?.handle === refs.playerBody?.handle) {
        const hitY = ey + (fy / fl) * t
        const headHit = hitY > pp.y + 0.45
        const dmg = Math.round(calcDamage(weapon, headHit ? 'head' : 'body', dist))
        useGame.getState().damagePlayer(dmg, { headshot: headHit, weapon: weapon.name })
      } else {
        spawnImpact(ex + (fx / fl) * t, ey + (fy / fl) * t, ez + (fz / fl) * t)
      }
    }
    st.flashUntil = now() + 0.05
    play(weapon.sound || (weapon.slot === 'secondary' ? 'pistol_shot' : 'rifle_shot'), {
      volume: THREE.MathUtils.clamp(1 - dist / 90, 0.15, 0.7),
      rate: 0.94 + Math.random() * 0.09,
    })
  }

  useFrame((_, delta) => {
    const b = body.current
    const g = group.current
    if (!b || !g) return
    refs.botBody = b
    const dt = Math.min(delta, 0.05)
    const t = now()
    const st = S.current
    const p = b.translation()
    const game = useGame.getState()
    const cfg = DIFF[game.difficulty] || DIFF[3]
    const loadout = game.botEconomy
    const currentWeapon = WEAPONS[loadout.weapon] || WEAPONS.pistol
    if (st.reloadUntil > 0 && t >= st.reloadUntil) {
      game.botReload()
      st.reloadUntil = 0
    }

    if (p.y < CFG.killY) {
      const s = refs.safeBotSpawn || SPAWNS.bot
      b.setTranslation({ x: s[0], y: s[1], z: s[2] }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
    g.position.set(p.x, p.y - 0.8, p.z)

    // 교전 중(포인터락 + live 단계)에만 행동. 일시정지/구매/상점 중에는 정지
    const active = !st.dead && live.phase === 'live' && live.locked && !live.dead
    const pp = refs.playerBody?.translation()
    const v = b.linvel()
    let dirx = 0, dirz = 0, spd = 0, hop = false

    if (active && pp) {
      const ex = p.x, ey = p.y + 0.7, ez = p.z
      const dx = camera.position.x - ex, dy = camera.position.y - ey, dz = camera.position.z - ez
      const dist = Math.hypot(dx, dy, dz)
      const dh = Math.hypot(dx, dz) || 1
      const toX = dx / dh, toZ = dz / dh

      // 시야 확인 (0.12초마다) → 발견 시각 기록
      if (t >= st.nextLos) {
        st.nextLos = t + 0.12
        st.los = dist < 80 && hasLos(ex, ey, ez, dx, dy, dz, dist)
      }
      if (st.los) {
        if (!st.seen) { st.seen = true; st.seenAt = t }
        st.lastSeen = t
        st.lastKnown = { x: pp.x, z: pp.z }
        st.investigateUntil = t + 5
        st.patrolGoal = null
      } else if (st.seen && t - st.lastSeen > 0.55) {
        st.seen = false
      }
      // Never fire on stale sight / through walls just because a target was seen earlier.
      const canShoot = canBotFire({ visible: st.los, spotted: st.seen, seenAt: st.seenAt, time: t, reaction: cfg.react })

      // ── 이동 의도 ──
      if (st.state === 'cover' && st.coverPos) {
        const cx = st.coverPos.x - p.x, cz = st.coverPos.z - p.z
        const cd = Math.hypot(cx, cz)
        if (cd < 0.8 || t > st.coverUntil) { st.state = 'seek'; st.coverPos = null }
        else { dirx = cx / cd; dirz = cz / cd; spd = cfg.speed * 1.15 }
      } else if (!st.los) {
        // Investigate the last visible/heard location, NOT the current player coordinates.
        let goal = investigationTarget({ visible: st.los, lastKnown: st.lastKnown,
          investigateUntil: st.investigateUntil, patrolGoal: null, time: t })
        if (goal && Math.hypot(goal.x - p.x, goal.z - p.z) < 1.7) {
          st.investigateUntil = 0
          st.lastKnown = null
          goal = null
        }
        if (!goal) {
          if (t >= st.nextPatrol || (st.patrolGoal &&
            Math.hypot(st.patrolGoal.x - p.x, st.patrolGoal.z - p.z) < 1.5)) {
            st.patrolGoal = choosePatrol(p)
            st.nextPatrol = t + rand(4, 8)
          }
          goal = st.patrolGoal
        }
        st.state = st.lastKnown && goal === st.lastKnown ? 'investigate' : 'patrol'
        if (goal) {
          const gx = goal.x - p.x, gz = goal.z - p.z
          const d = Math.hypot(gx, gz)
          if (d > 0.5) {
            dirx = gx / d; dirz = gz / d
            // Close-range investigation is quiet; loud running is reserved for engagement/chasing.
            spd = st.state === 'patrol' ? Math.min(cfg.speed * 0.65, 2.4)
              : d < 7 ? Math.min(cfg.speed, 1.55) : cfg.speed * 0.9
          }
        }
      } else {
        st.state = 'engage'
        // 체력이 낮거나 맞은 직후 → 엄폐 (난이도 3 이상)
        if (cfg.cover && t >= st.nextCover && (st.hp < 45 || (t - st.hurtAt < 0.3 && Math.random() < 0.12))) {
          st.nextCover = t + 3
          const c = findCover(p, ex, ey, ez)
          if (c) { st.coverPos = c; st.coverUntil = t + rand(2, 3.5); st.state = 'cover' }
        }
        if (st.state === 'engage') {
          if (t > st.strafeUntil) { st.strafe = Math.random() < 0.5 ? 1 : -1; st.strafeUntil = t + rand(0.8, 2.2) }
          const approach = dist > 20 ? 1 : dist < 8 ? -1 : 0
          dirx = toX * approach * 0.8 + -toZ * st.strafe
          dirz = toZ * approach * 0.8 + toX * st.strafe
          const l = Math.hypot(dirx, dirz) || 1
          dirx /= l; dirz /= l
          spd = cfg.speed
          // 4~5단계: 버스트를 쏠 때는 멈춰 서서 정확하게 (브레이킹)
          if (cfg.brake && canShoot && (st.burstLeft > 0 || t >= st.restUntil)) spd = 0
          else if (!cfg.brake && st.burstLeft > 0) spd *= 0.6
        }
      }

      // ── 낮은 장애물 점프 / 벽 회피 / 끼임 탈출 ──
      if (spd > 0) {
        if (t > st.nextHop && Math.abs(v.y) < 0.15) {
          const low = probe(p.x, p.y - 0.32, p.z, dirx, dirz, 1.0)
          const upper = probe(p.x, p.y + 0.72, p.z, dirx, dirz, 1.15)
          if (low < 0.85 && upper > 1.0) {
            const ray = tmp.groundRay
            ray.origin.x = p.x + dirx * 1.15
            ray.origin.y = p.y + 1.45
            ray.origin.z = p.z + dirz * 1.15
            ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0
            const floor = world.castRayAndGetNormal(ray, 2.4, true, undefined, undefined, undefined, undefined, tmp.notBot)
            if (floor && floor.normal.y > 0.72) {
              const centerY = ray.origin.y - floor.timeOfImpact + CFG.capsuleHalfHeight + CFG.capsuleRadius
              if (validStepHeight(centerY - p.y)) {
                const ground = world.castRay(
                  new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 }),
                  0.97, true, undefined, undefined, undefined, undefined, tmp.notBot,
                )
                if (ground) {
                  hop = true
                  st.nextHop = t + 1.35
                }
              }
            }
          }
        }
        if (hop) {
          // Keep the current desired direction and use the normal jump impulse.
        } else if (t < st.unstuckUntil) { dirx = st.ux; dirz = st.uz }
        else {
          const fwd = probe(p.x, p.y - 0.2, p.z, dirx, dirz, 1.6)
          if (fwd < 1.2) {
            const cs = Math.cos(0.8), sn = Math.sin(0.8)
            const lx = dirx * cs - dirz * sn, lz = dirx * sn + dirz * cs
            const rx = dirx * cs + dirz * sn, rz = -dirx * sn + dirz * cs
            const lf = probe(p.x, p.y - 0.2, p.z, lx, lz, 1.6)
            const rf = probe(p.x, p.y - 0.2, p.z, rx, rz, 1.6)
            const c2 = Math.cos(1.1), s2 = Math.sin(1.1)
            // Keep one wall-following side briefly, preventing rapid left/right oscillation.
            if (t > st.avoidUntil) {
              st.avoidSign = lf >= rf ? 1 : -1
              st.avoidUntil = t + 1.25
            }
            const sign = st.avoidSign || 1
            const nx = dirx * c2 - sign * dirz * s2
            dirz = sign * dirx * s2 + dirz * c2
            dirx = nx
          }
        }
        if (t - st.stuckAt > 1) {
          if (Math.hypot(p.x - st.stuckX, p.z - st.stuckZ) < 0.25 && spd > 1) {
            const a = Math.random() * Math.PI * 2
            st.ux = Math.cos(a); st.uz = Math.sin(a); st.unstuckUntil = t + 0.8
          }
          st.stuckAt = t; st.stuckX = p.x; st.stuckZ = p.z
        }
      }

      // ── 사격 · 탄창 · 재장전 (플레이어와 같은 총기 데이터 사용) ──
      if (active && !st.reloadUntil && t >= st.nextShot) {
        const slot = useGame.getState().botEconomy.ammo[currentWeapon.id]
        if (slot.mag <= 0 && slot.reserve > 0) {
          st.reloadUntil = t + currentWeapon.reloadTimeEmpty
          st.burstLeft = 0
          st.nextShot = st.reloadUntil
          play('reload', { volume: 0.3 })
        } else if (slot.mag > 0 && canShoot && st.state === 'engage') {
          if (st.burstLeft <= 0 && t >= st.restUntil) {
            st.burstLeft = randInt(cfg.burst[0], cfg.burst[1])
            st.aimHead = Math.random() < cfg.headChance
          }
          if (st.burstLeft > 0 && (!cfg.brake || st.speed < 1.1) && game.botShot()) {
            botShoot(cfg, st, ex, ey, ez, pp, dist, currentWeapon)
            st.burstLeft--
            st.nextShot = t + Math.max(cfg.interval, currentWeapon.fireInterval)
            if (st.burstLeft === 0) st.restUntil = t + rand(cfg.rest[0], cfg.rest[1])
          }
        }
      }

      // 몸 방향: 발견했으면 플레이어 쪽, 아니면 이동 방향
      const target = st.los ? Math.atan2(dx, dz) : spd > 0.3 ? Math.atan2(dirx, dirz) : st.yaw
      let diff = target - st.yaw
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      st.yaw += diff * (1 - Math.exp(-10 * dt))
    }

    // 속도 적용 (비활성 시 정지)
    const f = 1 - Math.exp(-12 * dt)
    const vx = v.x + (dirx * spd - v.x) * f
    const vz = v.z + (dirz * spd - v.z) * f
    if (!st.dead) b.setLinvel({ x: vx, y: hop ? CFG.jumpVelocity : v.y, z: vz }, true)
    st.speed = Math.hypot(vx, vz)

    if (active && st.speed > 0.8 && Math.abs(v.y) < 0.3 && t >= st.nextFootstep) {
      const gait = st.state === 'investigate' && st.speed < 1.8 ? 'crouch'
        : st.speed > 2.8 ? 'run' : 'walk'
      tmp.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
      playBotFootstep({
        source: [p.x, p.y, p.z],
        listener: [camera.position.x, camera.position.y, camera.position.z],
        right: [tmp.cameraRight.x, tmp.cameraRight.y, tmp.cameraRight.z],
        gait,
        variant: tmp.footstepVariant++ % 2,
      })
      st.nextFootstep = t + FOOTSTEP_GAITS[gait].interval
    } else if (!active || st.speed < 0.8 || Math.abs(v.y) >= 0.3) {
      st.nextFootstep = Math.max(st.nextFootstep, t + 0.06)
    }

    // 사망 시 뒤로 쓰러짐 / 평상시 yaw 적용
    if (st.dead) {
      const k = Math.min(1, (t - st.deadAt) / 0.4)
      g.rotation.set(-k * Math.PI * 0.5, st.deadYaw, 0)
    } else {
      g.rotation.set(0, st.yaw, 0)
    }

    // 모델 자세 + 총 위치 (두 손 사이)
    g.updateMatrixWorld(true)
    visual.current?.update(dt, st.dead ? 0 : st.speed)
    visual.current?.setFlash((st.flash -= dt) > 0)
    if (gun.current) {
      gun.current.visible = !st.dead
      if (visual.current?.handMid(tmp.mid)) {
        g.worldToLocal(tmp.mid)
        gun.current.position.copy(tmp.mid).add(_gunOffset)
      } else {
        gun.current.position.set(0.12, 1.15, 0.3)
      }
    }
    if (flash.current) flash.current.visible = t < st.flashUntil

    // 체력바
    barWrap.current.visible = !st.dead && st.hp < 100
    barFill.current.scale.x = Math.max(0.001, st.hp / 100)
  })

  return (
    <>
      <RigidBody
        ref={body}
        position={SPAWNS.bot}
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={0}
        canSleep={false}
        ccd
        type="dynamic"
      >
        <CapsuleCollider args={[CFG.capsuleHalfHeight, CFG.capsuleRadius]} friction={0} restitution={0} />
      </RigidBody>

      <group ref={group} rotation-order="YXZ">
        <Boundary>
          <Suspense fallback={<BoxBot />}>
            <SwatModel ref={visual} />
          </Suspense>
        </Boundary>
        <BotGun gunRef={gun} flashRef={flash} weapon={botWeapon} />
        {/* High-visibility shoulder identifiers, occluded by walls normally. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.35, 1.37, 0]} rotation={[0, 0, side * 0.14]}>
            <boxGeometry args={[0.05, 0.17, 0.23]} />
            <meshStandardMaterial color="#ff883d" emissive="#b73e12" emissiveIntensity={0.5}
              roughness={0.8} />
          </mesh>
        ))}

        {/* 보이지 않는 히트박스: 머리 3x / 몸통 1x / 다리 0.75x */}
        <mesh ref={legs} position={[0, 0.45, 0]} visible={false} userData={{ enemyId: 'bot', part: 'legs' }}>
          <boxGeometry args={[0.55, 0.9, 0.34]} />
          <meshBasicMaterial />
        </mesh>
        <mesh ref={torso} position={[0, 1.2, 0]} visible={false} userData={{ enemyId: 'bot', part: 'body' }}>
          <boxGeometry args={[0.7, 0.62, 0.36]} />
          <meshBasicMaterial />
        </mesh>
        <mesh ref={head} position={[0, 1.6, 0]} visible={false} userData={{ enemyId: 'bot', part: 'head' }}>
          <sphereGeometry args={[0.17, 12, 10]} />
          <meshBasicMaterial />
        </mesh>

        <group ref={barWrap} position={[0, 2.0, 0]}>
          <mesh><planeGeometry args={[0.64, 0.08]} /><meshBasicMaterial color="#111" /></mesh>
          <group ref={barFill} position={[-0.3, 0, 0.002]}>
            <mesh position={[0.3, 0, 0]}><planeGeometry args={[0.6, 0.05]} /><meshBasicMaterial color="#ff4d3a" /></mesh>
          </group>
        </group>
      </group>
    </>
  )
}

const AXIS_Y = new THREE.Vector3(0, 1, 0)
const _gunOffset = new THREE.Vector3(0, 0.02, 0.12)
