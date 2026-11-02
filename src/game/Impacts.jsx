import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// 탄착점 표시용 오브젝트 풀 (런타임 중 메시 생성/삭제 없음)
const POOL = 48
const LIFE = 4 // 초
const slots = []
let cursor = 0

export function spawnImpact(x, y, z) {
  const s = slots[cursor]
  if (!s) return
  cursor = (cursor + 1) % POOL
  s.mesh.position.set(x, y, z)
  s.mesh.visible = true
  s.age = 0
}

export default function Impacts() {
  const group = useRef()
  const init = (mesh, i) => {
    if (mesh) slots[i] = { mesh, age: LIFE }
  }

  useFrame((_, dt) => {
    for (let i = 0; i < POOL; i++) {
      const s = slots[i]
      if (!s || !s.mesh.visible) continue
      s.age += dt
      if (s.age >= LIFE) { s.mesh.visible = false; continue }
      const k = 1 - Math.max(0, s.age - LIFE * 0.6) / (LIFE * 0.4)
      s.mesh.scale.setScalar(Math.max(k, 0.01))
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(m) => init(m, i)} visible={false}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshBasicMaterial color="#ff7a1a" />
        </mesh>
      ))}
    </group>
  )
}
