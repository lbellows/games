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

function n1(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Hover copy for a stat: what it does, the formula, and the current numbers
 * plugged in. `wave` is optional (luck's shop-tier example).
 */
export function describeStat(key, stats, wave) {
  const s = stats || BASE_STATS;
  const v = s[key] !== undefined ? s[key] : 0;
  const label = STAT_LABELS[key] || key;
  const title = label + "  " + (PERCENT_STATS.has(key) ? n1(v) + "%" : n1(v));
  const w = wave || 1;

  switch (key) {
    case "maxHp":
      return {
        title,
        blurb: "Your hit-point pool. A hit that drops this to 0 ends the run.",
        formula: "HP bar = current / Max HP",
        math: "Each level after 1 also adds +3 Max HP (already included).",
      };
    case "hpRegen":
      return {
        title,
        blurb: "Restores HP over time. Fractions bank until they add up to 1.",
        formula: "+Regen HP per second",
        math: v > 0
          ? "At " + n1(v) + "/s you gain 1 HP every " + n1(1 / v) + "s."
          : "No regeneration right now.",
      };
    case "lifeSteal":
      return {
        title,
        blurb: "Chance per weapon hit to heal 1 HP — not a percent of damage.",
        formula: "P(heal 1) = Life Steal% per hit",
        math: v > 0
          ? n1(v) + "% → about 1 HP every " + n1(100 / v) + " hits."
          : "Hits never heal right now.",
      };
    case "damage":
      return {
        title,
        blurb: "Percent added to every weapon, before melee/ranged bonuses.",
        formula: "hit = base × (1 + Damage% / 100)",
        math: "Current ×" + n1(1 + v / 100) + " on all weapons"
          + (s.meleeDamage || s.rangedDamage
            ? ". Type bonuses stack on top."
            : "."),
      };
    case "meleeDamage": {
      const pct = s.damage + v;
      return {
        title,
        blurb: "Added only to melee weapons, stacking with Damage%.",
        formula: "melee hit = base × (1 + (Damage + Melee)% / 100)",
        math: "Damage " + n1(s.damage) + "% + Melee " + n1(v) + "% → ×" + n1(1 + pct / 100) + ".",
      };
    }
    case "rangedDamage": {
      const pct = s.damage + v;
      return {
        title,
        blurb: "Added only to ranged weapons, stacking with Damage%.",
        formula: "ranged hit = base × (1 + (Damage + Ranged)% / 100)",
        math: "Damage " + n1(s.damage) + "% + Ranged " + n1(v) + "% → ×" + n1(1 + pct / 100) + ".",
      };
    }
    case "attackSpeed":
      return {
        title,
        blurb: "Shortens every weapon's cooldown.",
        formula: "cooldown = base / (1 + Attack Speed% / 100)",
        math: v === 0
          ? "Cooldowns are currently at their base."
          : n1(v) + "% → weapons fire ×" + n1(1 + v / 100) + " as often.",
      };
    case "critChance":
      return {
        title,
        blurb: "Chance for a hit to deal double damage. Capped at 100%.",
        formula: "expected hit ≈ normal × (1 + Crit% / 100)",
        math: n1(v) + "% crit → +" + n1(v) + "% average damage"
          + (v >= 100 ? " (every hit crits)." : "."),
      };
    case "range":
      return {
        title,
        blurb: "Percent added to every weapon's reach.",
        formula: "reach = base × (1 + Range% / 100)",
        math: v === 0
          ? "Weapons are at their listed range."
          : n1(v) + "% → a 390 pistol reaches " + Math.round(390 * (1 + v / 100)) + ".",
      };
    case "armor": {
      const raw = 20;
      const taken = applyArmor(raw, v);
      const pct = Math.round((1 - taken / raw) * 100);
      return {
        title,
        blurb: "Cuts incoming damage with diminishing returns. Hits always deal at least 1.",
        formula: v >= 0
          ? "taken = max(1, round(raw × 15 / (Armor + 15)))"
          : "taken = max(1, round(raw × (1 + 0.02 × |Armor|)))",
        math: v === 0
          ? "0 armor: hits land for full damage (minimum 1)."
          : n1(v) + " armor: " + raw + " raw → " + taken + " taken ("
            + (pct >= 0 ? "−" + pct : "+" + (-pct)) + "%).",
      };
    }
    case "dodge":
      return {
        title,
        blurb: "Chance to ignore a hit entirely. Hard-capped at 60%.",
        formula: "P(ignore) = min(Dodge%, 60%)",
        math: n1(v) + "% → " + n1(v) + " in 100 hits miss you.",
      };
    case "speed": {
      const px = moveSpeed(s);
      return {
        title,
        blurb: "Percent bonus to movement speed.",
        formula: "speed = " + PLAYER_BASE_SPEED + " × (1 + Speed% / 100) px/s",
        math: n1(v) + "% → " + Math.round(px) + " px/s.",
      };
    }
    case "luck": {
      const lucky = 1 + clamp(v, -50, 300) / 100;
      return {
        title,
        blurb: "Improves shop rarity. Higher tiers get a bigger bump.",
        formula: "T2 × (1 + Luck%/100)   T3/T4 × that squared",
        math: n1(v) + "% luck → T2 ×" + n1(lucky) + ", T3/T4 ×" + n1(lucky * lucky)
          + " (wave " + w + ").",
      };
    }
    case "harvesting":
      return {
        title,
        blurb: "Flat materials paid at the end of every wave, on top of pickups.",
        formula: "wave-end ◆ += Harvesting",
        math: v > 0
          ? "+" + n1(v) + " ◆ after each wave, even if you pick up nothing."
          : "No end-of-wave bonus right now.",
      };
    case "engineering":
      return {
        title,
        blurb: "Percent bonus to turret and orbital saw damage.",
        formula: "structure hit = base × (1 + Engineering% / 100)",
        math: v === 0
          ? "Structures currently deal their base damage (Damage% still applies)."
          : n1(v) + "% → structures ×" + n1(1 + v / 100) + ".",
      };
    default:
      return { title, blurb: "", formula: "", math: "" };
  }
}
