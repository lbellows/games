// Weapons: definitions, tier scaling, auto-targeting and firing.
// Weapons are data plus a small `mode` dispatch. Every hit resolves through
// rollDamage() so crit and the player's % scaling apply uniformly, and every
// shot leaves through projectiles.js so behaviours stay in one place.
//
// `type` is the shop/UI category. `scaling` is what the math actually uses:
// melee -> meleeDamage%, ranged -> rangedDamage%, plain damage -> neither.
// Structures (turret, sawblade) deliberately scale off engineering only, so
// they stay a build of their own rather than a free rider on gun stats.

import { ARENA, TAU, angleTo, clamp, dist2 } from "./core.js";
import { attackCooldown, rollDamage } from "./stats.js";
import { spawnProjectile } from "./projectiles.js";

// Tier 1-4 mirrors Brotato rarity: more damage, a touch faster, much pricier.
const TIER_DAMAGE = [1, 1.45, 2.05, 2.9];
const TIER_COOLDOWN = [1, 0.97, 0.93, 0.88];
const TIER_PRICE = [1, 2.6, 5.6, 11];

const MUZZLE = 18; // px from the body a shot leaves

/* ------------------------------------------------------------ definitions */

export const WEAPON_DEFS = {
  /* ---- melee: sweep an arc anchored to the player ---- */
  knife: {
    id: "knife", name: "Knife", type: "melee", mode: "melee",
    damage: 9, cooldown: 0.42, range: 68, knockback: 70,
    tier: 1, price: 12, pierce: 0, count: 1, spread: 0,
    color: "#e6f1ff", projShape: "slash", dpsMul: 1.25,
    arc: 1.5, blade: 0.5, swingTime: 0.16, bonusCrit: 8,
    scaling: { melee: 1 },
    desc: "Fast little jabs that crit far more often than they should.",
  },
  sword: {
    id: "sword", name: "Sword", type: "melee", mode: "melee",
    damage: 16, cooldown: 0.7, range: 92, knockback: 150,
    tier: 1, price: 18, pierce: 0, count: 1, spread: 0,
    color: "#cfd8ff", projShape: "slash", dpsMul: 1.45,
    arc: 2.0, blade: 0.7, swingTime: 0.2,
    scaling: { melee: 1 },
    desc: "An honest wide swing. Good damage, good reach, no tricks.",
  },
  spear: {
    id: "spear", name: "Spear", type: "melee", mode: "melee",
    damage: 22, cooldown: 0.85, range: 140, knockback: 190,
    tier: 1, price: 20, pierce: 0, count: 1, spread: 0,
    color: "#ffd9a0", projShape: "slash", dpsMul: 1.2,
    arc: 0.7, blade: 0.28, swingTime: 0.18,
    scaling: { melee: 1 },
    desc: "A narrow thrust with melee reach that rivals a pistol.",
  },
  hammer: {
    id: "hammer", name: "Hammer", type: "melee", mode: "melee",
    damage: 38, cooldown: 1.55, range: 96, knockback: 480,
    tier: 1, price: 24, pierce: 0, count: 1, spread: 0,
    color: "#ff9f6e", projShape: "slash", dpsMul: 1.5,
    arc: 2.4, blade: 0.85, swingTime: 0.28,
    scaling: { melee: 1 },
    desc: "Slow, enormous, and sends whatever survives flying.",
  },
  scythe: {
    id: "scythe", name: "Scythe", type: "melee", mode: "melee",
    damage: 19, cooldown: 0.95, range: 112, knockback: 110,
    tier: 1, price: 22, pierce: 0, count: 1, spread: 0,
    color: "#b6ff9c", projShape: "slash", dpsMul: 1.9,
    arc: 3.1, blade: 1.1, swingTime: 0.24,
    scaling: { melee: 1 },
    desc: "Reaps a near-full circle. Made for standing inside the swarm.",
  },
  chainsaw: {
    id: "chainsaw", name: "Chainsaw", type: "melee", mode: "melee",
    damage: 5, cooldown: 0.17, range: 74, knockback: 30,
    tier: 1, price: 20, pierce: 0, count: 1, spread: 0,
    color: "#ff6b6b", projShape: "slash", dpsMul: 1.25,
    arc: 1.2, blade: 0.55, swingTime: 0.1,
    scaling: { melee: 1 },
    desc: "Grinds constantly. Tiny hits, and life steal loves it.",
  },

  /* ---- ranged: travelling shots ---- */
  pistol: {
    id: "pistol", name: "Pistol", type: "ranged", mode: "gun",
    damage: 13, cooldown: 0.72, range: 390, knockback: 60,
    tier: 1, price: 10, pierce: 0, count: 1, spread: 0.03,
    color: "#ffe08a", projShape: "bullet", speed: 720, projR: 4, dpsMul: 1,
    scaling: { ranged: 1 },
    desc: "Reliable, cheap, accurate. The default answer to everything.",
  },
  smg: {
    id: "smg", name: "SMG", type: "ranged", mode: "gun",
    damage: 6, cooldown: 0.18, range: 310, knockback: 25,
    tier: 1, price: 16, pierce: 0, count: 1, spread: 0.16,
    color: "#ffd166", projShape: "bullet", speed: 780, projR: 3, dpsMul: 1,
    scaling: { ranged: 1 },
    desc: "Sprays fast and sloppy. Scales hard with flat damage.",
  },
  shotgun: {
    id: "shotgun", name: "Shotgun", type: "ranged", mode: "gun",
    damage: 6, cooldown: 1.0, range: 250, knockback: 120,
    tier: 1, price: 22, pierce: 0, count: 6, spread: 0.5,
    color: "#ffb457", projShape: "bullet", speed: 660, projR: 3.5, dpsMul: 1.0,
    scaling: { ranged: 1 },
    desc: "Six pellets in a cone. Devastating up close, wasted at range.",
  },
  sniper: {
    id: "sniper", name: "Sniper", type: "ranged", mode: "gun",
    damage: 48, cooldown: 1.8, range: 660, knockback: 200,
    tier: 1, price: 28, pierce: 3, count: 1, spread: 0,
    color: "#9be7ff", projShape: "shard", speed: 1500, projR: 4, dpsMul: 1.35,
    bonusCrit: 15,
    scaling: { ranged: 1 },
    desc: "Punches through a whole line. Full arena range, big crits.",
  },
  minigun: {
    id: "minigun", name: "Minigun", type: "ranged", mode: "gun",
    damage: 5, cooldown: 0.105, range: 340, knockback: 18,
    tier: 1, price: 26, pierce: 0, count: 1, spread: 0.22,
    color: "#ffe9b0", projShape: "bullet", speed: 820, projR: 3, dpsMul: 0.8,
    windup: 2.4, spinUp: 0.1, spinDown: 1.2,
    scaling: { ranged: 1 },
    desc: "Spins up while a target holds still, then never stops.",
  },
  rocket: {
    id: "rocket", name: "Rocket Launcher", type: "ranged", mode: "gun",
    damage: 28, cooldown: 2.0, range: 500, knockback: 60,
    tier: 1, price: 30, pierce: 0, count: 1, spread: 0.02,
    color: "#ff8360", projShape: "shard", speed: 300, projR: 6, dpsMul: 1.9,
    accel: 620, maxSpeed: 780, homing: { turn: 1.6, range: 260 },
    explode: { radius: 92, mul: 0.85, knockback: 320, color: "#ffb347" },
    explodeOnExpire: true,
    scaling: { ranged: 1 },
    desc: "Lazy seeking rocket, then a blast that clears a whole clump.",
  },
  crossbow: {
    id: "crossbow", name: "Crossbow", type: "ranged", mode: "gun",
    damage: 24, cooldown: 1.05, range: 470, knockback: 140,
    tier: 1, price: 20, pierce: 2, count: 1, spread: 0.01,
    color: "#d6c39a", projShape: "shard", speed: 940, projR: 4, dpsMul: 1.4,
    scaling: { ranged: 1 },
    desc: "A heavy bolt that skewers the two enemies behind the first.",
  },
  boomerang: {
    id: "boomerang", name: "Boomerang", type: "ranged", mode: "gun",
    damage: 15, cooldown: 1.15, range: 330, knockback: 90,
    tier: 1, price: 22, pierce: 99, count: 1, spread: 0.02,
    color: "#a0f0d0", projShape: "shard", speed: 620, projR: 8, dpsMul: 2.0,
    life: 2.2, projSpin: 16, boomerang: true, returnSpeed: 560,
    scaling: { ranged: 1 },
    desc: "Cuts everything on the way out and again on the way home.",
  },

  /* ---- elemental: scale on raw damage%, not melee/ranged ---- */
  flamethrower: {
    id: "flamethrower", name: "Flamethrower", type: "elemental", mode: "gun",
    damage: 4, cooldown: 0.14, range: 200, knockback: 10,
    tier: 1, price: 24, pierce: 2, count: 1, spread: 0.28,
    color: "#ff7a3d", projShape: "orb", speed: 330, projR: 7, dpsMul: 1.35,
    life: 0.55, drag: 2.2,
    pool: { every: 8, r: 44, life: 2.2, tick: 0.35, mul: 1.6, color: "#ff5a2b" },
    scaling: { damage: 1 },
    desc: "A short cone of fire that leaves burning ground behind it.",
  },
  lightning_rod: {
    id: "lightning_rod", name: "Lightning Rod", type: "elemental", mode: "gun",
    damage: 17, cooldown: 1.15, range: 350, knockback: 40,
    tier: 1, price: 26, pierce: 0, count: 1, spread: 0,
    color: "#8ad6ff", projShape: "shard", speed: 2000, projR: 4, dpsMul: 2.1,
    chain: { count: 3, range: 190, mul: 0.72 },
    scaling: { damage: 1 },
    desc: "Instant bolt that forks to three more bodies, weaker each jump.",
  },
  ice_wand: {
    id: "ice_wand", name: "Ice Wand", type: "elemental", mode: "gun",
    damage: 15, cooldown: 1.0, range: 340, knockback: 30,
    tier: 1, price: 24, pierce: 0, count: 1, spread: 0.02,
    color: "#9fe4ff", projShape: "orb", speed: 560, projR: 6, dpsMul: 1.8,
    area: { r: 62, life: 2.6, tick: 0.4, mul: 0.45, slow: 0.45, color: "#7ec8ff" },
    scaling: { damage: 1 },
    desc: "Shatters into a frost patch that chills whatever wanders in.",
  },

  /* ---- structures: engineering is their damage stat ---- */
  turret: {
    id: "turret", name: "Sentry Turret", type: "ranged", mode: "turret",
    damage: 10, cooldown: 0.5, range: 380, knockback: 40,
    tier: 1, price: 25, pierce: 0, count: 1, spread: 0.05,
    color: "#7ce0b0", projShape: "bullet", speed: 760, projR: 4, dpsMul: 1,
    leash: 300,
    scaling: { damage: 1, engineering: 1 },
    desc: "Plants itself and fires on its own. Scales with Engineering.",
  },
  sawblade: {
    id: "sawblade", name: "Orbital Saw", type: "melee", mode: "orbit",
    damage: 10, cooldown: 0.4, range: 90, knockback: 120,
    tier: 1, price: 24, pierce: 99, count: 1, spread: 0,
    color: "#c9d1ff", projShape: "shard", dpsMul: 0.9,
    orbitSpeed: 3.4,
    scaling: { damage: 1, engineering: 1 },
    desc: "A blade circling you forever. Range widens its orbit.",
  },
};

