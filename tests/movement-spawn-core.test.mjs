import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { location: { search: '' } }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { fairSpawnPair } = await import('../src/game/SpawnSafety.js')
const { NATIVE_CONTROLLER } = await import('../src/game/MovementRules.js')
const { refs, useGame } = await import('../src/store.js')

test('native movement uses finite auto-step, ground snap and slope constraints', () => {
  assert.ok(NATIVE_CONTROLLER.stepHeight > 0.25 && NATIVE_CONTROLLER.stepHeight < 0.5)
  assert.ok(NATIVE_CONTROLLER.minimumStepWidth > 0)
  assert.ok(NATIVE_CONTROLLER.groundSnap > 0)
  assert.ok(NATIVE_CONTROLLER.slideSlopeDegrees > NATIVE_CONTROLLER.climbSlopeDegrees)
})

test('unsafe spawn pairs are rejected before a round begins', () => {
  assert.equal(fairSpawnPair({ distance: 12, blocked: false, mapSpan: 100 }), false)
  assert.equal(fairSpawnPair({ distance: 32, blocked: false, mapSpan: 100 }), false)
  assert.equal(fairSpawnPair({ distance: 32, blocked: true, mapSpan: 100 }), true)
  assert.equal(fairSpawnPair({ distance: 48, blocked: false, mapSpan: 100 }), true)
  assert.equal(fairSpawnPair({ distance: 1.5, blocked: true, mapSpan: 8 }), false)
  assert.equal(fairSpawnPair({ distance: 4, blocked: false, mapSpan: 8 }), true)
})

test('blocked spawn prevents the round start and requires explicit safe retry', () => {
  refs.resetRound = () => false
  useGame.getState().startMatch(3)
  const blocked = useGame.getState()
  assert.equal(blocked.phase, 'buy')
  assert.equal(blocked.shopOpen, false)
  assert.equal(blocked.spawnEditorOpen, true)
  assert.ok(blocked.spawnError?.length > 5)
  blocked.endBuy()
  assert.equal(useGame.getState().phase, 'buy')
  assert.equal(blocked.retrySpawn(), false)
  refs.resetRound = () => true
  assert.equal(blocked.retrySpawn(), true)
  const resumed = useGame.getState()
  assert.equal(resumed.spawnError, null)
  assert.equal(resumed.spawnEditorOpen, false)
  assert.equal(resumed.shopOpen, true)
  assert.equal(resumed.phase, 'buy')
  refs.resetRound = null
})
