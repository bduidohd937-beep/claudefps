import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { CFG, MATCH, SPAWNS, TRAINING, saveSpawn, SPAWN_MANUAL } from '../config'
import { live, refs, useGame } from '../store'
import { enemies } from '../enemies'
import { cam, on } from '../fx'

// 라운드 진행 로직: 라운드 리셋, 구매 타이머, 승패 판정, 킬 보상, 스폰 저장 단축키
export default function Match() {
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()

  const findSafeSpawn = useMemo(() => {
    const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    const notActors = (collider) => {
      const handle = collider.parent()?.handle
      return handle !== refs.playerBody?.handle && handle !== refs.botBody?.handle
    }
    const cast = (origin, direction, length, withNormal = false) => {
      ray.origin.x = origin[0]; ray.origin.y = origin[1]; ray.origin.z = origin[2]
      ray.dir.x = direction[0]; ray.dir.y = direction[1]; ray.dir.z = direction[2]
      return withNormal
        ? world.castRayAndGetNormal(ray, length, true, undefined, undefined, undefined, undefined, notActors)
        : world.castRay(ray, length, true, undefined, undefined, undefined, undefined, notActors)
    }
    const hasClearance = (x, groundY, z) => {
      const bodyY = groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2
        if (cast([x, bodyY, z], [Math.cos(angle), 0, Math.sin(angle)], CFG.capsuleRadius + 0.18)) return false
      }
      const height = CFG.capsuleHalfHeight * 2 + CFG.capsuleRadius * 2
      return !cast([x, groundY + 0.05, z], [0, 1, 0], height + 0.15)
    }

    return (requested, avoid = null, maxRing = 8) => {
      // 요청한 좌표가 허공이면 맵 실제 영역 중앙에서도 바닥을 검색.
      const bounds = refs.mapBounds
      const centers = [requested]
      if (maxRing > 1 && bounds) centers.push([
        bounds.center[0], bounds.max[1] + 2, bounds.center[2],
      ])
      for (const center of centers) {
      for (let ring = 0; ring <= maxRing; ring++) {
        const count = ring === 0 ? 1 : ring * 8
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2
          const x = center[0] + Math.cos(angle) * ring * 2
          const z = center[2] + Math.sin(angle) * ring * 2
          if (avoid && Math.hypot(x - avoid[0], z - avoid[2]) < CFG.spawnMinDistance) continue
          const top = Math.max(center[1] + 10, CFG.spawnProbeTop, (bounds?.max[1] ?? 0) + 10)
          const depth = Math.max(CFG.spawnProbeDepth, top - (bounds?.min[1] ?? -20) + 20)
          const floor = cast([x, top, z], [0, -1, 0], depth, true)
          if (!floor || floor.normal.y < 0.72) continue
          const groundY = top - floor.timeOfImpact
          if (hasClearance(x, groundY, z)) {
            return [x, groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05, z]
          }
        }
      }
      }
      console.warn('[spawn] 지면을 찾지 못했습니다. 수동 스폰 편집기로 전환합니다.', requested)
      return null
    }
  }, [world, rapier])

  useEffect(() => {
    // 라운드 시작 시 플레이어/봇 위치 초기화 + 서로 마주보게 설정
    refs.snapSpawn = (pos) => findSafeSpawn(pos, null, 1)
    refs.resetRound = () => {
      const bounds = refs.mapBounds
      const p = SPAWN_MANUAL.player
        ? [...SPAWNS.player] : findSafeSpawn(SPAWNS.player)
      const bp = SPAWN_MANUAL.bot
        ? [...SPAWNS.bot] : findSafeSpawn(SPAWNS.bot, p)
      const playerSpawn = p || (bounds
        ? [bounds.center[0], bounds.max[1] + 4, bounds.center[2]]
        : [...SPAWNS.player])
      const botSpawn = bp || [...SPAWNS.bot]
      if (!p) useGame.getState().setSpawnEditorOpen(true)
      refs.safePlayerSpawn = p
      refs.safeBotSpawn = bp
      if (p && p.some((value, i) => Math.abs(value - SPAWNS.player[i]) > 0.1)) {
        console.info('[spawn] 플레이어 스폰 자동 보정', SPAWNS.player, '→', p.map((v) => Number(v.toFixed(2))))
      }
      if (bp && bp.some((value, i) => Math.abs(value - SPAWNS.bot[i]) > 0.1)) {
        console.info('[spawn] AI 스폰 자동 보정', SPAWNS.bot, '→', bp.map((v) => Number(v.toFixed(2))))
      }
      const rb = refs.playerBody
      if (rb) {
        rb.setTranslation({ x: playerSpawn[0], y: playerSpawn[1], z: playerSpawn[2] }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
      camera.position.set(playerSpawn[0], playerSpawn[1] + 0.75, playerSpawn[2])
      camera.lookAt(botSpawn[0], playerSpawn[1] + 0.75, botSpawn[2])
      cam.recoil = 0; cam.shake = 0; cam.flinchP = 0; cam.flinchY = 0
      live.fireSpread = 0
      refs.resetBot?.(botSpawn)
    }

    // 개발용: F4 = 지금 위치를 플레이어 스폰으로 저장 / F3 = 봇 스폰으로 저장 (맵별로 기억됨)
    const kd = (e) => {
      const rb = refs.playerBody
      if (!rb || (e.code !== 'F3' && e.code !== 'F4')) return
      e.preventDefault()
      const t = rb.translation()
      const pos = [Number(t.x.toFixed(2)), Number((t.y + 0.1).toFixed(2)), Number(t.z.toFixed(2))]
      saveSpawn(e.code === 'F4' ? 'player' : 'bot', pos)
      console.log(`[spawn] ${e.code === 'F4' ? 'player' : 'bot'} =`, JSON.stringify(pos))
    }
    window.addEventListener('keydown', kd)

    // 킬 보상 (+$300)
    const off = on('kill', (k) => {
      if (k.byPlayer && !TRAINING) {
        useGame.setState((s) => ({ money: Math.min(MATCH.maxMoney, s.money + MATCH.killReward) }))
      }
    })
    return () => {
      window.removeEventListener('keydown', kd)
      off()
      refs.resetRound = null
      refs.snapSpawn = null
    }
  }, [camera, findSafeSpawn])

  useFrame((_, dt) => {
    if (TRAINING) return
    const st = useGame.getState()
    if (st.spawnEditorOpen) return
    const now = performance.now() / 1000

    if (st.phase === 'buy' && now >= live.buyEnd) {
      st.endBuy() // 포인터는 풀린 상태 → 일시정지 화면에서 클릭하면 시작
    } else if (st.phase === 'live') {
      if (live.locked) live.roundTimeLeft -= Math.min(dt, 0.1)
      if (st.hp <= 0) st.endRound('ai')
      else if (enemies.get('bot')?.dead) st.endRound('player')
      else if (live.roundTimeLeft <= 0) st.endRound('ai') // 시간 초과
    }
  })

  return null
}
