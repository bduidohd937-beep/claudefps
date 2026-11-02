import { CFG, MATCH } from './config'
import { WEAPONS } from './weapons'

// Both sides start from exactly the same free equipment and ammunition.
export const initialAmmo = () => Object.fromEntries(
  Object.values(WEAPONS).map((w) => [w.id, { mag: w.mag, reserve: w.reserve }]),
)
export const initialOwned = () => ({ rifle: false, pistol: true, knife: true })
export const initialBotEconomy = () => ({
  money: MATCH.startMoney, armor: 0, weapon: 'pistol',
  owned: initialOwned(), ammo: initialAmmo(), lossStreak: 0,
})

export function roundPayout(won, previousLossStreak = 0) {
  const nextLossStreak = won ? 0 : previousLossStreak + 1
  const lossBonus = won ? 0 : Math.min(
    MATCH.maxLossBonus,
    Math.max(0, nextLossStreak - 1) * MATCH.lossBonusStep,
  )
  return {
    reward: won ? MATCH.winReward : MATCH.lossReward + lossBonus,
    lossBonus,
    lossStreak: nextLossStreak,
  }
}

export const cappedMoney = (amount) => Math.max(0, Math.min(MATCH.maxMoney, amount))

export function refillAllAmmo(ammo) {
  return Object.fromEntries(Object.values(WEAPONS).map((w) => [
    w.id,
    { mag: w.mag, reserve: w.reserve },
  ]))
}

export function loseEquipment(kit) {
  return {
    ...kit,
    armor: 0,
    weapon: 'pistol',
    owned: initialOwned(),
    ammo: initialAmmo(),
  }
}

// Applies the same protective shield absorption used by the player.
export function absorbArmor(hp, armor, rawDamage) {
  const damage = Math.max(0, rawDamage)
  const absorbed = Math.min(armor, damage * CFG.armorRatio)
  return {
    hp: Math.max(0, hp - (damage - absorbed)),
    armor: Math.max(0, armor - absorbed),
    absorbed,
  }
}

// Bot buys only with actual available money, and can retain gear on survival.
// First round always stays pistol-only regardless of money.
export function autoBuyBot(kit, round) {
  let next = {
    ...kit,
    owned: { ...kit.owned },
    ammo: { ...kit.ammo },
  }
  if (round > 1 && !next.owned.rifle && next.money >= WEAPONS.rifle.price) {
    next.money -= WEAPONS.rifle.price
    next.owned.rifle = true
    next.weapon = 'rifle'
  }
  if (next.armor < CFG.armorMax && next.money >= 1000 &&
      (round === 1 || next.owned.rifle || next.money >= WEAPONS.rifle.price + 1000)) {
    next.money -= 1000
    next.armor = Math.min(CFG.armorMax, next.armor + 100)
  } else if (next.armor < 50 && next.money >= 650 &&
      (round === 1 || next.owned.rifle)) {
    next.money -= 650
    next.armor = Math.min(CFG.armorMax, next.armor + 50)
  }
  return next
}
