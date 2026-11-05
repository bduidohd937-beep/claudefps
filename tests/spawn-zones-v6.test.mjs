import test from 'node:test'
import assert from 'node:assert/strict'
import { NavGraph } from '../src/game/NavGraph.js'
import {
  buildSpawnZones, anchorZone, diversifySpawnZones, selectSpawnZonePair,
} from '../src/game/SpawnZones.js'

const z = (id, x, count = 12, y = 0.85) => ({
  id, kind: 'graph', center: [x, y, 0], samples: [[x, y, 0]],
  nodeCount: count, label: id, floor: 0,
})
const report = (a, b) => ({
  ok: Math.hypot(a[0] - b[0], a[2] - b[2]) >= 12,
  score: 75, status: 'safe', reasons: [],
})

test('V6 derives broad sector zones from connected walkable cells instead of random coordinates', () => {
  const graph = new NavGraph(1)
  for (let x = 0; x < 36; x++) {
    for (let y = 0; y < 3; y++) {
      const node = graph.add(x, y, 0.85)
      if (x) graph.connect(node, graph.nodes.find(n => n.gx === x - 1 && n.gz === y))
      if (y) graph.connect(node, graph.nodes.find(n => n.gx === x && n.gz === y - 1))
    }
  }
  const zones = buildSpawnZones(graph, { sectorSize: 12, minNodes: 4 })
  assert.ok(zones.length >= 3)
  assert.ok(zones.every(zone => zone.nodeCount >= 4 && zone.samples.length >= 1))
  assert.ok(new Set(zones.map(z => z.id)).size === zones.length)
  assert.ok(zones.some(zone => zone.center[0] > 24))
})

test('V6 does not invent spawn zones when graph is unavailable or unverified', () => {
  assert.deepEqual(buildSpawnZones(null), [])
  const graph = new NavGraph()
  graph.add(0, 0, 0.85)
  graph.add(1, 0, 0.85)
  assert.deepEqual(buildSpawnZones(graph), [])
})

test('two floors at identical map x/z do not merge into one zone', () => {
  const graph = new NavGraph()
  let a, b
  for (let x = 0; x < 7; x++) {
    const nextA = graph.add(x, 0, 0.85)
    const nextB = graph.add(x, 0, 4.85)
    if (a) graph.connect(a, nextA)
    if (b) graph.connect(b, nextB)
    a = nextA; b = nextB
  }
  const zones = buildSpawnZones(graph, { minNodes: 4 })
  assert.equal(zones.length, 2)
  assert.notEqual(zones[0].floor, zones[1].floor)
})

test('zone candidates are diversified geographically, preserving configured anchors', () => {
  const zones = [
    anchorZone('player', [0, 0.85, 0]),
    anchorZone('bot', [30, 0.85, 0]),
    z('near', 1), z('near2', 2), z('far', 50), z('further', 72),
  ]
  const selected = diversifySpawnZones(zones, 4, 10)
  assert.equal(selected.length, 4)
  assert.ok(selected.some(v => v.id === 'anchor:player'))
  assert.ok(selected.some(v => v.id === 'far'))
  assert.ok(selected.some(v => v.id === 'further'))
})

test('V6 chooses a verified fair PAIR from two distinct map sectors', () => {
  const outcome = selectSpawnZonePair([z('A', 0), z('B', 38), z('C', 75)], report, {
    minSeparation: 12, maxRange: 100,
  })
  assert.ok(outcome.selected)
  assert.notEqual(outcome.selected.playerZone, outcome.selected.botZone)
  assert.ok(outcome.selected.audit.ok)
  assert.ok(outcome.checked >= 1)
})

test('V6 rotates away from both previously used zones if other similar sectors are available', () => {
  const zones = [z('A', 0), z('B', 30), z('C', 60), z('D', 90)]
  const outcome = selectSpawnZonePair(zones, report, {
    previous: { playerZone: 'A', botZone: 'B' },
    maxRange: 120,
  })
  assert.ok(outcome.selected)
  assert.equal(new Set([outcome.selected.playerZone, outcome.selected.botZone]).has('A'), false)
  assert.equal(new Set([outcome.selected.playerZone, outcome.selected.botZone]).has('B'), false)
})

test('manual spawn anchors restrict the candidate pair to nearby sectors', () => {
  const zones = [z('A', 0), z('B', 40), z('C', 80)]
  const outcome = selectSpawnZonePair(zones, report, {
    fixedPlayer: [0, 0.85, 0], fixedBot: [80, 0.85, 0],
    maxAnchorOffset: 4, maxRange: 120,
  })
  assert.ok(outcome.selected)
  assert.equal(outcome.selected.playerZone, 'A')
  assert.equal(outcome.selected.botZone, 'C')
})

test('V6 bounds collision/path audits and reports rejected zone reasons', () => {
  const zones = [z('A', 0), z('B', 25), z('C', 50), z('D', 75)]
  const outcome = selectSpawnZonePair(zones, () => ({
    ok: false, status: 'invalid', score: 21,
    reasons: ['상대에게 시작 직후 노출됨'],
  }), { maxChecks: 3, maxRange: 120 })
  assert.equal(outcome.selected, null)
  assert.equal(outcome.checked, 3)
  assert.equal(outcome.rejected.length, 3)
  assert.deepEqual(outcome.rejectionCounts[0], ['상대에게 시작 직후 노출됨', 3])
})

test('V6 keeps unresolved route/sector evidence pending rather than treating it as safe', () => {
  const zones = [z('A', 0), z('B', 30)]
  const outcome = selectSpawnZonePair(zones, () => ({
    ok: false, status: 'pending', score: 0,
    reasons: ['이동 그래프가 아직 생성되지 않음'],
  }))
  assert.equal(outcome.selected, null)
  assert.equal(outcome.pending?.status, 'pending')
})

test('invalid anchors never turn into unverified zones', () => {
  assert.equal(anchorZone('player', [1, NaN, 2]), null)
  assert.equal(anchorZone('bot', [1, 2]), null)
  assert.equal(anchorZone('player', null), null)
})
