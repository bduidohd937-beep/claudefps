// FPS V0.3.2.1 — independent, testable duel-spawn policies.
// Unknown/unscanned graph coverage is NOT treated as connectivity.
const planar = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
export const SPAWN_V5 = Object.freeze({
  snapDistance: 1.35,
  snapHeight: 0.82,
  maxElevationGap: 3.5,
  exposedLimit: 40,
  maxRoute: 140,
  minWideMapSeparation: 12,
})

export function graphConnection(nav, player, bot) {
  if (!nav?.graph || !player || !bot) return { state: 'unknown', reason: '경로 그래프를 사용할 수 없음' }
  const graph = nav.graph
  const match = (pos) => {
    const node = graph.closest({ x: pos[0], y: pos[1], z: pos[2] }, SPAWN_V5.snapDistance + 0.7)
    if (!node || planar(pos, [node.x, node.y, node.z]) > SPAWN_V5.snapDistance ||
      Math.abs(pos[1] - node.y) > SPAWN_V5.snapHeight) return null
    return node
  }
  const p = match(player), b = match(bot)
  if (!p || !b) return { state: 'unknown', reason: '두 스폰 중 일부 지역의 이동 그래프가 아직 생성되지 않음' }
  // A node within 1.35m can still be across a narrow wall. Confirm that
  // each spawn really connects to the snapped graph endpoint, not just its grid cell.
  const connectorClear = (pos, node) => {
    const dx = node.x - pos[0], dz = node.z - pos[2]
    const distance = Math.hypot(dx, dz)
    return distance < 0.16 || !nav.cast ||
      !nav.cast(pos[0], pos[1] + 0.24, pos[2],
        dx / distance, 0, dz / distance, Math.max(0.05, distance - 0.08))
  }
  if (!connectorClear(player, p) || !connectorClear(bot, b)) {
    return { state: 'unknown', reason: '그래프 지점과 스폰 사이에 벽이 있어 연결 검증 불가' }
  }
  // Graph.route may return a nearby endpoint for an unscanned destination:
  // never accept that without verifying both endpoints first.
  const path = graph.route({ x: p.x, y: p.y, z: p.z }, { x: b.x, y: b.y, z: b.z }, 6000)
  if (!path?.points?.length || path.targetError > 0.12) {
    return { state: nav.queue?.length ? 'unknown' : 'disconnected',
      reason: nav.queue?.length ? '경로 연결 탐색 진행 중' : '두 스폰 사이 이동 가능한 연결 경로 없음' }
  }
  const dist = path.points.reduce((total, point, i) => {
    if (!i) return total
    const previous = path.points[i - 1]
    return total + Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z)
  }, 0)
  return { state: 'connected', distance: dist, nodeCount: path.points.length }
}

export function evaluateDuelSpawn({
  player, bot, span, playerExits = 0, botExits = 0, playerCover = 0, botCover = 0,
  playerValid = true, botValid = true, lineOfSight = false,
  nav = { state: 'unknown' }, requireGraph = true, minDistance = 3,
}) {
  const reasons = []
  if (!playerValid) reasons.push('플레이어 위치가 안전한 지면·충돌 검사를 통과하지 못함')
  if (!botValid) reasons.push('AI 위치가 안전한 지면·충돌 검사를 통과하지 못함')
  if (!player || !bot || !player.every(Number.isFinite) || !bot.every(Number.isFinite)) {
    return { ok: false, score: 0, status: 'invalid', reasons: ['양쪽 좌표가 올바르지 않음'] }
  }
  const d = planar(player, bot)
  const height = Math.abs(player[1] - bot[1])
  const wide = span > 25
  const limit = wide ? Math.max(minDistance, SPAWN_V5.minWideMapSeparation) : minDistance
  if (d < limit) reasons.push(`시작 거리 부족 (${d.toFixed(1)}m, 최소 ${limit.toFixed(0)}m)`)
  if (height > SPAWN_V5.maxElevationGap) reasons.push(`고도 차이가 큼 (${height.toFixed(1)}m)`)
  if (wide && lineOfSight && d < SPAWN_V5.exposedLimit) reasons.push('상대가 시작하자마자 직접 보이는 위치')
  if (playerExits < (wide ? 2 : 1)) reasons.push('플레이어 스폰에서 이동 가능한 탈출 방향 부족')
  if (botExits < (wide ? 2 : 1)) reasons.push('AI 스폰에서 이동 가능한 탈출 방향 부족')
  const physicalFailed = reasons.length > 0
  if (requireGraph) {
    if (nav.state !== 'connected') reasons.push(nav.reason || '내비게이션 경로 미확인')
    if (nav.state === 'connected' && (nav.distance > SPAWN_V5.maxRoute || nav.distance < limit ||
      nav.distance > Math.max(45, d * 2.8)))
      reasons.push('실제 이동 경로가 지나치게 길거나 짧음')
  }
  const score = Math.round(Math.max(0, Math.min(100,
    34 + Math.min(28, d * (wide ? 0.7 : 1.1)) -
    Math.max(0, d - (wide ? 48 : 18)) * 0.35 -
    height * 5 + Math.min(playerExits, 5) * 2 + Math.min(botExits, 5) * 2 +
    Math.min(playerCover, 3) * 3 + Math.min(botCover, 3) * 3 -
    (lineOfSight ? 18 : 0) -
    (nav.state === 'connected' ? Math.max(0, nav.distance - 70) * 0.12 : 0)
  )))
  return {
    ok: reasons.length === 0,
    status: reasons.length ? (requireGraph && nav.state === 'unknown' && !physicalFailed ? 'pending' : 'invalid') :
      (requireGraph ? 'safe' : 'partial'),
    reasons,
    score: reasons.length ? Math.min(score, 49) : score,
    metrics: { distance: d, height, playerExits, botExits, playerCover, botCover,
      lineOfSight, route: nav.state === 'connected' ? nav.distance : null,
      graphState: requireGraph ? nav.state : 'disabled' },
  }
}
