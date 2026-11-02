import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { ACTIVE_MAP, CFG } from '../config'
import { enemies, targetMeshes } from '../enemies'

const RESPAWN = 3.5

// 임시 인간형 더미. 눈에 보이는 메시가 곧 히트박스입니다.
// 3단계에서 enemy.glb 모델로 교체할 때도 head/body/legs 히트박스는 그대로 재사용합니다.
function Dummy({ id, x, z }) {
  const group = useRef()
  const head = useRef()
  const body = useRef()
  const legs = useRef()
  const barWrap = useRef()
  const barFill = useRef()
  const mats = useRef([])
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier])
  const s = useRef({
    hp: 100, dead: false, deadAt: 0, flash: 0, yawDead: undefined,
    nextSnap: 0, snapUntil: performance.now() / 1000 + 40,
  })

  useEffect(() => {
    const st = s.current
    enemies.set(id, {
      name: `Bot ${id + 1}`,
      get dead() { return st.dead },
      get hp() { return st.hp },
      takeDamage(dmg) {
        if (st.dead) return { killed: false }
        st.hp = Math.max(0, st.hp - dmg)
        st.flash = 0.1
        if (st.hp === 0) {
          st.dead = true
          st.deadAt = performance.now() / 1000
          return { killed: true }
        }
        return { killed: false }
      },
    })
    const ms = [head.current, body.current, legs.current]
    ms.forEach((m) => targetMeshes.push(m))
    return () => {
      enemies.delete(id)
      ms.forEach((m) => {
        const i = targetMeshes.indexOf(m)
        if (i >= 0) targetMeshes.splice(i, 1)
      })
    }
  }, [id])

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const st = s.current
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000

    // 바닥 높이에 맞추기 (맵 GLB가 늦게 로드되므로 처음 40초간 1초마다 재측정)
    if (now < st.snapUntil && now >= st.nextSnap) {
      st.nextSnap = now + 1
      ray.origin.x = x
      ray.origin.y = ACTIVE_MAP.spawn[1] + 30
      ray.origin.z = z
      const hit = world.castRay(ray, 200, true)
      g.position.y = hit ? ray.origin.y - hit.timeOfImpact : ACTIVE_MAP.spawn[1] - 0.8
    }

    // 플레이어를 바라봄 / 사망 시 뒤로 쓰러짐
    const yaw = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z)
    if (st.dead) {
      if (st.yawDead === undefined) st.yawDead = yaw
      const k = Math.min(1, (now - st.deadAt) / 0.35)
      g.rotation.set(-k * Math.PI * 0.5, st.yawDead, 0)
      if (now - st.deadAt > RESPAWN) {
        st.dead = false
        st.hp = 100
        st.yawDead = undefined
      }
    } else {
      g.rotation.set(0, yaw, 0)
    }

    // 피격 점멸
    st.flash = Math.max(0, st.flash - dt)
    const em = st.flash > 0 ? 1.2 : 0
    for (const m of mats.current) if (m) m.emissiveIntensity = em

    // 체력바
    barWrap.current.visible = !st.dead && st.hp < 100
    barFill.current.scale.x = Math.max(0.001, st.hp / 100)
  })

  const mat = (i, color) => (
    <meshStandardMaterial ref={(m) => { mats.current[i] = m }} color={color} emissive="#ff2020" emissiveIntensity={0} />
  )

  return (
    <group ref={group} position={[x, ACTIVE_MAP.spawn[1] - 0.8, z]} rotation-order="YXZ">
      <mesh ref={legs} position={[0, 0.4, 0]} userData={{ enemyId: id, part: 'legs' }}>
        <boxGeometry args={[0.5, 0.8, 0.3]} />
        {mat(0, '#3a4a5c')}
      </mesh>
      <mesh ref={body} position={[0, 1.11, 0]} userData={{ enemyId: id, part: 'body' }}>
        <boxGeometry args={[0.62, 0.62, 0.3]} />
        {mat(1, '#5f6b3a')}
      </mesh>
      <mesh ref={head} position={[0, 1.57, 0]} userData={{ enemyId: id, part: 'head' }}>
        <sphereGeometry args={[0.17, 14, 10]} />
        {mat(2, '#d2a47c')}
      </mesh>
      <group ref={barWrap} position={[0, 1.98, 0]}>
        <mesh>
          <planeGeometry args={[0.64, 0.08]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        <group ref={barFill} position={[-0.3, 0, 0.002]}>
          <mesh position={[0.3, 0, 0]}>
            <planeGeometry args={[0.6, 0.05]} />
            <meshBasicMaterial color="#ff4d3a" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export default function Enemies() {
  const list = useMemo(
    () => CFG.dummies.map(([dx, dz], i) => ({ id: i, x: ACTIVE_MAP.spawn[0] + dx, z: ACTIVE_MAP.spawn[2] + dz })),
    [],
  )
  return list.map((d) => <Dummy key={d.id} {...d} />)
}
