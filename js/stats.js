// The canonical stat contract. Items, weapons, enemies and the player all
// resolve through here. Owned by the integrator; agents read but never edit.

import { clamp } from "./core.js";

// Every stat the game knows about, with its baseline for a fresh run.
export const BASE_STATS = {
  maxHp: 10,
  hpRegen: 0,       // hp per second
  lifeSteal: 0,     // % of damage dealt healed, rolled per hit
  damage: 0,        // % bonus to all damage
  meleeDamage: 0,   // % bonus, melee weapons only
  rangedDamage: 0,  // % bonus, ranged weapons only
  attackSpeed: 0,   // % faster cooldowns
  critChance: 5,    // %
  range: 0,         // % bonus to weapon reach
  armor: 0,         // flat damage reduction, diminishing
  dodge: 0,         // % chance to ignore a hit, capped
  speed: 0,         // % bonus move speed
  luck: 0,          // % bonus to drop rolls and shop tiers
  harvesting: 0,    // flat materials granted at end of wave
  engineering: 0,   // % bonus to turret/structure damage
};

export const STAT_LABELS = {
  maxHp: "Max HP",
  hpRegen: "HP Regeneration",
  lifeSteal: "Life Steal",
  damage: "Damage",
  meleeDamage: "Melee Damage",
  rangedDamage: "Ranged Damage",
  attackSpeed: "Attack Speed",
  critChance: "Crit Chance",
  range: "Range",
  armor: "Armor",
  dodge: "Dodge",
  speed: "Speed",
  luck: "Luck",
  harvesting: "Harvesting",
  engineering: "Engineering",
};

// Stats rendered as percentages in the UI.
export const PERCENT_STATS = new Set([
  "lifeSteal", "damage", "meleeDamage", "rangedDamage",
  "attackSpeed", "critChance", "dodge", "speed", "luck", "engineering", "range",
]);

export const PLAYER_BASE_SPEED = 210; // px/sec at speed 0

/** A fresh stat block. */
export function newStats() {
  return { ...BASE_STATS };
}

/**
 * Fold a list of stat modifier objects onto the base. Every modifier is a
 * plain object of partial stat keys, e.g. {maxHp: 5, damage: 10}. Additive.
 */
export function computeStats(modifiers) {
  const out = newStats();
  for (const mod of modifiers) {
    if (!mod) continue;
    for (const k in mod) {
      if (k in out) out[k] += mod[k];
    }
  }
  out.maxHp = Math.max(1, Math.round(out.maxHp));
  out.dodge = clamp(out.dodge, 0, 60);      // hard cap, as in Brotato
  out.critChance = clamp(out.critChance, 0, 100);
  return out;
}

/** Move speed in px/sec for a stat block. */
export function moveSpeed(stats) {
  return PLAYER_BASE_SPEED * (1 + stats.speed / 100);
}

/**
 * Armor gives diminishing returns: it never fully negates a hit.
 * Returns the damage actually taken (minimum 1).
 */
export function applyArmor(raw, armor) {
  const reduction = armor >= 0 ? armor / (armor + 15) : armor * -0.02;
  return Math.max(1, Math.round(raw * (1 - reduction)));
}

/** Cooldown in seconds after attack speed is applied. */
export function attackCooldown(baseCooldown, stats) {
  return baseCooldown / (1 + stats.attackSpeed / 100);
}

/**
 * Final damage for one hit. `type` is "melee" | "ranged" | "elemental".
 * Returns {amount, crit}.
 */
export function rollDamage(base, type, stats, rng) {
  let pct = stats.damage;
  if (type === "melee") pct += stats.meleeDamage;
  else if (type === "ranged") pct += stats.rangedDamage;
  let amount = base * (1 + pct / 100);
  const crit = rng.chance(stats.critChance / 100);
  if (crit) amount *= 2;
  return { amount: Math.max(1, Math.round(amount)), crit };
}

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return Math.round(6 + level * level * 1.4 + level * 4);
}
