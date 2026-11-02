import { Component, Suspense, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { live } from '../store'
import { Rifle, Pistol, Knife } from './GunModels'

// 총기 GLB 설정. 방향/크기가 어색하면 게임 중 F2 튜너로 맞춘 뒤 값을 여기에 반영하세요.
// clips: 게임 동작 → GLB 안의 애니메이션 이름 끝부분 (대소문자 무시)
export const VM = {
  rifle: {
    url: '/models/weapons/aks74u.glb',
    pos: [0.24, -0.24, -0.73], scale: 1, rotY: 0,
    displaySize: 0.9,
    muzzle: [0, 0, -0.65],
    clips: { idle: 'Fire_single', fire: 'Fire_single', reload: 'Reload_t', reloadEmpty: 'Reload_f', draw: 'Put_in', run: 'Fire_sprite' },
    fireSpeed: 1.8,
  },
  pistol: {
    url: '/models/weapons/pistol.glb',
    pos: [0.23, -0.26, -0.66], scale: 1, rotY: 0,
    displaySize: 0.58,
    muzzle: [0, 0, -0.48],
    clips: { idle: 'Shot', fire: 'Shot', reload: 'Reloat_t', reloadEmpty: 'Reloat_f', run: 'Run', walk: 'Walk' },
    fireSpeed: 1.3,
  },
  knife: {
    url: '/models/weapons/knife.glb',
    pos: [0.28, -0.25, -0.66], scale: 1, rotY: 0,
    displaySize: 0.65, // GLB 단위와 무관하게 크기 정규화
    clips: { idle: 'anims' },
    idleTime: 0,
  },
}
export const FALLBACK_BASE = { rifle: [0.2, -0.19, -0.42], pistol: [0.2, -0.19, -0.42], knife: [0.25, -0.2, -0.45] }

Object.values(VM).forEach((v) => useGLTF.preload(v.url))

// 광택(metalness)이 높은 재질은 환경맵이 없으면 새까맣게 보여서 낮춥니다.
function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.frustumCulled = false
    const fix = (m) => {
      const c = m.clone()
      if ('metalness' in c) c.metalness = Math.min(c.metalness ?? 0, 0.3)
      if ('roughness' in c) c.roughness = Math.max(c.roughness ?? 0.6, 0.5)
      return c
    }
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material)
  })
}

// 애니메이션 컨트롤러: idle(첫 프레임 고정) / 일회성(장전·발사·교체) / 반복(걷기·달리기)
function makeApi(root, animations, def) {
  const mixer = new THREE.AnimationMixer(root)
  const actions = {}
  for (const [key, name] of Object.entries(def.clips)) {
    const clip = animations.find((c) => c.name.toLowerCase().endsWith(name.toLowerCase()))
    if (clip) actions[key] = mixer.clipAction(clip)
  }
  let cur = null
  let oneShot = false
  let loco = null

  const enter = (key, { loop = false, timeScale = 1, fade = 0.08, restart = false } = {}) => {
    const a = actions[key]
    if (!a) return false
    if (cur === a && !restart) return true
    const prev = cur
    a.reset()
    a.enabled = true
    a.setEffectiveWeight(1)
    a.setEffectiveTimeScale(timeScale)
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    a.clampWhenFinished = !loop
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false)
    else a.fadeIn(Math.min(fade, 0.03))
    a.play()
    cur = a
    oneShot = !loop
    return true
  }

  const idle = () => {
    const a = actions.idle
    if (!a) return
    if (cur !== a) enter('idle', { fade: 0.1 })
    a.time = def.idleTime || 0
    a.paused = true
    oneShot = false
  }

  const back = () => {
    if (loco && actions[loco]) enter(loco, { loop: true, fade: 0.15 })
    else idle()
  }

  mixer.addEventListener('finished', (e) => {
    if (e.action === cur) { oneShot = false; back() }
  })

  return {
    hasClip: (k) => !!actions[k],
    duration: (k) => actions[k]?.getClip().duration ?? 0,
    idle,
    // 일회성 클립 재생. 실제 재생 시간(초)을 반환
    play(key, opts = {}) {
      if (!enter(key, { loop: false, ...opts })) return 0
      return actions[key].getClip().duration / (opts.timeScale || 1)
    },
    setLoco(key) {
      if (key === loco) return
      loco = key
      if (!oneShot) back()
    },
    update: (dt) => mixer.update(dt),
  }
}

function GlbViewModel({ id, apiRef, flashRef }) {
  const def = VM[id]
  const { scene, animations } = useGLTF(def.url)
  const built = useMemo(() => {
    const root = cloneSkinned(scene)
    fixMaterials(root)
    // GLB마다 다른 원점/단위(cm, m)를 정규화해 카메라를 덮거나 사라지는 현상 방지.
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    const center = bounds.getCenter(new THREE.Vector3())
    const dimensions = bounds.getSize(new THREE.Vector3())
    const longest = Math.max(dimensions.x, dimensions.y, dimensions.z)
    const modelScale = Number.isFinite(longest) && longest > 0.0001
      ? (def.displaySize || 0.65) / longest : 1
    return { root, api: makeApi(root, animations, def), center, modelScale }
  }, [scene, animations, def])

  useEffect(() => {
    apiRef.current = built.api
    built.api.idle()
    return () => { apiRef.current = null }
  }, [built, apiRef])

  return (
    <group>
      <group scale={built.modelScale}>
        <group position={[-built.center.x, -built.center.y, -built.center.z]}>
          <primitive object={built.root} />
        </group>
      </group>
      {def.muzzle && (
        <mesh ref={flashRef} position={def.muzzle} visible={false} frustumCulled={false}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial color="#ffd27a" transparent depthTest={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  )
}

function FallbackGun({ id, flashRef }) {
  useEffect(() => {
    live.vmFallback[id] = true
    return () => { live.vmFallback[id] = false }
  }, [id])
  if (id === 'rifle') return <Rifle flash={flashRef} />
  if (id === 'pistol') return <Pistol flash={flashRef} />
  return <Knife />
}

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.warn(`[claudefps] 총기 모델 로드 실패 → 임시 모델 사용 (${this.props.id})`, err) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function VMSlot({ id, apiRef, flashRef }) {
  return (
    <Boundary id={id} fallback={<FallbackGun id={id} flashRef={flashRef} />}>
      <Suspense fallback={null}>
        <GlbViewModel id={id} apiRef={apiRef} flashRef={flashRef} />
      </Suspense>
    </Boundary>
  )
}

// 1인칭 총기를 별도 씬/카메라로 그립니다: 월드를 먼저 그리고 깊이 버퍼를 지운 뒤 총기를 그려서
// 벽에 파묻히지 않고, 메인 FOV와 무관하게 총기가 일정한 크기로 보입니다.
// (positive priority 콜백이 있으면 R3F 자동 렌더가 꺼지므로 여기서 직접 렌더합니다)
export function VMRenderer({ vmScene, vmCamera }) {
  useFrame(({ gl, scene, camera, size }) => {
    const aspect = size.width / size.height
    if (vmCamera.aspect !== aspect) {
      vmCamera.aspect = aspect
      vmCamera.updateProjectionMatrix()
    }
    gl.autoClear = false
    gl.clear()
    gl.render(scene, camera)
    gl.clearDepth()
    gl.render(vmScene, vmCamera)
  }, 1)
  return null
}
