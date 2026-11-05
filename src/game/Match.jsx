import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { CFG, MATCH, SPAWNS, TRAINING, AUTO_ENTER, START_LEVEL, DYNAMIC_SPAWNS, saveSpawn, SPAWN_MANUAL, ACTIVE_MAP, NAV_DISABLED, SPAWN_NAV_DISABLED, SPAWN_ENGINE_V5 } from '../config'
import { live, refs, useGame } from '../store'
import { enemies } from '../enemies'
import { cam, on } from '../fx'
import { exposedAtCloseRange, exposedWithoutCover, spawnScore, spawnHasEscape } from './SpawnSafety.js'
import { graphConnection, evaluateDuelSpawn } from './SpawnV5.js'
import { buildSpawnZones, anchorZone, selectSpawnZonePair } from './SpawnZones.js'

// 라운드 진행 로직: 라운드 리셋, 구매 타이머, 승패 판정, 킬 보상, 스폰 저장 단축키
export default function Match() {
  const camera = useThree((s) => s.camera)
  const { world, rapier } = useRapier()
  const lastSpawns = useRef({ player: null, bot: null })
  const nextSpawnRetry = useRef(0)
  const lastZonePair = useRef(null)

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

    // Probe the landing at five foot points and check multiple same-height escape lanes.
    // A narrow roof edge or a wall-enclosed corner is not a good duel spawn.
    const spawnQuality = (x, groundY, z) => {
      let supported = 0
      for (const [ox, oz] of [[0, 0], [0.23, 0], [-0.23, 0], [0, 0.23], [0, -0.23]]) {
        const top = groundY + 0.85
        const h = cast([x + ox, top, z + oz], [0, -1, 0], 1.25, true)
        if (h && h.normal.y >= 0.72 && Math.abs(top - h.timeOfImpact - groundY) <= 0.22) supported++
      }
      let exits = 0
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        const dx = Math.cos(angle), dz = Math.sin(angle)
        const length = 1.35
        const y = groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.2
        if (cast([x, y, z], [dx, 0, dz], length)) continue
        const top = groundY + 1.0
        const h = cast([x + dx * length, top, z + dz * length], [0, -1, 0], 1.55, true)
        if (!h || h.normal.y < 0.72 || Math.abs(top - h.timeOfImpact - groundY) > 0.45) continue
        exits++
      }
      return { supported, exits }
    }

    const qualityOk = (x, y, z) => {
      const access = spawnQuality(x, y, z)
      const span = refs.mapBounds ? Math.min(refs.mapBounds.max[0] - refs.mapBounds.min[0],
        refs.mapBounds.max[2] - refs.mapBounds.min[2]) : 20
      return spawnHasEscape(access.supported, access.exits, span > 25 ? 2 : 1)
    }
    const pointProfiles = new Map()
    // F6 audit and automatic round selection share identical safety checks.
    // Do not claim a NavGraph connection when the target cells are unscanned.
    const inspectPair = (player, bot) => {
      const bounds = refs.mapBounds
      const span = bounds ? Math.min(bounds.max[0] - bounds.min[0],
        bounds.max[2] - bounds.min[2]) : 20
      const minDistance = Math.min(CFG.spawnMinDistance, Math.max(2.5, span * 0.33))
      const profile = (point) => {
        if (!point || !point.every(Number.isFinite)) return { valid: false, exits: 0, cover: 0 }
        const key = point.map((v) => v.toFixed(2)).join(':')
        const cached = pointProfiles.get(key)
        if (cached) return cached
        const top = point[1] + 1.0
        const hit = cast([point[0], top, point[2]], [0, -1, 0], 2.5, true)
        if (!hit || hit.normal.y < 0.72) return { valid: false, exits: 0, cover: 0 }
        const groundY = top - hit.timeOfImpact
        const centerY = groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
        if (Math.abs(centerY - point[1]) > 0.5 ||
          !hasClearance(point[0], groundY, point[2])) return { valid: false, exits: 0, cover: 0 }
        const quality = spawnQuality(point[0], groundY, point[2])
        const valid = spawnHasEscape(quality.supported, quality.exits, span > 25 ? 2 : 1)
        let cover = 0
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
        for (const [dx, dz] of dirs) {
          if (cast([point[0], centerY + 0.3, point[2]], [dx, 0, dz], 4)) cover++
        }
        const result = { valid, exits: quality.exits, cover }
        if (pointProfiles.size > 800) pointProfiles.clear()
        pointProfiles.set(key, result)
        return result
      }
      const a = profile(player), b = profile(bot)
      let lineOfSight = true
      if (a.valid && b.valid) {
        const dx = bot[0] - player[0], dy = bot[1] - player[1], dz = bot[2] - player[2]
        const distance = Math.hypot(dx, dy, dz)
        if (distance > 0.75) {
          const clear = (from, to) => {
            const vx = to[0] - from[0], vy = to[1] - from[1], vz = to[2] - from[2]
            const len = Math.hypot(vx, vy, vz)
            return !cast(from, [vx / len, vy / len, vz / len], len - 0.65)
          }
          lineOfSight = clear([player[0], player[1] + 0.45, player[2]],
            [bot[0], bot[1] + 0.45, bot[2]]) ||
            clear([bot[0], bot[1] + 0.45, bot[2]],
              [player[0], player[1] + 0.45, player[2]])
        }
      }
      const requireGraph = !NAV_DISABLED && !SPAWN_NAV_DISABLED && ACTIVE_MAP.key !== 'arena'
      const physicallyValid = evaluateDuelSpawn({
        player, bot, span, playerExits: a.exits, botExits: b.exits,
        playerCover: a.cover, botCover: b.cover,
        playerValid: a.valid, botValid: b.valid,
        lineOfSight, requireGraph: false, minDistance,
      }).ok
      const nav = requireGraph && physicallyValid
        ? graphConnection(refs.navigation, player, bot)
        : { state: requireGraph ? 'skipped' : 'disabled', reason: requireGraph
          ? '다른 물리·거리 검사를 통과하지 못함' : ACTIVE_MAP.key === 'arena'
          ? '내장 아레나에서는 지면·거리 검사를 우선함' :
          SPAWN_NAV_DISABLED ? '스폰 내비게이션 검사만 비활성화됨' : 'AI 내비게이션이 비활성화됨' }
      const result = evaluateDuelSpawn({
        player, bot, span, playerExits: a.exits, botExits: b.exits,
        playerCover: a.cover, botCover: b.cover,
        playerValid: a.valid, botValid: b.valid, lineOfSight,
        nav, requireGraph, minDistance,
      })
      return { ...result, nav, player: a, bot: b }
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
          // Probe near the requested playable elevation first: global high casts often hit rooftops.
          const top = center[1] + 2.5
          const depth = Math.max(14, top - (bounds?.min[1] ?? -20) + 5)
          const floor = cast([x, top, z], [0, -1, 0], depth, true)
          if (!floor || floor.normal.y < 0.72) continue
          const groundY = top - floor.timeOfImpact
          if (hasClearance(x, groundY, z) && qualityOk(x, groundY, z)) {
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
      if (Math.abs(y - point[1]) > 1.5 || !hasClearance(point[0], floorY, point[2]) ||
        !qualityOk(point[0], floorY, point[2])) return null
      return [point[0], y, point[2]]
    }

    // Collect collision-valid same-level locations once per anchor. Reuse the
    // validated pool between rounds rather than casting thousands of rays each time.
    const groundPools = new Map()
    resolve.randomNear = (base, avoid, previous, radius, minimumDistance, collect = false) => {
      if (!base) return collect ? [] : null
      const key = base.map((n) => n.toFixed(1)).join(':') + ':' + radius.toFixed(1)
      let pool = groundPools.get(key)
      if (!pool) {
        pool = []
        const span = refs.mapBounds ? Math.min(
          refs.mapBounds.max[0] - refs.mapBounds.min[0],
          refs.mapBounds.max[2] - refs.mapBounds.min[2],
        ) : 20
        for (let i = 0; i < 128; i++) {
          const angle = Math.random() * Math.PI * 2
          const distance = radius * (0.32 + Math.random() * 0.68)
          const x = base[0] + Math.cos(angle) * distance
          const z = base[2] + Math.sin(angle) * distance
          const top = base[1] + 2.5
          const floor = cast([x, top, z], [0, -1, 0], 6, true)
          if (!floor || floor.normal.y < 0.72) continue
          const groundY = top - floor.timeOfImpact
          const centerY = groundY + CFG.capsuleHalfHeight + CFG.capsuleRadius + 0.05
          if (Math.abs(centerY - base[1]) > 1.75 || !hasClearance(x, groundY, z)) continue
          const access = spawnQuality(x, groundY, z)
          if (!spawnHasEscape(access.supported, access.exits, span > 25 ? 2 : 1)) continue
          pool.push({ pos: [x, centerY, z], exits: access.exits })
        }
        groundPools.set(key, pool)
      }
      const span = refs.mapBounds ? Math.min(
        refs.mapBounds.max[0] - refs.mapBounds.min[0],
        refs.mapBounds.max[2] - refs.mapBounds.min[2],
      ) : 20
      const valid = []
      for (const candidate of pool) {
        const [x, centerY, z] = candidate.pos
        const opponentDistance = avoid ? Math.hypot(x - avoid[0], centerY - avoid[1], z - avoid[2]) : radius
        if (avoid && opponentDistance < minimumDistance) continue
        const recentDistance = previous ? Math.hypot(x - previous[0], z - previous[2]) : radius
        if (previous && recentDistance < Math.min(2.5, radius * 0.4)) continue
        let blocked = false
        if (avoid && opponentDistance > 0.5) {
          const dx = avoid[0] - x, dy = avoid[1] - centerY, dz = avoid[2] - z
          blocked = !!cast([x, centerY + 0.45, z],
            [dx / opponentDistance, dy / opponentDistance, dz / opponentDistance],
            Math.max(0, opponentDistance - 0.6))
          if (exposedAtCloseRange(opponentDistance, blocked)) continue
        }
        // The actual line of sight toward the opponent matters more than any
        // nearby wall that merely sits behind the spawn point.
        if (avoid && span > 25 && opponentDistance < 40 && !blocked) continue
        const cover = !!avoid && blocked
        if (avoid && exposedWithoutCover(opponentDistance, span, cover)) continue
        const score = spawnScore(recentDistance, opponentDistance, radius,
          Math.random() * 2, (cover ? 6 : 0) + Math.min(candidate.exits, 5) * 0.55)
        valid.push({ pos: candidate.pos, score })
      }
      valid.sort((a, b) => b.score - a.score)
      if (collect) return valid.slice(0, 10).map((entry) => entry.pos)
      return valid.length ? valid[Math.floor(Math.random() * Math.min(valid.length, 7))].pos : null
    }
    resolve.inspectPair = inspectPair
    return resolve
  }, [world, rapier])

  useEffect(() => {
    const zoneCache = { graph: null, count: -1, zones: [] }
    // Build map-wide SPAWN SECTORS only from the collision-reachable graph.
    // Keep known anchor points as candidates, but NEVER accept them without
    // running the same physical + route inspector as generated sectors.
    const getZones = (playerAnchor, botAnchor) => {
      const graph = refs.navigation?.graph
      if (graph !== zoneCache.graph || (graph?.nodes.length ?? 0) !== zoneCache.count) {
        zoneCache.graph = graph
        zoneCache.count = graph?.nodes.length ?? 0
        zoneCache.zones = buildSpawnZones(graph, { maxZones: 80 })
      }
      return [
        anchorZone('player', playerAnchor),
        anchorZone('bot', botAnchor),
        ...zoneCache.zones,
      ].filter(Boolean)
    }
    refs.getSpawnZones = () => getZones(
      refs.safePlayerSpawn || SPAWNS.player,
      refs.safeBotSpawn || SPAWNS.bot,
    )
    // 라운드 시작 시 플레이어/봇 위치 초기화 + 서로 마주보게 설정
    refs.snapSpawn = (pos) => findSafeSpawn(pos, null, 1)
    refs.inspectSpawnPair = (player, bot) => findSafeSpawn.inspectPair(player, bot)
    refs.validateSpawn = (kind, point) => {
      const opposite = kind === 'player' ? refs.botBody : refs.playerBody
      const at = opposite?.translation()
      return findSafeSpawn.at(point, at ? [at.x, at.y, at.z] : null, 3)
    }
    refs.randomSafeSpawn = (kind) => {
      const bounds = refs.mapBounds
      const span = bounds ? Math.min(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) : 20
      const radius = Math.min(22, Math.max(3, span * 0.27))
      const own = kind === 'player' ? refs.playerBody : refs.botBody
      const opposite = kind === 'player' ? refs.botBody : refs.playerBody
      const ownNow = own?.translation()
      const other = opposite?.translation()
      const base = kind === 'player' ? (refs.safePlayerSpawn || SPAWNS.player) : (refs.safeBotSpawn || SPAWNS.bot)
      const anchor = findSafeSpawn.at(base) || findSafeSpawn(base)
      if (!anchor) return null
      const avoid = other ? [other.x, other.y, other.z] : null
      const previous = ownNow ? [ownNow.x, ownNow.y, ownNow.z] : null
      const options = findSafeSpawn.randomNear(anchor, avoid, previous,
        radius, Math.min(8, Math.max(3, span * 0.25)), true)
      for (const p of options) {
        const report = kind === 'player'
          ? findSafeSpawn.inspectPair(p, avoid)
          : findSafeSpawn.inspectPair(avoid, p)
        if (report.ok) return p
      }
      return null
    }
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
      if (!TRAINING && !NAV_DISABLED && !SPAWN_NAV_DISABLED && ACTIVE_MAP.key !== 'arena' && baseBot) {
        const nav = refs.navigation
        if (nav && (!nav.anchor ||
          Math.hypot(baseBot[0] - nav.anchor.x, baseBot[2] - nav.anchor.z) > 14 ||
          Math.abs(baseBot[1] - nav.anchor.y) > 1.3)) {
          nav.reset({ x: baseBot[0], y: baseBot[1], z: baseBot[2] })
        }
      }
      let p = basePlayer
      let bp = baseBot
      let audit = null
      const useZones = DYNAMIC_SPAWNS && !TRAINING && !SPAWN_ENGINE_V5 &&
        !NAV_DISABLED && !SPAWN_NAV_DISABLED && ACTIVE_MAP.key !== 'arena'
      if (useZones) {
        const zones = getZones(basePlayer, baseBot)
        const outcome = selectSpawnZonePair(zones, findSafeSpawn.inspectPair, {
          previous: lastZonePair.current,
          maxChecks: 60,
          minSeparation: Math.max(8, minimumDistance),
          maxRange: Math.min(130, Math.max(35, span * 1.04)),
          fixedPlayer: SPAWN_MANUAL.player ? basePlayer : null,
          fixedBot: SPAWN_MANUAL.bot ? baseBot : null,
        })
        const zoneReport = {
          engine: 'v6', zones: zones.length,
          graphZones: outcome.zoneCount,
          checked: outcome.checked,
          rejected: outcome.rejected,
          rejectionCounts: outcome.rejectionCounts,
          selected: outcome.selected && {
            playerZone: outcome.selected.playerZone, botZone: outcome.selected.botZone,
            score: outcome.selected.audit.score,
            player: outcome.selected.player, bot: outcome.selected.bot,
          },
          graphNodes: refs.navigation?.graph?.nodes.length ?? 0,
          graphPending: refs.navigation?.queue?.length ?? 0,
        }
        refs.lastSpawnZoneReport = zoneReport
        useGame.setState({ spawnZoneReport: zoneReport })
        if (outcome.selected) {
          p = outcome.selected.player
          bp = outcome.selected.bot
          audit = outcome.selected.audit
          lastZonePair.current = {
            playerZone: outcome.selected.playerZone,
            botZone: outcome.selected.botZone,
          }
        } else {
          audit = outcome.pending || {
            ok: false, status: 'invalid', score: 0,
            reasons: [zones.length < 2
              ? '이동 가능한 스폰 구역이 아직 충분히 생성되지 않음'
              : '검증된 스폰 구역 사이에서 공정한 위치 조합을 찾지 못함',
            ...outcome.rejectionCounts.map(([reason, count]) => `${reason} (거절 ${count}회)`)].slice(0, 7),
          }
          refs.lastSpawnAudit = audit
          useGame.setState({ spawnAudit: audit })
          useGame.getState().setSpawnEditorOpen(true)
          refs.safePlayerSpawn = basePlayer
          refs.safeBotSpawn = baseBot
          return false
        }
      } else {
        // The V5/arena/fixed-mode compatibility path remains available for
        // regression comparison. It does not claim full zone verification.
        refs.lastSpawnZoneReport = {
          engine: 'v5', zones: 0, graphZones: 0, checked: 0, rejected: [],
          selected: null, reason: SPAWN_ENGINE_V5 ? '사용자가 V5 호환 모드 선택' :
            ACTIVE_MAP.key === 'arena' ? '내장 아레나는 기존 소형 맵 스폰 적용' :
            '랜덤 구역 모드 비활성화',
        }
        useGame.setState({ spawnZoneReport: refs.lastSpawnZoneReport })
      if (!TRAINING) {
        // Evaluate PAIRS together, not one independently selected point at a time.
        // Old sky/roof fallback is deliberately absent. Unscanned NavGraph areas
        // remain pending, never assumed connected.
        const players = basePlayer ? [basePlayer] : []
        const bots = baseBot ? [baseBot] : []
        if (DYNAMIC_SPAWNS && basePlayer && baseBot) {
          players.push(...findSafeSpawn.randomNear(basePlayer, baseBot,
            lastSpawns.current.player, radius, minimumDistance, true).slice(0, 6))
          bots.push(...findSafeSpawn.randomNear(baseBot, basePlayer,
            lastSpawns.current.bot, radius, minimumDistance, true).slice(0, 6))
        }
        let best = null
        let pending = null
        let rejected = null
        for (const candidatePlayer of players) {
          for (const candidateBot of bots) {
            const result = findSafeSpawn.inspectPair(candidatePlayer, candidateBot)
            if (result.status === 'pending' && !pending) pending = result
            if (!rejected || result.score > rejected.score) rejected = result
            if (!result.ok) continue
            const repeats = (lastSpawns.current.player &&
              Math.hypot(candidatePlayer[0] - lastSpawns.current.player[0],
                candidatePlayer[2] - lastSpawns.current.player[2]) < 3) ||
              (lastSpawns.current.bot &&
                Math.hypot(candidateBot[0] - lastSpawns.current.bot[0],
                  candidateBot[2] - lastSpawns.current.bot[2]) < 3)
            const score = result.score - (repeats ? 14 : 0) + Math.random() * 7
            if (!best || score > best.score) {
              best = { p: candidatePlayer, bp: candidateBot, audit: result, score }
            }
          }
        }
        if (best) {
          p = best.p; bp = best.bp; audit = best.audit
        } else {
          audit = pending || rejected || {
            ok: false, status: 'invalid', score: 0,
            reasons: ['검증 가능한 두 스폰 후보를 찾지 못함'],
          }
          refs.lastSpawnAudit = audit
          useGame.setState({ spawnAudit: audit })
          console.warn('[spawn V5] fair pair unavailable', audit.reasons)
          useGame.getState().setSpawnEditorOpen(true)
          refs.safePlayerSpawn = basePlayer
          refs.safeBotSpawn = baseBot
          return false
        }
      }
      }
      if (!p || (!TRAINING && !bp)) {
        audit = audit || { ok: false, status: 'invalid', score: 0,
          reasons: ['유효한 지면을 찾지 못함'] }
        refs.lastSpawnAudit = audit
        useGame.setState({ spawnAudit: audit })
        useGame.getState().setSpawnEditorOpen(true)
        return false
      }
      refs.lastSpawnAudit = audit
      useGame.setState({ spawnAudit: audit })
      const playerSpawn = p
      const botSpawn = bp
      if (p && bp) {
        lastSpawns.current = { player: [...p], bot: [...bp] }
      }
      if (DYNAMIC_SPAWNS && p && bp && !TRAINING) {
        console.info('[spawn] 라운드별 랜덤 스폰', {
          player: p.map((x) => Number(x.toFixed(2))),
          bot: bp.map((x) => Number(x.toFixed(2))),
        })
      }
      refs.resetPlayerMotion?.()
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
        if (typeof rb.isKinematic === 'function' && rb.isKinematic()) {
          rb.setNextKinematicTranslation({ x: playerSpawn[0], y: playerSpawn[1], z: playerSpawn[2] })
        }
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
      return true
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
      refs.validateSpawn = null
      refs.randomSafeSpawn = null
      refs.getSpawnZones = null
      refs.inspectSpawnPair = null
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
    // The graph is incremental: retry an initially unscanned map after more
    // walkable cells have been explored. Invalid geometry still requires F6 edits.
    if (st.spawnError && st.spawnAudit?.status === 'pending' && st.spawnEditorOpen) {
      const clock = performance.now() / 1000
      if (clock >= nextSpawnRetry.current) {
        nextSpawnRetry.current = clock + 2.5
        st.retrySpawn()
      }
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
