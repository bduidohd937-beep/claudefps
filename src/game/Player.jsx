import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { CFG, SPAWNS, LEGACY_MOVEMENT } from '../config'
import { live, refs, useGame } from '../store'
import { camBegin, camEnd, emit } from '../fx'
import { play } from '../audio'
import { useKeys } from './useKeys'
import { isNewJump, NATIVE_CONTROLLER } from './MovementRules.js'
import LegacyPlayer from './LegacyPlayer'

// Rapier's native character controller handles stair autostep, ramp collision,
// wall sliding and downhill ground snapping with a FULL capsule sweep.
// Unlike the old per-ray step assist it never teleports through an obstacle.
function KinematicPlayer() {
  const body = useRef()
  const keys = useKeys()
  const camera = useThree((s) => s.camera)
  const { world } = useRapier()
  const ctrl = useMemo(() => {
    const c = world.createCharacterController(NATIVE_CONTROLLER.offset)
    c.enableAutostep(NATIVE_CONTROLLER.stepHeight, NATIVE_CONTROLLER.minimumStepWidth, false)
    c.enableSnapToGround(NATIVE_CONTROLLER.groundSnap)
    c.setMaxSlopeClimbAngle(Math.PI * NATIVE_CONTROLLER.climbSlopeDegrees / 180)
    c.setMinSlopeSlideAngle(Math.PI * NATIVE_CONTROLLER.slideSlopeDegrees / 180)
    return c
  }, [world])
  useEffect(() => () => {
    try { world.removeCharacterController(ctrl) } catch {}
  }, [world, ctrl])

  const tmp = useMemo(() => ({
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    velocity: { x: 0, z: 0 },
    vertical: 0,
    grounded: false,
    jumpHeld: false,
    eye: CFG.eyeStand,
    stepViewOffset: 0,
    nextStep: 0,
    step: 0,
    fallCount: 0,
    lastFallAt: 0,
  }), [])

  useEffect(() => {
    const teleport = (pos) => {
      const rb = body.current
      if (!rb || !Array.isArray(pos) || pos.length !== 3 || !pos.every(Number.isFinite)) return
      const next = { x: pos[0], y: pos[1], z: pos[2] }
      rb.setTranslation(next, true)
      rb.setNextKinematicTranslation(next)
      tmp.velocity.x = 0
      tmp.velocity.z = 0
      tmp.vertical = 0
      tmp.grounded = false
      tmp.stepViewOffset = 0
      camera.position.set(pos[0], pos[1] + CFG.eyeStand, pos[2])
    }
    refs.teleportPlayer = teleport
    refs.resetPlayerMotion = () => {
      tmp.velocity.x = 0
      tmp.velocity.z = 0
      tmp.vertical = 0
      tmp.grounded = false
      tmp.stepViewOffset = 0
      tmp.jumpHeld = false
    }
    return () => {
      refs.teleportPlayer = null
      refs.resetPlayerMotion = null
    }
  }, [camera, tmp])

  useFrame((state, delta) => {
    const rb = body.current
    if (!rb) return
    refs.playerBody = rb
    const dt = Math.min(delta, 0.05)
    if (dt <= 0) return
    const k = keys.current
    const active = live.locked && !live.dead
    const jumpPressed = isNewJump(!!k.Space, tmp.jumpHeld, active)
    tmp.jumpHeld = !!(active && k.Space)
    camBegin(camera, dt)
    const pos = rb.translation()

    if (useGame.getState().spawnEditorOpen) {
      rb.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z })
      camera.position.set(pos.x, pos.y + CFG.eyeStand, pos.z)
      return
    }

    if (pos.y < CFG.killY) {
      const time = performance.now() / 1000
      tmp.fallCount = time - tmp.lastFallAt < 20 ? tmp.fallCount + 1 : 1
      tmp.lastFallAt = time
      if (tmp.fallCount >= 2) useGame.getState().setSpawnEditorOpen(true)
      const spawn = refs.safePlayerSpawn || SPAWNS.player
      refs.teleportPlayer?.(spawn)
      return
    }

    const crouch = active && !!k.KeyC
    const run = active && !crouch && (!!k.ShiftLeft || !!k.ShiftRight)
    const ix = active ? Number(!!k.KeyD) - Number(!!k.KeyA) : 0
    const iz = active ? Number(!!k.KeyW) - Number(!!k.KeyS) : 0
    camera.getWorldDirection(tmp.fwd)
    tmp.fwd.y = 0
    if (tmp.fwd.lengthSq() < 0.001) tmp.fwd.set(0, 0, -1)
    tmp.fwd.normalize()
    tmp.right.crossVectors(tmp.fwd, tmp.up)
    tmp.wish.copy(tmp.fwd).multiplyScalar(iz).addScaledVector(tmp.right, ix)
    const moving = tmp.wish.lengthSq() > 0
    if (moving) tmp.wish.normalize()
    const maxSpeed = crouch ? CFG.crouchSpeed : run ? CFG.runSpeed : CFG.walkSpeed
    const tx = tmp.wish.x * maxSpeed
    const tz = tmp.wish.z * maxSpeed
    const rate = tmp.grounded ? (moving ? CFG.groundAccel : CFG.groundBrake) : CFG.airAccel
    const interp = 1 - Math.exp(-rate * dt)
    tmp.velocity.x += (tx - tmp.velocity.x) * interp
    tmp.velocity.z += (tz - tmp.velocity.z) * interp

    if (tmp.grounded && jumpPressed) {
      tmp.vertical = CFG.jumpVelocity
      tmp.grounded = false
    } else {
      tmp.vertical = Math.max(-45, tmp.vertical + CFG.gravity * dt)
    }

    const collider = rb.collider(0)
    if (!collider) return
    const desired = {
      x: tmp.velocity.x * dt,
      y: tmp.vertical * dt,
      z: tmp.velocity.z * dt,
    }
    // Rapier excludes the player's own collider and resolves obstacles continuously.
    ctrl.computeColliderMovement(collider, desired)
    const move = ctrl.computedMovement()
    const grounded = ctrl.computedGrounded()
    rb.setNextKinematicTranslation({
      x: pos.x + move.x,
      y: pos.y + move.y,
      z: pos.z + move.z,
    })
    if (grounded && tmp.vertical <= 0) tmp.vertical = 0
    tmp.grounded = grounded

    // Keep the eye smooth when the controller automatically steps up.
    if (grounded && move.y > 0.025 && tmp.vertical <= 0 && desired.y <= 0) {
      tmp.stepViewOffset = Math.max(-0.5, tmp.stepViewOffset - move.y)
    }
    const eyeTarget = live.dead ? CFG.eyeDead : crouch ? CFG.eyeCrouch : CFG.eyeStand
    tmp.eye += (eyeTarget - tmp.eye) * (1 - Math.exp(-CFG.eyeLerp * dt))
    tmp.stepViewOffset *= Math.exp(-12 * dt)
    camera.position.set(pos.x + move.x, pos.y + move.y + tmp.eye + tmp.stepViewOffset, pos.z + move.z)

    const speed = Math.hypot(move.x, move.z) / dt
    const elapsed = state.clock.elapsedTime
    if (active && grounded && speed > CFG.brakeThreshold) {
      if (elapsed >= tmp.nextStep) {
        play(tmp.step++ % 2 ? 'footstep_2' : 'footstep_1', {
          volume: crouch ? 0.28 : run ? 0.58 : 0.42,
          rate: run ? 1.08 : crouch ? 0.88 : 1,
        })
        emit('combatNoise', {
          position: [pos.x + move.x, pos.y + move.y, pos.z + move.z],
          radius: crouch ? 2.5 : run ? 12 : 7,
          kind: 'footstep',
        })
        tmp.nextStep = elapsed + (run ? 0.3 : crouch ? 0.56 : 0.43)
      }
    } else {
      tmp.nextStep = elapsed + 0.08
    }

    const movingRatio = THREE.MathUtils.clamp(
      (speed - CFG.brakeThreshold) / (CFG.runSpeed - CFG.brakeThreshold), 0, 1,
    )
    let spread = CFG.baseSpread + Math.pow(movingRatio, 1.5) * CFG.moveSpread
    if (!grounded) spread = CFG.baseSpread + CFG.airSpread
    else if (crouch) spread *= CFG.crouchMul
    const spreadRate = spread > live.spread ? CFG.spreadGrow : CFG.spreadRecover
    live.spread += (spread - live.spread) * (1 - Math.exp(-spreadRate * dt))

    live.speed = speed
    live.grounded = grounded
    live.crouch = crouch
    live.run = run
    live.state = !grounded ? 'air' : crouch ? 'crouch' : speed < CFG.brakeThreshold ? 'stand' : run ? 'run' : 'walk'
    camEnd(camera, elapsed, dt)
  })

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={SPAWNS.player}
      enabledRotations={[false, false, false]}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[CFG.capsuleHalfHeight, CFG.capsuleRadius]} friction={0} restitution={0} />
    </RigidBody>
  )
}

export default function Player() {
  return LEGACY_MOVEMENT ? <LegacyPlayer /> : <KinematicPlayer />
}
