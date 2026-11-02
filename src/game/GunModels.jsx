import { forwardRef } from 'react'
import * as THREE from 'three'

// 임시 1인칭 총기 (박스 조합). 실제 GLB 총기 모델을 받으면 교체합니다.
// 카메라 기준 -z 방향이 총구 방향입니다.
const RIFLE = [
  { p: [0, 0, -0.1], s: [0.06, 0.1, 0.5], c: '#2b3036' }, // 리시버
  { p: [0, 0.01, -0.5], s: [0.028, 0.028, 0.4], c: '#1c2024' }, // 총열
  { p: [0, 0.015, 0.28], s: [0.05, 0.12, 0.22], c: '#3b3f44' }, // 개머리판
  { p: [0, -0.13, -0.07], s: [0.045, 0.17, 0.07], c: '#1f2327', r: [0.18, 0, 0] }, // 탄창
  { p: [0, -0.09, 0.1], s: [0.04, 0.1, 0.055], c: '#26292d', r: [-0.25, 0, 0] }, // 손잡이
  { p: [0, 0.07, -0.05], s: [0.02, 0.03, 0.2], c: '#4a4f55' }, // 조준선
]
const PISTOL = [
  { p: [0, 0.01, -0.04], s: [0.05, 0.06, 0.26], c: '#2b3036' }, // 슬라이드
  { p: [0, -0.07, 0.06], s: [0.045, 0.13, 0.06], c: '#1f2327', r: [0.22, 0, 0] }, // 그립
  { p: [0, -0.03, -0.03], s: [0.03, 0.03, 0.12], c: '#3b3f44' }, // 프레임
]

function Parts({ parts }) {
  return parts.map((q, i) => (
    <mesh key={i} position={q.p} rotation={q.r || [0, 0, 0]} renderOrder={1000 + i} frustumCulled={false}>
      <boxGeometry args={q.s} />
      <meshStandardMaterial color={q.c} roughness={0.6} metalness={0.5} depthTest={false} />
    </mesh>
  ))
}

function Flash({ flash, z }) {
  return (
    <mesh ref={flash} position={[0, 0.01, z]} renderOrder={1100} visible={false} frustumCulled={false}>
      <planeGeometry args={[0.085, 0.085]} />
      <meshBasicMaterial color="#ffd27a" opacity={0.48} transparent depthTest={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

export const Rifle = forwardRef(function Rifle({ flash }, ref) {
  return (
    <group ref={ref}>
      <Parts parts={RIFLE} />
      <Flash flash={flash} z={-0.74} />
    </group>
  )
})

export const Pistol = forwardRef(function Pistol({ flash }, ref) {
  return (
    <group ref={ref}>
      <Parts parts={PISTOL} />
      <Flash flash={flash} z={-0.18} />
    </group>
  )
})

const KNIFE = [
  { p: [0, 0, -0.2], s: [0.012, 0.05, 0.3], c: '#b9c0c7' }, // 칼날
  { p: [0, -0.01, 0.02], s: [0.03, 0.04, 0.12], c: '#2b2e33' }, // 손잡이
]
export const Knife = forwardRef(function Knife(_, ref) {
  return (
    <group ref={ref}>
      <Parts parts={KNIFE} />
    </group>
  )
})


// Asset-free proxy viewmodels: game-ready until appropriately licensed GLB files arrive.
const GUN_LOOK = {
  m4a1: { kind: 'rifle', length: 0.58, barrel: 0.46, color: '#59666b', mag: 0.16 },
  mp5: { kind: 'smg', length: 0.34, barrel: 0.26, color: '#323a44', mag: 0.19 },
  shotgun: { kind: 'pump', length: 0.61, barrel: 0.5, color: '#464b50', mag: 0 },
  awp: { kind: 'sniper', length: 0.77, barrel: 0.75, color: '#384c3d', mag: 0.12 },
  deagle: { kind: 'pistol', length: 0.27, barrel: 0.16, color: '#667078', mag: 0 },
}

export function PrototypeGun({ id, flashRef }) {
  const look = GUN_LOOK[id]
  if (!look) return null
  const pistol = look.kind === 'pistol'
  const r = look.length
  const components = [
    { p: [0, 0, -r * .21], s: [pistol ? .075 : .065, .09, r * .67], c: look.color },
    { p: [0, .015, -r * .76], s: [pistol ? .04 : .027, .033, look.barrel], c: '#262c33' },
    { p: [0, -.11, .06], s: [.045, .15, .07], c: '#232932', r: [-.15, 0, 0] },
    { p: [0, .08, -r * .24], s: [.025, .025, .11], c: '#7e888d' },
  ]
  if (!pistol) components.push({ p: [0, -.02, r * .36], s: [.062, .09, .21], c: '#333a42' })
  if (look.mag) components.push({ p: [0, -.15, -r * .1], s: [.043, look.mag, .055], c: '#242b33' })
  if (look.kind === 'sniper') components.push({ p: [0, .105, -.18], s: [.08, .08, .29], c: '#171c1f' })
  if (look.kind === 'pump') components.push({ p: [0, -.035, -.43], s: [.092, .08, .2], c: '#777161' })
  if (look.kind === 'smg') components.push({ p: [0, .065, -.22], s: [.055, .025, .16], c: '#20252a' })
  return (
    <group>
      <Parts parts={components} />
      <Flash flash={flashRef} z={-(r * .76 + look.barrel * .5)} />
    </group>
  )
}
