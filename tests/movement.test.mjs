import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isNewJump, shouldStep, MAX_AUTO_STEP, MAX_MANUAL_MANTLE,
} from '../src/game/MovementRules.js'

const feasible = { forwardBlocked: true, upperClear: true, stableLanding: true, headClear: true }

test('normal walking automatically climbs only low steps', () => {
  for (const height of [0.08, 0.16, 0.25, 0.35])
    assert.equal(shouldStep({ ...feasible, rise: height }), true)
  assert.equal(shouldStep({ ...feasible, rise: MAX_AUTO_STEP + 0.05 }), false)
  assert.equal(shouldStep({ ...feasible, rise: 1.2 }), false)
  assert.equal(shouldStep({ ...feasible, rise: -0.1 }), false)
})

test('manual mantle requires a jump and is still height-limited', () => {
  assert.equal(shouldStep({ ...feasible, rise: 0.66 }), false)
  assert.equal(shouldStep({ ...feasible, rise: 0.66, deliberateJump: true }), true)
  assert.equal(shouldStep({ ...feasible, rise: MAX_MANUAL_MANTLE + 0.1, deliberateJump: true }), false)
})

test('unsafe floor edges, blocked body or ceiling prevent automatic stepping', () => {
  assert.equal(shouldStep({ ...feasible, rise: 0.24, stableLanding: false }), false)
  assert.equal(shouldStep({ ...feasible, rise: 0.24, upperClear: false }), false)
  assert.equal(shouldStep({ ...feasible, rise: 0.24, headClear: false }), false)
  assert.equal(shouldStep({ ...feasible, rise: 0.24, forwardBlocked: false }), false)
})

test('holding Space does not jump again after the first input edge', () => {
  assert.equal(isNewJump(true, false), true)
  assert.equal(isNewJump(true, true), false)
  assert.equal(isNewJump(false, true), false)
  assert.equal(isNewJump(true, false, false), false)
})
