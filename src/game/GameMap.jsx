import { Component, Suspense, useEffect, useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import { ACTIVE_MAP } from '../config'
import { refs } from '../store'
import * as THREE from 'three'

// 내장 테스트 아레나: GLB 없이도 이동/탄퍼짐 테스트 가능
const CRATES = [
  [6, 0.75, -4, 1.5, 1.5, 1.5],
  [-7, 1, 3, 2, 2, 2],
  [0, 0.5, -10, 6, 1, 1],
  [10, 1.5, 8, 1, 3, 6],
  [-12, 0.5, -9, 3, 1, 3],
  [3, 0.25, 4, 2, 0.5, 4], // 점프 테스트용 낮은 단
]

function Arena() {
  useEffect(() => {
    refs.mapBounds = { min: [-30, 0, -30], max: [30, 6, 30], center: [0, 3, 0] }
    return () => { refs.mapBounds = null }
  }, [])
  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[60, 1, 60]} />
        <meshStandardMaterial color="#59646d" />
      </mesh>
      {[[0, 3, -30, 60, 6, 1], [0, 3, 30, 60, 6, 1], [-30, 3, 0, 1, 6, 60], [30, 3, 0, 1, 6, 60]].map((w, i) => (
        <mesh key={i} position={[w[0], w[1], w[2]]}>
          <boxGeometry args={[w[3], w[4], w[5]]} />
          <meshStandardMaterial color="#3e474e" />
        </mesh>
      ))}
      {CRATES.map((c, i) => (
        <mesh key={i} position={[c[0], c[1], c[2]]}>
          <boxGeometry args={[c[3], c[4], c[5]]} />
          <meshStandardMaterial color={i % 2 ? '#b8743a' : '#8a929a'} />
        </mesh>
      ))}
    </RigidBody>
  )
}

function GlbMap({ url, scale }) {
  const { scene } = useGLTF(url) // Draco / Meshopt 압축 GLB 자동 지원
  useMemo(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false
        o.receiveShadow = false
        o.frustumCulled = true
      }
    })
  }, [scene])
  // 사용자 스폰 편집기에서 실제 GLB 맵 범위를 볼 수 있도록 공유.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    if (box.isEmpty()) return
    const min = box.min.clone().multiplyScalar(scale).toArray()
    const max = box.max.clone().multiplyScalar(scale).toArray()
    if (![...min, ...max].every(Number.isFinite)) return
    refs.mapBounds = {
      min, max,
      center: min.map((v, i) => (v + max[i]) / 2),
    }
    console.info('[map] GLB bounds', refs.mapBounds)
    return () => { refs.mapBounds = null }
  }, [scene, scale])

  // 정적 맵: 트라이메시 콜라이더 (큰 맵은 초기 로딩이 조금 걸릴 수 있음)
  return (
    <RigidBody type="fixed" colliders="trimesh">
      <group scale={scale}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  )
}

class MapBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) {
    console.warn(`[claudefps] 맵 로드 실패 → 내장 아레나로 대체합니다. 경로: ${ACTIVE_MAP.url}`, err)
  }
  render() { return this.state.failed ? <Arena /> : this.props.children }
}

export default function GameMap() {
  if (!ACTIVE_MAP.url) return <Arena />
  return (
    <MapBoundary>
      <Suspense fallback={<Arena />}>
        <GlbMap url={ACTIVE_MAP.url} scale={ACTIVE_MAP.scale} />
      </Suspense>
    </MapBoundary>
  )
}
