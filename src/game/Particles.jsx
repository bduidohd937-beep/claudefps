import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// InstancedMesh 하나로 모든 파티클(혈흔/파편/먼지)을 그립니다. 드로우콜 1회.
const MAX = 320
const GRAVITY = -14
const P = {
  x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX),
  vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX),
  age: new Float32Array(MAX).fill(1), life: new Float32Array(MAX).fill(1),
  size: new Float32Array(MAX), dead: new Uint8Array(MAX).fill(1),
}
let cursor = 0
let active = false
let mesh = null

const KINDS = {
  blood: { count: 14, speed: 4, up: 1.5, life: 0.55, size: 0.05, colors: ['#a30b0b', '#d11515', '#7a0606'] },
  headBlood: { count: 26, speed: 5.5, up: 2, life: 0.75, size: 0.055, colors: ['#ff2b2b', '#d11515', '#a30b0b', '#ffd0d0'] },
  dust: { count: 5, speed: 2.5, up: 0.6, life: 0.4, size: 0.035, colors: ['#9aa3ab', '#6e757b'] },
}

const tmpC = new THREE.Color()
const dummy = new THREE.Object3D()

// (px,py,pz): 발생 위치, (dx,dy,dz): 튀는 기본 방향(정규화)
export function burst(px, py, pz, dx, dy, dz, kind) {
  const k = KINDS[kind]
  if (!k || !mesh) return
  for (let n = 0; n < k.count; n++) {
    const i = cursor
    cursor = (cursor + 1) % MAX
    // 무작위 단위벡터
    const u = Math.random() * 2 - 1
    const a = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const rx = s * Math.cos(a), ry = u, rz = s * Math.sin(a)
    P.x[i] = px; P.y[i] = py; P.z[i] = pz
    P.vx[i] = dx * k.speed * 0.7 + rx * k.speed * 0.6
    P.vy[i] = dy * k.speed * 0.7 + ry * k.speed * 0.6 + k.up
    P.vz[i] = dz * k.speed * 0.7 + rz * k.speed * 0.6
    P.age[i] = 0
    P.life[i] = k.life * (0.7 + Math.random() * 0.6)
    P.size[i] = k.size * (0.6 + Math.random() * 0.8)
    P.dead[i] = 0
    tmpC.set(k.colors[(Math.random() * k.colors.length) | 0])
    mesh.setColorAt(i, tmpC)
  }
  mesh.instanceColor.needsUpdate = true
  active = true
}

export default function Particles() {
  const ref = useRef()

  useEffect(() => {
    mesh = ref.current
    tmpC.set('#ffffff')
    for (let i = 0; i < MAX; i++) {
      dummy.scale.setScalar(0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, tmpC)
    }
    mesh.instanceMatrix.needsUpdate = true
    return () => { mesh = null }
  }, [])

  useFrame((_, delta) => {
    if (!active || !mesh) return
    const dt = Math.min(delta, 0.05)
    let alive = false
    for (let i = 0; i < MAX; i++) {
      if (P.dead[i]) continue
      P.age[i] += dt
      if (P.age[i] >= P.life[i]) {
        P.dead[i] = 1
        dummy.scale.setScalar(0)
        dummy.position.set(0, -999, 0)
      } else {
        alive = true
        P.vy[i] += GRAVITY * dt
        P.x[i] += P.vx[i] * dt
        P.y[i] += P.vy[i] * dt
        P.z[i] += P.vz[i] * dt
        dummy.position.set(P.x[i], P.y[i], P.z[i])
        dummy.scale.setScalar(P.size[i] * (1 - P.age[i] / P.life[i]))
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (!alive) active = false
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}