/* ------------------------------------------------------------- instancing */

function damageType(def) {
  if (def.scaling.melee) return "melee";
  if (def.scaling.ranged) return "ranged";
  return "elemental";
}

export function makeWeapon(defId, tier = 1) {
  const def = WEAPON_DEFS[defId];
  if (!def) throw new Error("unknown weapon: " + defId);
  const t = clamp(tier | 0, 1, 4);
  const i = t - 1;
  const cooldown = def.cooldown * TIER_COOLDOWN[i];
  return {
    ...def,
    defId,
    tier: t,
    damage: Math.max(1, Math.round(def.damage * TIER_DAMAGE[i])),
    cooldown,
    price: Math.round(def.price * TIER_PRICE[i]),
    dmgType: damageType(def),
    cd: 0, // seconds until this weapon may fire again
    cdMax: cooldown,
    aim: 0,
    spin: 0, // minigun spin-up, 0..1
    shots: 0,
    data: {},
  };
}

/* ---------------------------------------------------------------- firing */

export function updateWeapons(G, dt) {
  const stats = G.stats;
  const p = G.player;
  const list = G.weapons;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (w.cd > 0) w.cd -= dt;
    if (w.mode === "turret") {
      updateTurret(G, w, stats);
      continue;
    }
    if (w.mode === "orbit") {
      updateOrbit(G, w, stats);
      continue;
    }
    if (p.dead) continue;
    const reach = weaponReach(w, stats);
    const target = nearestEnemy(G, p.x, p.y, reach);
    if (!target) {
      if (w.windup) w.spin = Math.max(0, w.spin - dt * w.spinDown);
      continue;
    }
    w.aim = angleTo(p.x, p.y, target.x, target.y);
    if (w.cd > 0) continue;
    if (w.mode === "melee") fireMelee(G, w, stats, w.aim, reach);
    else fireGun(G, w, stats, p.x, p.y, w.aim, reach);
    w.cdMax = shotCooldown(w, stats);
    w.cd = w.cdMax;
  }
}

