import test from 'node:test'
import assert from 'node:assert/strict'

const { canBotFire, investigationTarget, validStepHeight } = await import('../src/game/AITactics.js')

test('AI refuses shots after line of sight breaks, even when it knows a target location', () => {
  assert.equal(canBotFire({ visible: false, spotted: true, seenAt: 1, time: 9, reaction: 0.4 }), false)
  assert.equal(canBotFire({ visible: true, spotted: true, seenAt: 1, time: 1.1, reaction: 0.4 }), false)
  assert.equal(canBotFire({ visible: true, spotted: true, seenAt: 1, time: 2, reaction: 0.4 }), true)
})

test('investigates last heard or spotted location instead of live target coordinates', () => {
  const memory = { x: 12, z: -4 }
  const patrol = { x: -7, z: 8 }
  assert.equal(investigationTarget({ visible: false, lastKnown: memory, investigateUntil: 5, patrolGoal: patrol, time: 3 }), memory)
  assert.equal(investigationTarget({ visible: false, lastKnown: memory, investigateUntil: 5, patrolGoal: patrol, time: 6 }), patrol)
  assert.equal(investigationTarget({ visible: true, lastKnown: memory, investigateUntil: 5, patrolGoal: patrol, time: 3 }), null)
})

test('AI hops only low positive steps and rejects drops and tall walls', () => {
  assert.equal(validStepHeight(-2), false)
  assert.equal(validStepHeight(0.1), false)
  assert.equal(validStepHeight(0.5), true)
  assert.equal(validStepHeight(1.5), false)
})
