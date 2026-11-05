// FPS V0.3.3 — Spawn Zone V6.
// A zone is a sector of ALREADY COLLISION-CONNECTED NavGraph nodes,
// not an arbitrary random coordinate. Individual points and every selected
// player/AI pairing still require the original Rapier safety checks.
const planar = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
const three = (n) => [n.x, n.y + 0.02, n.z]

export function buildSpawnZones(graph, {
  sectorSize = 12, floorHeight = 3.5, minNodes = 4,
  maxZones = 80, samplesPerZone = 5,
} = {}) {
  if (!graph?.nodes?.length) return []
  const bins = new Map()
  for (const node of graph.nodes) {
    if (!node || !Number.isFinite(node.y) || node.links.size < 2) continue
    const gx = Math.floor(node.x / sectorSize)
    const gz = Math.floor(node.z / sectorSize)
    const gy = Math.floor(node.y / floorHeight)
    const id = `zone:${gx}:${gy}:${gz}`
    if (!bins.has(id)) bins.set(id, { id, gx, gy, gz, nodes: [] })
    bins.get(id).nodes.push(node)
  }
  const zones = []
  for (const bin of bins.values()) {
    if (bin.nodes.length < minNodes) continue
    const center = [
      bin.nodes.reduce((t, n) => t + n.x, 0) / bin.nodes.length,
      bin.nodes.reduce((t, n) => t + n.y, 0) / bin.nodes.length,
      bin.nodes.reduce((t, n) => t + n.z, 0) / bin.nodes.length,
    ]
    // Prefer well-linked cells away from narrow ledges, but distribute samples
    // across the zone so a bad center does not disqualify the whole sector.
    const ordered = [...bin.nodes].sort((a, b) =>
      b.links.size - a.links.size ||
      Math.hypot(a.x - center[0], a.z - center[2]) -
      Math.hypot(b.x - center[0], b.z - center[2]))
    const samples = []
    for (const node of ordered) {
      const p = three(node)
      if (samples.every((s) => planar(s, p) >= 2.1)) samples.push(p)
      if (samples.length >= samplesPerZone) break
    }
    if (!samples.length) continue
    zones.push({
      id: bin.id,
      label: `(${bin.gx}, ${bin.gz}) / ${bin.gy}층 구역`,
      center, samples, nodeCount: bin.nodes.length,
      floor: bin.gy,
      kind: 'graph',
      // The individual samples are only nav-walkable, NOT approved spawns.
      status: '후보 · 쌍 검증 필요',
    })
  }
  return zones.sort((a, b) => b.nodeCount - a.nodeCount).slice(0, maxZones)
}

export function anchorZone(kind, pos) {
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(Number.isFinite)) return null
  return {
    id: 'anchor:' + kind,
    label: kind === 'player' ? '기준 스폰 · 플레이어' : '기준 스폰 · AI',
    center: [...pos], samples: [[...pos]], nodeCount: 0,
    floor: Math.floor(pos[1] / 3.5), kind: 'anchor',
    status: '기준 좌표 · 쌍 검증 필요',
  }
}

export function selectSpawnZonePair(zones, inspectPair, {
  previous = null, maxChecks = 44, minSeparation = 8, maxRange = 115,
} = {}) {
  if (!Array.isArray(zones) || typeof inspectPair !== 'function') {
    return { selected: null, pending: null, rejected: [], checked: 0 }
  }
  const pairs = []
  // At most two representative positions per zone, then validate each pair.
  const usable = zones.slice(0, 26)
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j]
      const distance = planar(a.center, b.center)
      if (distance < minSeparation || distance > maxRange) continue
      const sameLast = previous && (previous.playerZone === a.id || previous.botZone === b.id)
      const swappedLast = previous && (previous.playerZone === b.id || previous.botZone === a.id)
      const repeat = sameLast || swappedLast ? 1 : 0
      // Distant enough to avoid instant fights; not so far that neither side can find the other.
      const target = Math.min(48, Math.max(18, maxRange * 0.4))
      const priority = 70 - Math.abs(distance - target) * 0.65 +
        Math.min(8, (a.nodeCount + b.nodeCount) * 0.15) -
        repeat * 32 - ((a.kind === 'anchor') + (b.kind === 'anchor')) * 3
      for (let flip = 0; flip < 2; flip++) {
        const playerZone = flip ? b : a, botZone = flip ? a : b
        const pp = playerZone.samples.slice(0, 2)
        const bb = botZone.samples.slice(0, 2)
        for (const p of pp) for (const q of bb) {
          pairs.push({
            p, b: q, playerZone, botZone,
            priority: priority + (flip === 1 ? -0.04 : 0),
            distance: planar(p, q),
          })
        }
      }
    }
  }
  pairs.sort((a, b) => b.priority - a.priority)
  let winner = null, pending = null
  const rejected = [], reasons = new Map()
  let checked = 0
  for (const item of pairs) {
    if (checked >= maxChecks) break
    checked++
    const audit = inspectPair(item.p, item.b)
    if (!audit) continue
    if (audit.status === 'pending' && !pending) pending = audit
    if (audit.ok) {
      const score = audit.score + item.priority * 0.28
      if (!winner || score > winner.score) {
        winner = {
          player: item.p, bot: item.b,
          playerZone: item.playerZone.id, botZone: item.botZone.id,
          audit, score,
        }
      }
    } else {
      const reason = audit.reasons?.[0] || '부적합'
      reasons.set(reason, (reasons.get(reason) || 0) + 1)
      if (rejected.length < 12) rejected.push({
        playerZone: item.playerZone.id, botZone: item.botZone.id,
        score: audit.score, reasons: audit.reasons || [reason],
        status: audit.status,
      })
    }
  }
  return {
    selected: winner,
    pending, rejected, checked,
    rejectionCounts: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    zoneCount: zones.filter((z) => z.kind === 'graph').length,
  }
}