/** Effective reach in px after the Range stat. */
export function weaponReach(w, stats) {
  return w.range * (1 + stats.range / 100);
}

function shotCooldown(w, stats) {
  let cd = attackCooldown(w.cooldown, stats);
  if (w.windup) {
    // Spin-up: the first shots are sluggish, sustained fire is brutal.
    w.spin = Math.min(1, w.spin + w.spinUp);
    cd *= w.windup + (1 - w.windup) * w.spin;
  }
  return Math.max(0.02, cd);
}

// Structures ignore melee/ranged% and multiply by engineering instead.
function rollHit(w, stats, rng, mul) {
  const s = w.bonusCrit
    ? { ...stats, critChance: clamp(stats.critChance + w.bonusCrit, 0, 100) }
    : stats;
  let base = w.damage * (mul || 1);
  if (w.scaling.engineering) base *= 1 + stats.engineering / 100;
  return rollDamage(base, w.dmgType, s, rng);
}

function shotData(G, w) {
  return {
    knockback: w.knockback,
    dmgType: w.dmgType,
    explode: w.explode,
    explodeOnExpire: w.explodeOnExpire,
    chain: w.chain,
    area: w.area,
    homing: w.homing,
    accel: w.accel,
    maxSpeed: w.maxSpeed,
    drag: w.drag,
    spin: w.projSpin,
    boomerang: w.boomerang,
    returnSpeed: w.returnSpeed,
    anchor: w.boomerang ? G.player : null,
  };
}

