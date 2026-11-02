import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { CFG, SPAWNS } from '../config'
import { live, refs, useGame } from '../store'
import { camBegin, camEnd, emit } from '../fx'
import { play } from '../audio'
import { useKeys } from './useKeys'

export default function Player() {
  const body = useRef()
  const keys = useKeys()
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()

  const tmp = useMemo(() => ({
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    groundRay: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    ledgeRay: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }),
    nextMantle: 0,
    eye: CFG.eyeStand,
    vel: { x: 0, y: 0, z: 0 },
    nextStep: 0,
    step: 0,
    editorFrozen: false,
    fallCount: 0,
    lastFallAt: 0,
  }), [rapier])

  useEffect(() => {
    refs.teleportPlayer = (pos) => {
      if (!body.current || !Array.isArray(pos) || pos.length !== 3 || !pos.every(Number.isFinite)) return
      body.current.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true)
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      camera.position.set(pos[0], pos[1] + CFG.eyeStand, pos[2])
    }
    return () => { refs.teleportPlayer = null }
  }, [camera])

  useFrame((state, delta) => {
    const rb = body.current
    if (!rb) return
    refs.playerBody = rb
    const dt = Math.min(delta, 0.05)
    const k = keys.current
    const active = live.locked && !live.dead

    camBegin(camera, dt)

    const pos = rb.translation()
    const vel = rb.linvel()

    // 스폰 좌표를 조정하는 동안에는 중력/이동을 멈춰 공중에서도 구조 가능.
    const editing = useGame.getState().spawnEditorOpen
    if (editing) {
      if (!tmp.editorFrozen) {
        rb.setGravityScale(0, true)
        tmp.editorFrozen = true
      }
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      camera.position.set(pos.x, pos.y + CFG.eyeStand, pos.z)
      return
    }
    if (tmp.editorFrozen) {
      rb.setGravityScale(1, true)
      tmp.editorFrozen = false
    }

    if (pos.y < CFG.killY) {
      const elapsed = performance.now() / 1000
      tmp.fallCount = elapsed - tmp.lastFallAt < 20 ? tmp.fallCount + 1 : 1
      tmp.lastFallAt = elapsed
      // 같은 위치에서 두 번 떨어지면 자동 편집기로 구조한다.
      if (tmp.fallCount >= 2) useGame.getState().setSpawnEditorOpen(true)
      const b = refs.mapBounds
      const s = tmp.fallCount >= 2 && b
        ? [b.center[0], b.max[1] + 4, b.center[2]]
        : refs.safePlayerSpawn || SPAWNS.player
      rb.setTranslation({ x: s[0], y: s[1], z: s[2] }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    const g = tmp.groundRay
    g.origin.x = pos.x; g.origin.y = pos.y; g.origin.z = pos.z
    const grounded = world.castRay(g, CFG.groundRayLen, true, undefined, undefined, undefined, rb) !== null && vel.y < 0.5

    const crouch = active && !!k.KeyC
    const run = active && !crouch && (!!k.ShiftLeft || !!k.ShiftRight)
    const ix = active ? (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) : 0
    const iz = active ? (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) : 0

    camera.getWorldDirection(tmp.fwd)
    tmp.fwd.y = 0
    tmp.fwd.normalize()
    tmp.right.crossVectors(tmp.fwd, tmp.up)
    tmp.wish.set(0, 0, 0).addScaledVector(tmp.fwd, iz).addScaledVector(tmp.right, ix)
    const hasInput = tmp.wish.lengthSq() > 0
    if (hasInput) tmp.wish.normalize()

    // Space + forward: climb an actual low ledge, never teleport through a tall wall.
    // All probes consult the current Rapier map collision, not the GLB visual bounds.
    if (active && grounded && k.Space && iz > 0 && performance.now() / 1000 >= tmp.nextMantle) {
      const fwdX = tmp.fwd.x, fwdZ = tmp.fwd.z
      const ray = tmp.ledgeRay
      const notSelf = (c) => c.parent()?.handle !== rb.handle
      const cast = (x, y, z, dx, dy, dz, length) => {
        ray.origin.x = x; ray.origin.y = y; ray.origin.z = z
        ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz
        return world.castRay(ray, length, true, undefined, undefined, undefined, undefined, notSelf)
      }
      const lowWall = cast(pos.x, pos.y - 0.34, pos.z, fwdX, 0, fwdZ, 0.85)
      const topOpen = !cast(pos.x, pos.y + 0.62, pos.z, fwdX, 0, fwdZ, 1.15)
      if (lowWall && topOpen) {
        const x = pos.x + fwdX * 1.04
        const z = pos.z + fwdZ * 1.04
        ray.origin.x = x; ray.origin.y = pos.y + 1.45; ray.origin.z = z
        ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0
        const floor = world.castRayAndGetNormal(ray, 2.5, true, undefined, undefined, undefined, undefined, notSelf)
        if (floor && floor.normal.y >= 0.72) {
          const groundY = pos.y + 1.45 - floor.timeOfImpact
          const centerY = groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
          const climb = centerY - pos.y
          const headroom = !cast(x, groundY + 0.07, z, 0, 1, 0, CFG.capsuleHalfHeight * 2 + CFG.capsuleRadius * 2 + 0.22)
          if (climb >= 0.23 && climb <= 0.88 && headroom) {
            rb.setTranslation({ x, y: centerY, z }, true)
            rb.setLinvel({ x: fwdX * CFG.walkSpeed * 0.45, y: 0, z: fwdZ * CFG.walkSpeed * 0.45 }, true)
            camera.position.set(x, centerY + tmp.eye, z)
            tmp.nextMantle = performance.now() / 1000 + 0.7
            live.grounded = true
            return
          }
        }
      }
    }

    const maxSpeed = crouch ? CFG.crouchSpeed : run ? CFG.runSpeed : CFG.walkSpeed
    const tx = tmp.wish.x * maxSpeed
    const tz = tmp.wish.z * maxSpeed

    const rate = grounded ? (hasInput ? CFG.groundAccel : CFG.groundBrake) : CFG.airAccel
    const f = 1 - Math.exp(-rate * dt)
    const vx = vel.x + (tx - vel.x) * f
    const vz = vel.z + (tz - vel.z) * f
    let vy = vel.y
    if (grounded && active && k.Space) vy = CFG.jumpVelocity

    tmp.vel.x = vx; tmp.vel.y = vy; tmp.vel.z = vz
    rb.setLinvel(tmp.vel, true)

    const eyeTarget = live.dead ? CFG.eyeDead : crouch ? CFG.eyeCrouch : CFG.eyeStand
    tmp.eye += (eyeTarget - tmp.eye) * (1 - Math.exp(-CFG.eyeLerp * dt))
    camera.position.set(pos.x, pos.y + tmp.eye, pos.z)

    // 이동 탄 퍼짐 (클래식 브레이킹)
    const speed = Math.hypot(vx, vz)
    const elapsed = state.clock.elapsedTime
    if (active && grounded && speed > CFG.brakeThreshold) {
      if (elapsed >= tmp.nextStep) {
        play(tmp.step++ % 2 ? 'footstep_2' : 'footstep_1', {
          volume: crouch ? 0.28 : run ? 0.58 : 0.42,
          rate: run ? 1.08 : crouch ? 0.88 : 1,
        })
        // Sound indicates a rough location; the bot must investigate, not know an exact target.
        emit('combatNoise', {
          position: [pos.x, pos.y, pos.z],
          radius: crouch ? 2.5 : run ? 12 : 7,
          kind: 'footstep',
        })
        tmp.nextStep = elapsed + (run ? 0.3 : crouch ? 0.56 : 0.43)
      }
    } else {
      tmp.nextStep = elapsed + 0.08
    }
    const moving = THREE.MathUtils.clamp(
      (speed - CFG.brakeThreshold) / (CFG.runSpeed - CFG.brakeThreshold), 0, 1,
    )
    let target = CFG.baseSpread + Math.pow(moving, 1.5) * CFG.moveSpread
    if (!grounded) target = CFG.baseSpread + CFG.airSpread
    else if (crouch) target *= CFG.crouchMul
    const sRate = target > live.spread ? CFG.spreadGrow : CFG.spreadRecover
    live.spread += (target - live.spread) * (1 - Math.exp(-sRate * dt))

    live.speed = speed
    live.grounded = grounded
    live.crouch = crouch
    live.run = run
    live.state = !grounded ? 'air' : crouch ? 'crouch' : speed < CFG.brakeThreshold ? 'stand' : run ? 'run' : 'walk'

    camEnd(camera, state.clock.elapsedTime, dt)
  })

  return (
    <RigidBody
      ref={body}
      position={SPAWNS.player}
      colliders={false}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      canSleep={false}
      ccd
      type="dynamic"
    >
      <CapsuleCollider args={[CFG.capsuleHalfHeight, CFG.capsuleRadius]} friction={0} restitution={0} />
    </RigidBody>
  )
}
