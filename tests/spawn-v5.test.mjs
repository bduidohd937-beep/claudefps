import test from 'node:test'
import assert from 'node:assert/strict'
import { NavGraph } from '../src/game/NavGraph.js'
import { graphConnection, evaluateDuelSpawn } from '../src/game/SpawnV5.js'

function connectedLine(length = 34) {
  const graph = new NavGraph(1)
  let previous
  for (let x = 0; x <= length; x++) {
    const node = graph.add(x, 0, 0.83)
    if (previous) graph.connect(previous, node)
    previous = node
  }
  return { graph, queue: [] }
}
const point = (x, y = 0.83) => [x, y, 0]
const params = (override = {}) => ({
  player: point(0), bot: point(30), span: 100,
  playerValid: true, botValid: true,
  playerExits: 4, botExits: 4,
  playerCover: 2, botCover: 2,
  lineOfSight: false, requireGraph: true,
  minDistance: 8,
  nav: { state: 'connected', distance: 34 }, ...override,
})

test('verified navigation graph permits a fair, reachable player/AI pair', () => {
  const evidence = graphConnection(connectedLine(), point(0), point(30))
  assert.equal(evidence.state, 'connected')
  assert.ok(evidence.distance >= 30)
  const pair = evaluateDuelSpawn(params({ nav: evidence }))
  assert.equal(pair.ok, true)
  assert.equal(pair.status, 'safe')
  assert.ok(pair.score >= 50)
  assert.ok(pair.metrics.route >= 30)
})

test('an unscanned distant area is pending, never automatically safe', () => {
  const evidence = graphConnection(connectedLine(9), point(0), point(30))
  assert.equal(evidence.state, 'unknown')
  const result = evaluateDuelSpawn(params({ nav: evidence }))
  assert.equal(result.ok, false)
  assert.equal(result.status, 'pending')
  assert.ok(result.reasons.join(' ').includes('그래프'))
})

test('two separate floors sharing x/z must not be accepted as connected', () => {
  const g = new NavGraph(1)
  g.add(0, 0, 0.83)
  g.add(0, 0, 5.83)
  g.add(1, 0, 0.83)
  const evidence = graphConnection({ graph: g, queue: [] },
    [0, 5.83, 0], [1, 0.83, 0])
  assert.equal(evidence.state, 'disconnected')
  const result = evaluateDuelSpawn(params({ nav: evidence }))
  assert.equal(result.ok, false)
})

test('wall between a spawn and nearest NavGraph cell invalidates endpoint proof', () => {
  const evidence = graphConnection({
    ...connectedLine(),
    cast: () => ({ timeOfImpact: 0.1 }),
  }, point(0.45), point(30))
  assert.equal(evidence.state, 'unknown')
  assert.ok(evidence.reason.includes('벽'))
})

test('exposed close start, high-ground imbalance and trapped exits all block the pair', () => {
  const exposed = evaluateDuelSpawn(params({ lineOfSight: true }))
  assert.equal(exposed.ok, false)
  assert.ok(exposed.reasons.some((r) => r.includes('시작하자마자')))
  const height = evaluateDuelSpawn(params({ bot: point(30, 5.1) }))
  assert.equal(height.ok, false)
  assert.ok(height.reasons.some((r) => r.includes('고도')))
  const trapped = evaluateDuelSpawn(params({ playerExits: 1 }))
  assert.equal(trapped.ok, false)
  assert.ok(trapped.reasons.some((r) => r.includes('탈출')))
})

test('very long winding navigation routes do not count as balanced even when connected', () => {
  const result = evaluateDuelSpawn(params({ nav: { state: 'connected', distance: 120 } }))
  assert.equal(result.ok, false)
  assert.ok(result.reasons.some((r) => r.includes('경로')))
})

test('basic arena / explicit navigation-off mode reports no graph proof and checks physical fairness', () => {
  const result = evaluateDuelSpawn(params({
    span: 20, player: point(0), bot: point(8),
    requireGraph: false, nav: { state: 'disabled' },
  }))
  assert.equal(result.ok, true)
  assert.equal(result.metrics.graphState, 'disabled')
})

test('unverified player or AI floor is never selectable', () => {
  assert.equal(evaluateDuelSpawn(params({ playerValid: false })).ok, false)
  assert.equal(evaluateDuelSpawn(params({ botValid: false })).ok, false)
})