function fireGun(G, w, stats, ox, oy, aim, reach) {
  const rng = G.rng;
  const speed = w.speed;
  const life = w.life || (reach / speed) * 1.12;
  const n = w.count;
  for (let i = 0; i < n; i++) {
    // Fan multi-shot evenly, then jitter everything by the weapon's spread.
    const fan = n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0;
    const a = aim + fan + rng.float(-1, 1) * w.spread * (n > 1 ? 0.12 : 0.5);
    const sp = speed * rng.float(0.94, 1.06);
    const hit = rollHit(w, stats, rng);
    spawnProjectile(G, {
      x: ox + Math.cos(a) * MUZZLE,
      y: oy + Math.sin(a) * MUZZLE,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: w.projR,
      damage: hit.amount,
      crit: hit.crit,
      pierce: w.pierce,
      life,
      color: w.color,
      shape: w.projShape,
      rot: a,
      data: shotData(G, w),
    });
  }
  G.addFx("muzzle", ox + Math.cos(aim) * MUZZLE, oy + Math.sin(aim) * MUZZLE, {
    angle: aim,
    color: w.color,
    r: 8 + n * 1.5,
  });
  if (w.pool) dropPool(G, w, stats, ox, oy, aim, reach);
}

// Flamethrower only: every Nth puff leaves a burning patch at the cone's tip.
function dropPool(G, w, stats, ox, oy, aim, reach) {
  w.shots++;
  if (w.shots % w.pool.every !== 0) return;
  const p = w.pool;
  const d = reach * 0.8;
  const hit = rollHit(w, stats, G.rng, p.mul);
  spawnProjectile(G, {
    x: clamp(ox + Math.cos(aim) * d, p.r, ARENA.w - p.r),
    y: clamp(oy + Math.sin(aim) * d, p.r, ARENA.h - p.r),
    r: p.r,
    damage: hit.amount,
    crit: hit.crit,
    life: p.life,
    color: p.color,
    shape: "orb",
    data: { behavior: "area", tick: p.tick, tickT: 0, knockback: 0 },
  });
}

