import test from 'node:test'
import assert from 'node:assert/strict'

// config.js reads browser query parameters at module initialization.
globalThis.window = { location: { search: '' } }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { MATCH } = await import('../src/config.js')
const { WEAPONS } = await import('../src/weapons.js')
const {
  initialAmmo, initialOwned, initialBotEconomy, refillAllAmmo,
  loseEquipment, roundPayout, cappedMoney, absorbArmor, autoBuyBot,
} = await import('../src/economy.js')

test('both sides share baseline funds, default Glock and full starting ammo', () => {
  const bot = initialBotEconomy()
  assert.equal(bot.money, 1000)
  assert.equal(bot.weapon, 'pistol')
  assert.deepEqual(bot.owned, initialOwned())
  assert.equal(bot.ammo.pistol.mag, WEAPONS.pistol.mag)
  assert.equal(MATCH.startMoney, bot.money)
})

test('bot cannot buy a rifle in round one even if it has sufficient money', () => {
  const bot = autoBuyBot({ ...initialBotEconomy(), money: 6000 }, 1)
  assert.equal(bot.weapon, 'pistol')
  assert.equal(bot.owned.rifle, false)
})

test('later rounds require and consume actual funds before purchasing a rifle', () => {
  assert.equal(autoBuyBot({ ...initialBotEconomy(), money: 2499 }, 2).owned.rifle, false)
  const next = autoBuyBot({ ...initialBotEconomy(), money: 2500 }, 2)
  assert.equal(next.weapon, 'rifle')
  assert.equal(next.owned.rifle, true)
  assert.equal(next.money, 0)
})

test('survivors retain their purchased equipment; dead combatants return to a free pistol', () => {
  const equipped = {
    ...initialBotEconomy(), money: 999, armor: 70, weapon: 'rifle',
    owned: { ...initialOwned(), rifle: true },
  }
  const survivor = autoBuyBot(equipped, 2)
  assert.equal(survivor.owned.rifle, true)
  const dead = loseEquipment(equipped)
  assert.equal(dead.weapon, 'pistol')
  assert.equal(dead.owned.rifle, false)
  assert.equal(dead.armor, 0)
  assert.equal(dead.money, 999)
})

test('round rewards preserve comeback economy and caps', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => roundPayout(false, n).reward), [1900, 2100, 2300, 2500, 2500])
  assert.equal(roundPayout(true, 3).reward, 2300)
  assert.equal(roundPayout(true, 3).lossStreak, 0)
  assert.equal(cappedMoney(99999), 10000)
  assert.equal(MATCH.killReward, 200)
})

test('shield absorbs the same percentage on both teams, but does not exceed its points', () => {
  const a = absorbArmor(100, 100, 30)
  assert.ok(Math.abs(a.hp - 89.8) < 0.00001)
  assert.ok(Math.abs(a.armor - 80.2) < 0.00001)
  const b = absorbArmor(100, 5, 30)
  assert.equal(b.armor, 0)
  assert.equal(b.hp, 75)
})

test('each new round refills magazine and reserve', () => {
  const used = initialAmmo()
  used.pistol.mag = 1
  used.rifle.reserve = 0
  const refilled = refillAllAmmo(used)
  assert.equal(refilled.pistol.mag, WEAPONS.pistol.mag)
  assert.equal(refilled.rifle.reserve, WEAPONS.rifle.reserve)
})
