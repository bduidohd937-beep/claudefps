import test from 'node:test'
import assert from 'node:assert/strict'

const { spatialFootstep, FOOTSTEP_GAITS } = await import('../src/game/FootstepMath.js')
const { exposedAtCloseRange, exposedWithoutCover, spawnScore } = await import('../src/game/SpawnSafety.js')

test('AI sprint is louder and faster than walking; stealth investigation is quietest', () => {
  const source = [5, 0, 0], listener = [0, 0, 0], right = [1, 0, 0]
  const run = spatialFootstep(source, listener, right, 'run')
  const walk = spatialFootstep(source, listener, right, 'walk')
  const sneak = spatialFootstep(source, listener, right, 'crouch')
  assert.ok(run.volume > walk.volume && walk.volume > sneak.volume)
  assert.ok(run.interval < walk.interval && walk.interval < sneak.interval)
  assert.equal(run.pan, 0.85)
  assert.equal(spatialFootstep([-5, 0, 0], listener, right, 'walk').pan, -0.85)
  assert.equal(spatialFootstep([39, 0, 0], listener, right, 'run').volume, 0)
  assert.equal(FOOTSTEP_GAITS.crouch.interval, sneak.interval)
})

test('short unobstructed opponent lines are not valid random spawns', () => {
  assert.equal(exposedAtCloseRange(10, false), true)
  assert.equal(exposedAtCloseRange(10, true), false)
  assert.equal(exposedAtCloseRange(28, false), false)
})

test('large maps require nearby cover if opponent is within 40 meters', () => {
  assert.equal(exposedWithoutCover(20, 100, false), true)
  assert.equal(exposedWithoutCover(20, 100, true), false)
  assert.equal(exposedWithoutCover(20, 12, false), false)
  assert.equal(exposedWithoutCover(50, 100, false), false)
})

test('candidate with accessible cover scores higher than equally distant open spawn', () => {
  assert.ok(spawnScore(4, 14, 20, 0, 5) > spawnScore(4, 14, 20, 0, 0))
})
