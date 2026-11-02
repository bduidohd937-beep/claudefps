import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { location: { search: '' } }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { useGame } = await import('../src/store.js')
const { WEAPONS } = await import('../src/weapons.js')

test('match enters buy with equal starting money and two pistols', () => {
  useGame.getState().startMatch(3)
  const s = useGame.getState()
  assert.equal(s.phase, 'buy')
  assert.equal(s.money, 1000)
  assert.equal(s.botEconomy.weapon, 'pistol')
  assert.equal(s.weapon, 'pistol')
  assert.equal(s.botEconomy.owned.rifle, false)
  assert.equal(s.botEconomy.money + (s.botEconomy.armor === 100 ? 1000 : 0), 1000)
})

test('player shop cannot buy AK in round one and paid armor reduces cash', () => {
  const s = useGame.getState()
  assert.equal(s.buy('rifle').ok, false)
  assert.equal(s.buy('armor_half').ok, true)
  assert.equal(useGame.getState().money, 350)
  assert.equal(useGame.getState().armor, 50)
  assert.equal(s.buy('armor_half').ok, false)
})

test('bot must use ammo and reload from reserve like player', () => {
  const s = useGame.getState()
  const before = s.botEconomy.ammo.pistol
  assert.equal(s.botShot(), true)
  let after = useGame.getState().botEconomy.ammo.pistol
  assert.equal(after.mag, before.mag - 1)
  assert.equal(s.botReload(), true)
  after = useGame.getState().botEconomy.ammo.pistol
  assert.equal(after.mag, WEAPONS.pistol.mag)
  assert.equal(after.reserve, before.reserve - 1)
})
