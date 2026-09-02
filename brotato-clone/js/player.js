// The player entity: movement, regeneration, invulnerability windows, leveling.

import { ARENA, confine, dist2, compact } from "./core.js";
import { moveSpeed, applyArmor, xpForLevel } from "./stats.js";

export const IFRAME_TIME = 0.45; // seconds of mercy after taking a hit
// Kills land at weapon range, so the sweep has to reach comfortably past the
// player's body. Leftover floor loot only pays half at wave end. Harvesting
// widens the magnet.
const PICKUP_BASE_RANGE = 95;
const MAGNET_SPEED = 620;

export function createPlayer() {
  return {
    kind: "player",
    x: ARENA.w / 2,
    y: ARENA.h / 2,
    vx: 0,
    vy: 0,
    r: 14,
    hp: 10,
    iframes: 0,
    facing: 0,
    dead: false,
    regenCarry: 0, // fractional hp banked between frames
  };
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const s = G.stats;

  const ax = G.input.axis();
  const spd = moveSpeed(s);
  p.vx = ax.x * spd;
  p.vy = ax.y * spd;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  confine(p);

  if (ax.x !== 0 || ax.y !== 0) p.facing = Math.atan2(ax.y, ax.x);
  if (p.iframes > 0) p.iframes -= dt;

  // Regen accrues fractionally so small hpRegen values still tick eventually.
  if (s.hpRegen > 0 && p.hp < s.maxHp) {
    p.regenCarry += s.hpRegen * dt;
    if (p.regenCarry >= 1) {
      const whole = Math.floor(p.regenCarry);
      p.regenCarry -= whole;
      healPlayer(G, whole);
    }
  }

  updatePickups(G, dt);
}

export function healPlayer(G, amount) {
  const p = G.player;
  const before = p.hp;
  p.hp = Math.min(G.stats.maxHp, p.hp + amount);
  return p.hp - before;
}

/**
 * Damage the player. Honors i-frames, dodge and armor in that order.
 * Returns the damage actually taken (0 if it was avoided).
 */
export function hurtPlayer(G, raw) {
  const p = G.player;
  if (p.dead || p.iframes > 0 || G.phase !== "wave") return 0;

  if (G.rng.chance(G.stats.dodge / 100)) {
    G.addFx("dodge", p.x, p.y - 20, {});
    p.iframes = IFRAME_TIME * 0.5;
    return 0;
  }

  const taken = applyArmor(raw, G.stats.armor);
  p.hp -= taken;
  p.iframes = IFRAME_TIME;
  G.addFx("playerHit", p.x, p.y, { amount: taken });
  G.addFx("shake", p.x, p.y, { power: Math.min(14, 4 + taken) });

  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    G.bus.emit("playerDied", null);
  }
  return taken;
}

/* --------------------------------------------------------------- pickups */

export function spawnPickup(G, x, y, type, value) {
  const pk = {
    kind: "pickup",
    type,
    x,
    y,
    // A little scatter so a cluster of drops doesn't land on one pixel.
    vx: G.rng.float(-70, 70),
    vy: G.rng.float(-70, 70),
    r: type === "crate" ? 12 : 7,
    value,
    magnet: false,
    dead: false,
  };
  G.pickups.push(pk);
  return pk;
}

function updatePickups(G, dt) {
  const p = G.player;
  const range = PICKUP_BASE_RANGE + G.stats.harvesting * 0.6;
  const r2 = range * range;

  for (const pk of G.pickups) {
    if (pk.dead) continue;

    // Drift-and-settle until the player comes close, then home in hard.
    if (!pk.magnet && dist2(pk.x, pk.y, p.x, p.y) < r2) pk.magnet = true;

    if (pk.magnet) {
      const dx = p.x - pk.x,
        dy = p.y - pk.y;
      const m = Math.hypot(dx, dy) || 1;
      pk.vx = (dx / m) * MAGNET_SPEED;
      pk.vy = (dy / m) * MAGNET_SPEED;
    } else {
      pk.vx *= 1 - 3 * dt;
      pk.vy *= 1 - 3 * dt;
    }

    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    confine(pk);

    const rr = pk.r + p.r;
    if (dist2(pk.x, pk.y, p.x, p.y) <= rr * rr) {
      collect(G, pk);
      pk.dead = true;
    }
  }
  compact(G.pickups);
}

function collect(G, pk) {
  switch (pk.type) {
    case "material":
      G.grantMaterials(pk.value);
      break;
    case "xp":
      G.grantXp(pk.value);
      break;
    case "heal":
      healPlayer(G, pk.value);
      G.addFx("heal", G.player.x, G.player.y, { amount: pk.value });
      break;
    case "crate":
      // Crates are a burst of everything at once — the wave's little jackpot.
      G.grantMaterials(pk.value);
      G.grantXp(Math.ceil(pk.value / 2));
      break;
  }
  G.addFx("pickup", pk.x, pk.y, { type: pk.type });
}

/* ---------------------------------------------------------------- leveling */

export function grantXp(G, amount) {
  G.xp += amount;
  let leveled = false;
  while (G.xp >= xpForLevel(G.level)) {
    G.xp -= xpForLevel(G.level);
    G.level += 1;
    leveled = true;
    G.pendingLevelUps += 1;
  }
  if (leveled) {
    G.addFx("levelup", G.player.x, G.player.y, {});
    G.bus.emit("levelUp", G.level);
  }
}
