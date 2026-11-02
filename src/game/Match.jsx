import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { CFG, MATCH, SPAWNS, TRAINING, AUTO_ENTER, START_LEVEL, DYNAMIC_SPAWNS, saveSpawn, SPAWN_MANUAL } from '../config'
import { live, refs, useGame } from '../store'
import { enemies } from '../enemies'
import { cam, on } from '../fx'

// 라운드 진행 로직: 라운드 리셋, 구매 타이머, 승패 판정, 킬 보상, 스폰 저장 단축키
export default function Match() {
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()
  const lastSpawns = useRef({ player: null, bot: null })

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

    const resolve = (requested, avoid = null, maxRing = 8, minimumDistance = CFG.spawnMinDistance) => {
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
          if (avoid && Math.hypot(x - avoid[0], z - avoid[2]) < minimumDistance) continue
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

    // F6 수동 저장도 바닥·높이·충돌을 재검증. 실패하면 공중 배치를 강행하지 않는다.
    resolve.at = (point, avoid = null, minimumDistance = CFG.spawnMinDistance) => {
      if (!point || !point.every(Number.isFinite)) return null
      if (avoid && Math.hypot(point[0] - avoid[0], point[2] - avoid[2]) < minimumDistance) return null
      const top = point[1] + 2
      const floor = cast([point[0], top, point[2]], [0, -1, 0], 4.5, true)
      if (!floor || floor.normal.y < 0.72) return null
      const floorY = top - floor.timeOfImpact
      const y = floorY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
      if (Math.abs(y - point[1]) > 1.5 || !hasClearance(point[0], floorY, point[2])) return null
      return [point[0], y, point[2]]
    }

    // 기존에 찾은 안전 스폰 주변의 같은 높이 지면만 후보로 삼는다.
    // 넓은 맵 전체를 무작위로 찍으면 지붕/허공/단절된 구역에 나타날 수 있어 금지.
    resolve.randomNear = (base, avoid, previous, radius, minimumDistance) => {
      if (!base) return null
      const valid = []
      for (let i = 0; i < 64; i++) {
        const angle = Math.random() * Math.PI * 2
        const distance = radius * (0.35 + Math.random() * 0.65)
        const x = base[0] + Math.cos(angle) * distance
        const z = base[2] + Math.sin(angle) * distance
        if (avoid && Math.hypot(x - avoid[0], z - avoid[2]) < minimumDistance) continue
        if (previous && Math.hypot(x - previous[0], z - previous[2]) < Math.min(2.5, radius * 0.4)) continue
        const top = base[1] + 2.5
        const hit = cast([x, top, z], [0, -1, 0], 6, true)
        if (!hit || hit.normal.y < 0.72) continue
        const floorY = top - hit.timeOfImpact
        const centerY = floorY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
        // 다른 층이나 지붕은 다른 네비게이션 영역일 수 있으므로 제외.
        if (Math.abs(centerY - base[1]) > 2.0) continue
        if (!hasClearance(x, floorY, z)) continue
        // Prefer a different part of the playable floor, without instant line-of-sight spawn fights.
        const recentDistance = previous ? Math.hypot(x - previous[0], z - previous[2]) : radius
        const opponentDistance = avoid ? Math.hypot(x - avoid[0], z - avoid[2]) : minimumDistance * 2
        const from = [x, centerY + 0.5, z]
        const dx = avoid ? avoid[0] - x : 0, dz = avoid ? avoid[2] - z : 0
        const distanceToOpponent = Math.hypot(dx, dz)
        const blocked = avoid && distanceToOpponent > 0.1 && cast(from,
          [dx / distanceToOpponent, 0, dz / distanceToOpponent], distanceToOpponent - 0.3)
        const exposed = !!avoid && opponentDistance < 15 && !blocked
        const score = Math.min(recentDistance, radius) * 0.7 +
          Math.min(opponentDistance, 25) * 0.3 + Math.random() * 2 - (exposed ? 14 : 0)
        valid.push({ pos: [x, centerY, z], score })
      }
      valid.sort((a, b) => b.score - a.score)
      return valid.length ? valid[Math.floor(Math.random() * Math.min(valid.length, 5))].pos : null
    }
    return resolve
  }, [world, rapier])

  useEffect(() => {
    // 라운드 시작 시 플레이어/봇 위치 초기화 + 서로 마주보게 설정
    refs.snapSpawn = (pos) => findSafeSpawn(pos, null, 1)
    refs.resetRound = () => {
      const bounds = refs.mapBounds
      const span = bounds
        ? Math.min(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2])
        : 20
      // Larger arenas can explore different sectors; small maps keep conservative ranges.
      const radius = Math.min(22, Math.max(1.5, span * 0.29))
      const minimumDistance = Math.min(CFG.spawnMinDistance, Math.max(2.5, span * 0.33))
      const basePlayer = SPAWN_MANUAL.player
        ? findSafeSpawn.at(SPAWNS.player) : findSafeSpawn(SPAWNS.player)
      const baseBot = SPAWN_MANUAL.bot
        ? findSafeSpawn.at(SPAWNS.bot, basePlayer, minimumDistance)
        : findSafeSpawn(SPAWNS.bot, basePlayer, 8, minimumDistance)
      let p = basePlayer
      let bp = baseBot

      // 고정 스폰은 언제든 로비의 옵션에서 선택할 수 있음.
      // F6 수동 스폰은 매번 새로 검색할 중심점으로 유지됨.
      if (DYNAMIC_SPAWNS && !TRAINING && p && bp) {
        const shuffledPlayer = findSafeSpawn.randomNear(
          p, bp, lastSpawns.current.player, radius, minimumDistance,
        )
        if (shuffledPlayer) p = shuffledPlayer
        const shuffledBot = findSafeSpawn.randomNear(
          bp, p, lastSpawns.current.bot, radius, minimumDistance,
        )
        if (shuffledBot) bp = shuffledBot
      }
      const playerSpawn = p || (bounds
        ? [bounds.center[0], bounds.max[1] + 4, bounds.center[2]]
        : [...SPAWNS.player])
      const botSpawn = bp || [...SPAWNS.bot]
      if (p && bp) {
        lastSpawns.current = { player: [...p], bot: [...bp] }
      }
      if (DYNAMIC_SPAWNS && p && bp && !TRAINING) {
        console.info('[spawn] 라운드별 랜덤 스폰', {
          player: p.map((x) => Number(x.toFixed(2))),
          bot: bp.map((x) => Number(x.toFixed(2))),
        })
      }
      if (!p || (!TRAINING && !bp)) useGame.getState().setSpawnEditorOpen(true)
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
      // 데스매치식 라운드 시작: 상대의 정확한 좌표를 시점으로 알려주지 않는다.
      const targetX = bounds?.center[0] ?? 0
      const targetZ = bounds?.center[2] ?? 0
      const dx = targetX - playerSpawn[0]
      const dz = targetZ - playerSpawn[2]
      if (Math.hypot(dx, dz) > 0.5) {
        camera.lookAt(targetX, playerSpawn[1] + 0.75, targetZ)
      } else {
        camera.lookAt(playerSpawn[0], playerSpawn[1] + 0.75, playerSpawn[2] - 5)
      }
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

    // Kill reward is identical for either side; timeout awards no kill bonus.
    const off = on('kill', (k) => {
      if (TRAINING || useGame.getState().phase !== 'live') return
      if (k.byPlayer) {
        useGame.setState((s) => ({ money: Math.min(MATCH.maxMoney, s.money + MATCH.killReward) }))
      } else {
        useGame.setState((s) => ({ botEconomy: {
          ...s.botEconomy,
          money: Math.min(MATCH.maxMoney, s.botEconomy.money + MATCH.killReward),
        } }))
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
    const st = useGame.getState()
    // Main lobby is a separate screen. Launch only after the map and both actors are mounted.
    if (st.phase === 'menu') {
      if (AUTO_ENTER && refs.resetRound && refs.mapBounds && refs.playerBody &&
        (TRAINING || refs.botBody)) {
        st.startMatch(START_LEVEL)
      }
      return
    }
    if (TRAINING || st.spawnEditorOpen) return
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