function fireMelee(G, w, stats, aim, reach) {
  const hit = rollHit(w, stats, G.rng);
  // Sweeps leading edge first, matching how the renderer animates the wedge.
  const start = aim + w.arc / 2;
  spawnProjectile(G, {
    x: G.player.x,
    y: G.player.y,
    r: reach,
    damage: hit.amount,
    crit: hit.crit,
    pierce: 0,
    life: w.swingTime,
    color: w.color,
    shape: "slash",
    rot: aim,
    data: {
      behavior: "slash",
      anchor: G.player,
      start,
      sweep: -w.arc,
      arc: w.arc,
      blade: w.blade,
      reach,
      knockback: w.knockback,
      dmgType: w.dmgType,
    },
  });
  G.addFx("swing", G.player.x, G.player.y, {
    angle: aim,
    arc: w.arc,
    r: reach,
    color: w.color,
  });
}

/* ------------------------------------------------------------- structures */

// The turret is a real thing in the world: it stays where it was planted and
// only redeploys when the player has walked out of its leash.
function updateTurret(G, w, stats) {
  const p = G.player;
  let b = w.data.beacon;
  if (b && (b.dead || b.data.wave !== G.wave)) b = null;
  if (!b || dist2(b.x, b.y, p.x, p.y) > w.leash * w.leash) {
    if (b) b.dead = true;
    b = w.data.beacon = spawnProjectile(G, {
      x: clamp(p.x, 24, ARENA.w - 24),
      y: clamp(p.y, 24, ARENA.h - 24),
      r: 13,
      damage: 0,
      life: 1,
      color: w.color,
      shape: "orb",
      data: { behavior: "beacon", wave: G.wave },
    });
    G.addFx("muzzle", b.x, b.y, { angle: 0, color: w.color, r: 20 });
  }
  b.life = 1; // refreshed every frame; an orphaned beacon fades out on its own
  if (w.cd > 0) return;
  const reach = weaponReach(w, stats);
  const target = nearestEnemy(G, b.x, b.y, reach);
  if (!target) return;
  w.aim = angleTo(b.x, b.y, target.x, target.y);
  fireGun(G, w, stats, b.x, b.y, w.aim, reach);
  w.cdMax = shotCooldown(w, stats);
  w.cd = w.cdMax;
}

// The saw orbits forever; its "attack" is re-rolling damage and re-arming the
// blade, which is what lets the same blade bite the same enemy again.
function updateOrbit(G, w, stats) {
  const p = G.player;
  let blade = w.data.blade;
  if (blade && (blade.dead || blade.data.wave !== G.wave)) blade = null;
  if (!blade) {
    blade = w.data.blade = spawnProjectile(G, {
      x: p.x,
      y: p.y,
      r: 15,
      damage: 1,
      pierce: 99,
      life: 1,
      color: w.color,
      shape: w.projShape,
      data: {
        behavior: "orbit",
        anchor: p,
        angle: G.rng.float(0, TAU),
        speed: w.orbitSpeed,
        radius: weaponReach(w, stats),
        knockback: w.knockback,
        wave: G.wave,
      },
    });
  }
  blade.life = 1;
  blade.data.radius = weaponReach(w, stats);
  if (w.cd > 0) return;
  const hit = rollHit(w, stats, G.rng);
  blade.damage = hit.amount;
  blade.crit = hit.crit;
  blade.hitSet.clear();
  w.cdMax = shotCooldown(w, stats);
  w.cd = w.cdMax;
}

