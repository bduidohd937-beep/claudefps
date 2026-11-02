import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { location: { search: '' } }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { WEAPONS, WEAPON_IDS } = await import('../src/weapons.js')
const { SHOP } = await import('../src/shop.js')
const { initialOwned, initialAmmo, autoBuyBot } = await import('../src/economy.js')
const { useGame } = await import('../src/store.js')

test('all eight weapon variants have prices, ammo and proper gun slots', () => {
  assert.equal(WEAPON_IDS.length, 8)
  for (const id of ['m4a1', 'mp5', 'shotgun', 'awp', 'deagle']) {
    assert.ok(WEAPONS[id].price > 0)
    assert.ok(WEAPONS[id].mag > 0)
    assert.ok(WEAPONS[id].fireInterval > 0)
    assert.ok(SHOP.find((p) => p.id === id && p.price === WEAPONS[id].price))
  }
  assert.equal(WEAPONS.deagle.slot, 'secondary')
  assert.equal(WEAPONS.shotgun.pellets, 8)
})

test('all new guns have starting ammo but are not initially owned', () => {
  const owned = initialOwned()
  const ammo = initialAmmo()
  for (const id of ['m4a1', 'mp5', 'shotgun', 'awp', 'deagle']) {
    assert.equal(owned[id], false)
    assert.equal(ammo[id].mag, WEAPONS[id].mag)
  }
})

test('purchasing primary weapons replaces only the primary weapon and slot switch works', () => {
  const game = useGame.getState()
  game.startMatch(3)
  useGame.setState({ money: 10000 })
  assert.equal(game.buy('m4a1').ok, true)
  assert.equal(useGame.getState().weapon, 'm4a1')
  assert.equal(game.buy('mp5').ok, true)
  assert.equal(useGame.getState().owned.m4a1, false)
  assert.equal(useGame.getState().owned.mp5, true)
  assert.equal(game.equipSlot('secondary'), undefined)
  assert.equal(useGame.getState().weapon, 'pistol')
  game.equipSlot('primary')
  assert.equal(useGame.getState().weapon, 'mp5')
})

test('secondary Desert Eagle replaces Glock and preserves the primary gun', () => {
  useGame.setState({ money: 10000 })
  const game = useGame.getState()
  assert.equal(game.buy('deagle').ok, true)
  assert.equal(useGame.getState().weapon, 'deagle')
  assert.equal(useGame.getState().owned.pistol, false)
  assert.equal(useGame.getState().owned.mp5, true)
  game.equipSlot('primary')
  assert.equal(useGame.getState().weapon, 'mp5')
  game.equipSlot('secondary')
  assert.equal(useGame.getState().weapon, 'deagle')
})

test('AI can buy budget MP5 after round one, but cannot start with rifle', () => {
  const initial = { money: 2000, armor: 0, weapon: 'pistol', owned: initialOwned(), ammo: initialAmmo() }
  assert.equal(autoBuyBot(initial, 1).weapon, 'pistol')
  const purchased = autoBuyBot(initial, 2)
  assert.equal(purchased.weapon, 'mp5')
  assert.equal(purchased.money, 250)
})