/* ---------------------------------------------------------------- tooltip */

function scaledHit(w, stats) {
  let pct = stats.damage || 0;
  if (w.dmgType === "melee") pct += stats.meleeDamage || 0;
  else if (w.dmgType === "ranged") pct += stats.rangedDamage || 0;
  let hit = w.damage * (1 + pct / 100);
  if (w.scaling && w.scaling.engineering) hit *= 1 + (stats.engineering || 0) / 100;
  return { hit, pct };
}

/** Typical non-crit hit after Damage / type / Engineering, as the UI shows. */
export function weaponHit(w, stats) {
  return Math.max(1, Math.round(scaledHit(w, stats).hit));
}

/** Sustained damage per second, as the shop shows it. */
export function weaponDps(w, stats) {
  let hit = scaledHit(w, stats).hit;
  const crit = clamp((stats.critChance || 0) + (w.bonusCrit || 0), 0, 100);
  hit *= 1 + crit / 100; // crits double, so crit% is a straight multiplier
  const cd = Math.max(0.02, attackCooldown(w.cooldown, stats));
  // dpsMul folds in what a single rolled hit cannot express: pellets that miss
  // at range, arcs that catch several bodies, splash, chains and pierce.
  const dps = ((hit * w.count) / cd) * (w.dpsMul || 1);
  return Math.round(dps * 10) / 10;
}

/** Numbers and copy for a weapon tooltip. */
export function weaponBreakdown(w, stats) {
  const s = stats || {};
  const { hit, pct } = scaledHit(w, s);
  const rounded = Math.max(1, Math.round(hit));
  const crit = clamp((s.critChance || 0) + (w.bonusCrit || 0), 0, 100);
  const cd = Math.max(0.02, attackCooldown(w.cooldown, s));
  const rate = 1 / cd;
  const dps = weaponDps(w, s);
  let pctLabel = "Damage";
  if (w.dmgType === "melee") pctLabel = "Damage+Melee";
  else if (w.dmgType === "ranged") pctLabel = "Damage+Ranged";
  const bits = [];
  if (pct || (w.scaling && w.scaling.engineering && s.engineering)) {
    bits.push("hit = " + w.damage + " × (1 + " + (Math.round(pct * 10) / 10) + "% " + pctLabel + ")");
    if (w.scaling && w.scaling.engineering) {
      bits.push("× (1 + " + (Math.round((s.engineering || 0) * 10) / 10) + "% Engineering)");
    }
    bits.push("= " + rounded);
  } else {
    bits.push("hit = " + rounded);
  }
  const math = [
    (w.count > 1 ? w.count + " pellets × " : "") + (Math.round(rate * 10) / 10) + "/s",
    "crit " + (Math.round(crit * 10) / 10) + "% → expected ×" + (Math.round((1 + crit / 100) * 100) / 100),
    (w.dpsMul && w.dpsMul !== 1 ? "cleave/splash ×" + w.dpsMul + "  →  " : "") + dps + " dps",
  ].join("\n");
  return {
    title: (w.name || "Weapon") + "  ·  T" + (w.tier || 1),
    blurb: w.desc || "",
    formula: bits.join(" "),
    math,
    hit: rounded,
    dps,
    cd,
    crit,
  };
}

/* ---------------------------------------------------------------- helpers */

function nearestEnemy(G, x, y, reach) {
  if (!G.grid) return null;
  const list = G.grid.query(x, y, reach);
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    const lim = reach + e.r;
    if (d < bestD && d <= lim * lim) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
