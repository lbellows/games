// Enemy roster, AI kinds, and death drops.
//
// Enemies are persistent attackers: contact re-arms a per-enemy touch cooldown
// instead of consuming the enemy, so a crowd that reaches the player keeps
// hurting until it is cleared. Every enemy also pushes away from its neighbours
// each frame -- without that a wave collapses into one overlapping blob and the
// whole game reads as a single big sprite.

import { ARENA, TAU, clamp, lerp, dist, dist2, norm, confine } from "./core.js";

/* ---------------------------------------------------------------- scaling */

// The entire difficulty curve lives here. Multipliers are baked in at spawn
// time so an enemy keeps the numbers of the wave that produced it (a wave-3
// mite that survives into the shop transition never retroactively gets tougher).
export const SCALING = {
  hpLinear: 0.25,     // per wave, linear part of the hp curve
  hpQuad: 0.018,      // per wave squared -- makes waves 12+ actually bite
  bossHpLinear: 0.42, // bosses ramp harder; player dps grows faster than mob hp
  bossHpQuad: 0.03,
  damageLinear: 0.11, // contact damage grows slowly: armor/dodge must stay useful
  speedLinear: 0.012, // speed barely moves, otherwise kiting stops working
  speedMax: 1.3,
  matsLinear: 0.055,
  xpLinear: 0.07,
  eliteStart: 3,
  eliteBase: 0.02,
  eliteGrow: 0.012,
  eliteMax: 0.16,
};

// Elite modifiers. Elites are a spike of hp and reward, not of speed -- a fast
// elite is unfair, a fat one is a target you have to commit to.
const ELITE = { hp: 3.2, damage: 1.45, radius: 1.35, speed: 0.92, mats: 3.5, xp: 2.6 };

const HARD_CAP = 240; // absolute entity ceiling; splitters/bosses respect it

export function hpScale(wave) {
  const w = Math.max(0, wave - 1);
  return 1 + SCALING.hpLinear * w + SCALING.hpQuad * w * w;
}

export function bossHpScale(wave) {
  const w = Math.max(0, wave - 1);
  return 1 + SCALING.bossHpLinear * w + SCALING.bossHpQuad * w * w;
}

export function damageScale(wave) {
  return 1 + SCALING.damageLinear * Math.max(0, wave - 1);
}

export function speedScale(wave) {
  return Math.min(SCALING.speedMax, 1 + SCALING.speedLinear * Math.max(0, wave - 1));
}

export function eliteChance(wave) {
  if (wave < SCALING.eliteStart) return 0;
  return clamp(SCALING.eliteBase + SCALING.eliteGrow * (wave - SCALING.eliteStart), 0, SCALING.eliteMax);
}

/* ------------------------------------------------------------------ roster */

// `cost` is the spawn-point price paid by the wave director, `minWave` the
// unlock, `weight` the relative roll chance once unlocked. `data` is per-AI
// tuning that gets cloned onto every instance.
export const ENEMY_TYPES = {
  /* ------------------------------------------------------------- tier 1 */
  mite: {
    id: "mite", name: "Mite", tier: 1, ai: "chase",
    color: "#7ec850", shape: "blob",
    hp: 6, damage: 2, speed: 62, r: 10, xp: 1, mats: 1,
    cost: 1, minWave: 1, weight: 10, pack: [2, 4],
    data: { agility: 9, seatR: 26, wobRate: 2.2, touchRate: 0.6 },
  },
  runner: {
    id: "runner", name: "Runner", tier: 1, ai: "chase",
    color: "#f2a33c", shape: "triangle",
    hp: 4, damage: 2, speed: 122, r: 8, xp: 1, mats: 1,
    cost: 1.5, minWave: 1, weight: 7, pack: [2, 3],
    data: { agility: 6, seatR: 18, wobRate: 3.4, touchRate: 0.55 },
  },
  grub: {
    id: "grub", name: "Grub", tier: 1, ai: "chase",
    color: "#a4703c", shape: "square",
    hp: 15, damage: 3, speed: 44, r: 14, xp: 2, mats: 1,
    cost: 2, minWave: 1, weight: 5, pack: [1, 3],
    data: { agility: 5, seatR: 30, wobRate: 1.3, touchRate: 0.75, shove: 0.55 },
  },
  hopper: {
    id: "hopper", name: "Hopper", tier: 1, ai: "orbiter",
    color: "#59c7d8", shape: "ring",
    hp: 7, damage: 2, speed: 98, r: 9, xp: 1, mats: 1,
    cost: 1.5, minWave: 2, weight: 6, pack: [2, 3],
    data: { orbitR: 120, agility: 7, lungeEvery: 2.6, lungeTime: 0.45, lungeSpeed: 1.9, touchRate: 0.55 },
  },

  /* ------------------------------------------------------------- tier 2 */
  rammer: {
    id: "rammer", name: "Rammer", tier: 2, ai: "charger",
    color: "#e05a4f", shape: "spike",
    hp: 17, damage: 4, speed: 70, r: 13, xp: 3, mats: 2,
    cost: 3, minWave: 3, weight: 7, pack: [1, 2],
    data: {
      agility: 6, chargeRange: 240, windup: 0.55, dashSpeed: 430,
      dashTime: 0.42, restTime: 0.55, cooldown: 1.1, touchRate: 0.5,
    },
  },
  spitter: {
    id: "spitter", name: "Spitter", tier: 2, ai: "shooter",
    color: "#c86bd8", shape: "blob",
    hp: 11, damage: 3, speed: 58, r: 11, xp: 3, mats: 2,
    cost: 3, minWave: 3, weight: 6, pack: [1, 2],
    data: {
      agility: 6, preferred: 250, fireRate: 2.0, shots: 1, spread: 0,
      shotSpeed: 200, shotR: 6, shotLife: 2.4, shotMul: 0.8,
      shotColor: "#e6a2ff", shotShape: "orb", touchRate: 0.7,
    },
  },
  brute: {
    id: "brute", name: "Brute", tier: 2, ai: "chase",
    color: "#6d6f8a", shape: "square",
    hp: 36, damage: 5, speed: 52, r: 17, xp: 4, mats: 2,
    cost: 4, minWave: 4, weight: 5, pack: [1, 2],
    data: { agility: 4.5, seatR: 34, wobRate: 1.0, touchRate: 0.8, shove: 0.4 },
  },
  wisp: {
    id: "wisp", name: "Wisp", tier: 2, ai: "orbiter",
    color: "#ffe27a", shape: "ring",
    hp: 9, damage: 3, speed: 134, r: 8, xp: 2, mats: 1,
    cost: 2.5, minWave: 4, weight: 4, pack: [2, 3],
    data: { orbitR: 90, agility: 9, lungeEvery: 1.8, lungeTime: 0.35, lungeSpeed: 2.1, touchRate: 0.5 },
  },

  /* ------------------------------------------------------------- tier 3 */
  cyst: {
    id: "cyst", name: "Cyst", tier: 3, ai: "splitter",
    color: "#8ee6b0", shape: "blob",
    hp: 28, damage: 4, speed: 52, r: 15, xp: 4, mats: 3,
    cost: 4.5, minWave: 6, weight: 5, pack: [1, 2],
    data: { agility: 5, seatR: 28, wobRate: 1.6, child: "spawnling", childCount: 3, childScale: 0.85, touchRate: 0.7 },
  },
  spawnling: {
    id: "spawnling", name: "Spawnling", tier: 1, ai: "chase",
    color: "#b9f5d0", shape: "blob",
    hp: 5, damage: 2, speed: 104, r: 7, xp: 1, mats: 1,
    cost: 1, minWave: 99, weight: 0, // only ever born from a splitter
    data: { agility: 8, seatR: 16, wobRate: 3.0, touchRate: 0.55 },
  },
  lancer: {
    id: "lancer", name: "Lancer", tier: 3, ai: "charger",
    color: "#ff8ac4", shape: "triangle",
    hp: 24, damage: 6, speed: 76, r: 12, xp: 4, mats: 2,
    cost: 4, minWave: 7, weight: 5, pack: [1, 2],
    data: {
      agility: 6, chargeRange: 380, windup: 0.65, dashSpeed: 620,
      dashTime: 0.6, restTime: 0.7, cooldown: 1.4, touchRate: 0.5,
    },
  },
  hexer: {
    id: "hexer", name: "Hexer", tier: 3, ai: "shooter",
    color: "#9d7bff", shape: "spike",
    hp: 22, damage: 4, speed: 54, r: 12, xp: 5, mats: 3,
    cost: 5, minWave: 8, weight: 5, pack: [1, 2],
    data: {
      agility: 6, preferred: 290, fireRate: 2.4, shots: 3, spread: 0.34,
      shotSpeed: 215, shotR: 6, shotLife: 2.6, shotMul: 0.7,
      shotColor: "#c9b6ff", shotShape: "shard", touchRate: 0.7,
    },
  },
  sentinel: {
    id: "sentinel", name: "Sentinel", tier: 3, ai: "orbiter",
    color: "#4fd1a5", shape: "square",
    hp: 32, damage: 4, speed: 88, r: 12, xp: 5, mats: 3,
    cost: 5, minWave: 9, weight: 4, pack: [1, 2],
    data: {
      orbitR: 200, agility: 6, lungeEvery: 0, fireRate: 1.8, shots: 1,
      spread: 0, shotSpeed: 250, shotR: 6, shotLife: 2.2, shotMul: 0.75,
      shotColor: "#9ff0d4", shotShape: "bullet", touchRate: 0.65,
    },
  },

  /* ------------------------------------------------------------- tier 4 */
  juggernaut: {
    id: "juggernaut", name: "Juggernaut", tier: 4, ai: "chase",
    color: "#d94f6a", shape: "square",
    hp: 95, damage: 8, speed: 46, r: 22, xp: 10, mats: 5,
    cost: 9, minWave: 11, weight: 3, pack: [1, 1],
    data: { agility: 3.5, seatR: 36, wobRate: 0.8, touchRate: 0.9, shove: 0.2 },
  },
  warden: {
    id: "warden", name: "Warden", tier: 4, ai: "shooter",
    color: "#ffd166", shape: "ring",
    hp: 48, damage: 5, speed: 50, r: 15, xp: 8, mats: 4,
    cost: 7, minWave: 12, weight: 4, pack: [1, 1],
    data: {
      agility: 5, preferred: 320, fireRate: 3.0, shots: 10, spread: TAU,
      shotSpeed: 150, shotR: 7, shotLife: 3.2, shotMul: 0.6,
      shotColor: "#ffe9a8", shotShape: "orb", touchRate: 0.7,
    },
  },
  ripper: {
    id: "ripper", name: "Ripper", tier: 4, ai: "charger",
    color: "#ff5f3a", shape: "spike",
    hp: 40, damage: 7, speed: 94, r: 12, xp: 8, mats: 4,
    cost: 7, minWave: 13, weight: 4, pack: [1, 2],
    data: {
      agility: 7, chargeRange: 300, windup: 0.34, dashSpeed: 560,
      dashTime: 0.3, restTime: 0.2, cooldown: 0.35, touchRate: 0.45,
    },
  },
  nucleus: {
    id: "nucleus", name: "Nucleus", tier: 4, ai: "splitter",
    color: "#64ffda", shape: "blob",
    hp: 74, damage: 6, speed: 44, r: 19, xp: 10, mats: 5,
    cost: 9, minWave: 14, weight: 3, pack: [1, 1],
    data: { agility: 4, seatR: 32, wobRate: 1.2, child: "cyst", childCount: 2, childScale: 0.7, touchRate: 0.8, shove: 0.3 },
  },

  /* -------------------------------------------------------------- bosses */
  bramble_king: {
    id: "bramble_king", name: "Bramble King", tier: 4, ai: "boss", boss: true,
    color: "#b8ff5c", shape: "blob",
    hp: 200, damage: 9, speed: 66, r: 34, xp: 60, mats: 40,
    cost: 0, minWave: 99, weight: 0,
    data: {
      agility: 3.2, touchRate: 0.7, shove: 0.03,
      windup: 0.7, dashSpeed: 520, dashTime: 0.55, restTime: 0.8,
      adds: ["mite", "runner", "spawnling"], addRate: 0.45, addScale: 0.8,
      burstCount: 12, burstInterval: 0.55, burstSpin: 0.42,
      shotSpeed: 165, shotR: 8, shotLife: 3.4, shotMul: 0.55,
      shotColor: "#dcff9e", shotShape: "shard",
      // Entry modes per phase; "windup" chains into dash then recover itself.
      phases: [
        ["advance", "summon", "advance", "windup"],
        ["advance", "summon", "windup", "burst", "advance"],
        ["windup", "burst", "summon", "windup", "burst"],
      ],
      modeTime: [2.4, 2.6, 2.2],
    },
  },
  iron_maw: {
    id: "iron_maw", name: "Iron Maw", tier: 4, ai: "boss", boss: true,
    color: "#ff6b6b", shape: "spike",
    hp: 300, damage: 12, speed: 74, r: 38, xp: 90, mats: 60,
    cost: 0, minWave: 99, weight: 0,
    data: {
      agility: 3.6, touchRate: 0.65, shove: 0.02,
      windup: 0.5, dashSpeed: 700, dashTime: 0.55, restTime: 0.55,
      adds: ["rammer", "brute", "wisp"], addRate: 0.7, addScale: 0.85,
      burstCount: 2, burstInterval: 0.1, burstSpin: 0.5, // 2 spiral arms, fast ticks
      shotSpeed: 195, shotR: 8, shotLife: 3.6, shotMul: 0.5,
      shotColor: "#ffb0a0", shotShape: "orb",
      phases: [
        ["advance", "windup", "advance", "burst"],
        ["windup", "windup", "burst", "summon", "advance"],
        ["windup", "burst", "windup", "summon", "burst"],
      ],
      modeTime: [2.2, 2.0, 1.8],
    },
  },
};

/** Ids of every type the wave director may roll at `wave`. */
export function unlockedTypes(wave) {
  const out = [];
  for (const id in ENEMY_TYPES) {
    const def = ENEMY_TYPES[id];
    if (def.boss || def.weight <= 0) continue;
    if (wave >= def.minWave) out.push(id);
  }
  return out;
}

/* ------------------------------------------------------------------ spawn */

/**
 * Push a new enemy onto `G.enemies` and return it.
 * `opts`: { elite, scale, silent, wave } -- `scale` is a flat hp/damage
 * multiplier used for splitter children and boss adds so they are not
 * full-price mobs; `wave` overrides the scaling tier when the caller knows the
 * wave before `G.wave` has been advanced.
 */
export function spawnEnemy(G, typeId, x, y, opts = {}) {
  const def = ENEMY_TYPES[typeId] || ENEMY_TYPES.mite;
  if (G.enemies.length >= HARD_CAP) return null;

  const wave = opts.wave ?? G.wave ?? 1;
  const rng = G.rng;
  const scale = opts.scale ?? 1;
  const elite = opts.elite ?? (!def.boss && rng.chance(eliteChance(wave)));

  const hpMul = (def.boss ? bossHpScale(wave) : hpScale(wave)) * scale * (elite ? ELITE.hp : 1);
  const dmgMul = damageScale(wave) * scale * (elite ? ELITE.damage : 1);
  const spdMul = speedScale(wave) * (elite ? ELITE.speed : 1);
  const hp = Math.max(1, Math.round(def.hp * hpMul));

  const data = { ...def.data };
  data.touchRate = def.data.touchRate ?? 0.6;
  data.touchCd = 0;
  data.recoil = 0;
  data.shove = def.data.shove ?? 1;
  data.seatAng = rng.float(0, TAU);
  data.wob = rng.float(0, TAU);
  data.dir = rng.chance(0.5) ? 1 : -1;
  data.fireCd = rng.float(0.4, 1.4);
  data.state = "stalk";
  data.timer = 0;
  data.stateCd = rng.float(0, 0.6);
  data.aimX = 0;
  data.aimY = 0;
  data.dropped = false;
  if (def.ai === "orbiter") {
    data.orbitR = def.data.orbitR * rng.float(0.85, 1.15);
    data.lungeCd = rng.float(0.8, def.data.lungeEvery || 2);
  }
  if (def.ai === "boss") {
    data.mode = "advance";
    data.modeT = 1.2;
    data.step = 0;
    data.phase = 0;
    data.tick = 0;
    data.burstAng = rng.float(0, TAU);
  }

  const e = {
    kind: "enemy",
    type: def.id,
    x, y,
    vx: 0, vy: 0,
    r: def.r * (elite ? ELITE.radius : 1) * (scale < 1 ? 0.82 : 1),
    hp,
    maxHp: hp,
    speed: def.speed * spdMul,
    damage: Math.max(1, Math.round(def.damage * dmgMul)),
    xp: Math.max(1, Math.round(def.xp * (1 + SCALING.xpLinear * (wave - 1)) * (elite ? ELITE.xp : 1) * scale)),
    mats: Math.max(0, Math.round(def.mats * (1 + SCALING.matsLinear * (wave - 1)) * (elite ? ELITE.mats : 1) * scale)),
    color: def.color,
    shape: def.shape,
    elite,
    hitFlash: 0,
    dead: false,
    ai: def.ai,
    data,
  };
  confine(e);
  G.enemies.push(e);
  if (!opts.silent) {
    G.addFx?.("ring", e.x, e.y, { color: e.color, r: e.r * 0.6, r1: e.r * 2.2, life: 0.28 });
  }
  return e;
}

/* -------------------------------------------------------------- AI helpers */

// Exponential smoothing keeps steering framerate-independent.
function steer(e, tx, ty, speed, agility, dt) {
  const d = norm(tx - e.x, ty - e.y);
  const k = 1 - Math.exp(-agility * dt);
  e.vx = lerp(e.vx, d.x * speed, k);
  e.vy = lerp(e.vy, d.y * speed, k);
}

function brake(e, agility, dt) {
  const k = 1 - Math.exp(-agility * dt);
  e.vx = lerp(e.vx, 0, k);
  e.vy = lerp(e.vy, 0, k);
}

// A pack converges on offset seats around the player rather than on the exact
// centre, so it wraps instead of forming a single-file conga line.
function seatPoint(G, e, dt) {
  const p = G.player;
  const d = e.data;
  d.wob += (d.wobRate || 1.5) * dt;
  const gap = dist(e.x, e.y, p.x, p.y);
  const seat = Math.min(d.seatR || 24, gap * 0.5);
  const ang = d.seatAng + Math.sin(d.wob) * 0.55;
  return { x: p.x + Math.cos(ang) * seat, y: p.y + Math.sin(ang) * seat };
}

function fireShot(G, e, ang, opts = {}) {
  const d = e.data;
  const speed = opts.speed ?? d.shotSpeed ?? 200;
  const life = opts.life ?? d.shotLife ?? 2.5;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  G.spawnHazard?.({
    x: e.x + cos * (e.r + 6),
    y: e.y + sin * (e.r + 6),
    vx: cos * speed,
    vy: sin * speed,
    r: opts.r ?? d.shotR ?? 6,
    damage: Math.max(1, Math.round(e.damage * (opts.mul ?? d.shotMul ?? 0.75))),
    life,
    maxLife: life,
    color: opts.color ?? d.shotColor ?? e.color,
    shape: opts.shape ?? d.shotShape ?? "orb",
    hostile: true,
    pierce: 0,
    crit: false,
  });
}

function volley(G, e) {
  const d = e.data;
  const p = G.player;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  const n = d.shots || 1;
  const spread = d.spread || 0;
  if (spread >= TAU - 0.01) {
    // Radial burst (warden): evenly spaced, offset each time so gaps move.
    const off = G.rng.float(0, TAU / n);
    for (let i = 0; i < n; i++) fireShot(G, e, off + (TAU / n) * i);
  } else {
    const step = n > 1 ? spread / (n - 1) : 0;
    const start = base - spread / 2;
    for (let i = 0; i < n; i++) fireShot(G, e, start + step * i);
  }
  G.addFx?.("spark", e.x, e.y, { color: d.shotColor || e.color, count: 5, r: e.r * 1.6 });
}

// White strobe during a wind-up. hitFlash is the one telegraph channel every
// renderer is guaranteed to honour, so charges read even before FX land.
function telegraph(e, dt) {
  const d = e.data;
  d.tele = (d.tele || 0) - dt;
  if (d.tele <= 0) {
    e.hitFlash = Math.max(e.hitFlash, 0.07);
    d.tele = 0.14;
  }
}

/* -------------------------------------------------------------- AI kinds */

function aiChase(G, e, dt) {
  const d = e.data;
  const p = G.player;
  if (d.recoil > 0) {
    // Bounce back after landing a hit so melee mobs pulse instead of grinding.
    steer(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.75, 10, dt);
    return;
  }
  const t = seatPoint(G, e, dt);
  steer(e, t.x, t.y, e.speed, d.agility || 6, dt);
}

function aiCharger(G, e, dt) {
  const d = e.data;
  const p = G.player;
  d.timer -= dt;
  switch (d.state) {
    case "stalk": {
      d.stateCd -= dt;
      const gap = dist(e.x, e.y, p.x, p.y);
      if (d.stateCd <= 0 && gap < d.chargeRange && gap > e.r + p.r) {
        d.state = "windup";
        d.timer = d.windup;
        // Aim is locked when the wind-up starts, not when it ends -- that is
        // what makes a charge dodgeable instead of a homing missile.
        const a = norm(p.x - e.x, p.y - e.y);
        d.aimX = a.x;
        d.aimY = a.y;
        G.addFx?.("telegraph", e.x, e.y, { color: e.color, r: e.r * 2.6, life: d.windup, width: 3 });
      } else {
        const t = seatPoint(G, e, dt);
        steer(e, t.x, t.y, e.speed, d.agility || 6, dt);
      }
      break;
    }
    case "windup":
      telegraph(e, dt);
      brake(e, 9, dt);
      // Small backstep sells the wind-up.
      e.vx -= d.aimX * 40 * dt;
      e.vy -= d.aimY * 40 * dt;
      if (d.timer <= 0) {
        d.state = "dash";
        d.timer = d.dashTime;
        e.vx = d.aimX * d.dashSpeed;
        e.vy = d.aimY * d.dashSpeed;
        G.addFx?.("spark", e.x, e.y, { color: e.color, count: 8, r: e.r * 2 });
      }
      break;
    case "dash": {
      const drag = 1 - Math.exp(-1.4 * dt);
      e.vx = lerp(e.vx, d.aimX * d.dashSpeed * 0.6, drag);
      e.vy = lerp(e.vy, d.aimY * d.dashSpeed * 0.6, drag);
      const wall =
        e.x <= e.r + 0.5 || e.x >= ARENA.w - e.r - 0.5 ||
        e.y <= e.r + 0.5 || e.y >= ARENA.h - e.r - 0.5;
      if (d.timer <= 0 || wall) {
        d.state = "rest";
        d.timer = wall ? d.restTime * 1.6 : d.restTime;
        if (wall) G.addFx?.("burst", e.x, e.y, { color: e.color, count: 8, r: e.r });
      }
      break;
    }
    default:
      brake(e, 7, dt);
      if (d.timer <= 0) {
        d.state = "stalk";
        d.stateCd = d.cooldown;
      }
  }
}

function aiShooter(G, e, dt) {
  const d = e.data;
  const p = G.player;
  const gap = dist(e.x, e.y, p.x, p.y);
  const want = d.preferred || 260;
  if (gap < want * 0.75) {
    steer(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed, d.agility || 6, dt); // kite out
  } else if (gap > want * 1.2) {
    steer(e, p.x, p.y, e.speed, d.agility || 6, dt);
  } else {
    d.stateCd -= dt;
    if (d.stateCd <= 0) {
      d.dir = -d.dir;
      d.stateCd = G.rng.float(1.2, 2.4);
    }
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    steer(e, e.x - Math.sin(a) * 80 * d.dir, e.y + Math.cos(a) * 80 * d.dir, e.speed * 0.8, d.agility || 6, dt);
  }
  d.fireCd -= dt;
  if (d.fireCd <= 0 && gap < want * 2) {
    d.fireCd = d.fireRate * G.rng.float(0.85, 1.15);
    volley(G, e);
  }
}

function aiOrbiter(G, e, dt) {
  const d = e.data;
  const p = G.player;
  const dx = e.x - p.x, dy = e.y - p.y;
  const gap = Math.max(1, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx);

  if (d.lungeEvery > 0) {
    d.lungeCd -= dt;
    if (d.state === "lunge") {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.state = "orbit";
        d.lungeCd = d.lungeEvery * G.rng.float(0.8, 1.3);
      }
      steer(e, p.x, p.y, e.speed * d.lungeSpeed, 12, dt);
      return;
    }
    if (d.lungeCd <= 0 && gap < d.orbitR * 1.6) {
      d.state = "lunge";
      d.timer = d.lungeTime;
      G.addFx?.("spark", e.x, e.y, { color: e.color, count: 5, r: e.r * 1.8 });
      return;
    }
  }

  // Split the speed budget between closing on the orbit radius and running
  // along it, so the ring is held without ever stalling.
  const radial = -clamp((gap - d.orbitR) * 2.4, -e.speed * 0.85, e.speed * 0.85);
  const tangent = d.dir * Math.sqrt(Math.max(0, e.speed * e.speed - radial * radial));
  const ur = { x: Math.cos(ang), y: Math.sin(ang) };
  const ut = { x: -Math.sin(ang), y: Math.cos(ang) };
  const k = 1 - Math.exp(-(d.agility || 6) * dt);
  e.vx = lerp(e.vx, ur.x * radial + ut.x * tangent, k);
  e.vy = lerp(e.vy, ur.y * radial + ut.y * tangent, k);

  if (d.fireRate) {
    d.fireCd -= dt;
    if (d.fireCd <= 0) {
      d.fireCd = d.fireRate * G.rng.float(0.85, 1.2);
      volley(G, e);
    }
  }
}

function aiSplitter(G, e, dt) {
  aiChase(G, e, dt);
}

function bossPhase(e) {
  const f = e.hp / e.maxHp;
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
}

function bossNextMode(G, e) {
  const d = e.data;
  const ph = bossPhase(e);
  d.phase = ph;
  const list = d.phases[ph];
  d.mode = list[d.step++ % list.length];
  d.modeT = d.modeTime[ph];
  d.tick = 0;
  if (d.mode === "windup") {
    d.modeT = d.windup;
    const p = G.player;
    const a = norm(p.x - e.x, p.y - e.y);
    d.aimX = a.x;
    d.aimY = a.y;
    G.addFx?.("telegraph", e.x, e.y, { color: e.color, r: e.r * 3, life: d.windup, width: 5 });
  } else if (d.mode === "summon") {
    G.addFx?.("ring", e.x, e.y, { color: e.color, r: e.r * 0.8, r1: e.r * 3.4, life: 0.5, width: 4 });
  }
}

function aiBoss(G, e, dt) {
  const d = e.data;
  const p = G.player;
  const ph = bossPhase(e);
  const rage = 1 + ph * 0.14; // later phases act faster, not just harder
  d.modeT -= dt * rage;

  switch (d.mode) {
    case "advance":
      steer(e, p.x, p.y, e.speed * rage, d.agility, dt);
      if (d.modeT <= 0) bossNextMode(G, e);
      break;

    case "windup":
      telegraph(e, dt);
      brake(e, 8, dt);
      if (d.modeT <= 0) {
        d.mode = "dash";
        d.modeT = d.dashTime;
        e.vx = d.aimX * d.dashSpeed * rage;
        e.vy = d.aimY * d.dashSpeed * rage;
        G.addFx?.("burst", e.x, e.y, { color: e.color, count: 12, r: e.r });
      }
      break;

    case "dash": {
      const wall =
        e.x <= e.r + 0.5 || e.x >= ARENA.w - e.r - 0.5 ||
        e.y <= e.r + 0.5 || e.y >= ARENA.h - e.r - 0.5;
      if (d.modeT <= 0 || wall) {
        d.mode = "recover";
        d.modeT = d.restTime;
        if (wall) {
          // Slamming a wall throws a shockwave ring: punishes hugging corners.
          G.addFx?.("burst", e.x, e.y, { color: e.color, count: 18, r: e.r * 2 });
          const off = G.rng.float(0, TAU);
          for (let i = 0; i < 6; i++) fireShot(G, e, off + (TAU / 6) * i, { mul: 0.45 });
        }
      }
      break;
    }

    case "recover":
      brake(e, 6, dt);
      if (d.modeT <= 0) bossNextMode(G, e);
      break;

    case "summon": {
      brake(e, 4, dt);
      d.tick -= dt;
      if (d.tick <= 0) {
        d.tick = d.addRate;
        const a = G.rng.float(0, TAU);
        const rad = e.r + 34;
        spawnEnemy(G, G.rng.pick(d.adds), e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad, {
          elite: false,
          scale: d.addScale,
        });
      }
      if (d.modeT <= 0) bossNextMode(G, e);
      break;
    }

    case "burst": {
      steer(e, p.x, p.y, e.speed * 0.35, 3, dt);
      d.tick -= dt;
      if (d.tick <= 0) {
        d.tick = d.burstInterval;
        d.burstAng += d.burstSpin;
        const n = d.burstCount;
        for (let i = 0; i < n; i++) fireShot(G, e, d.burstAng + (TAU / n) * i);
        G.addFx?.("spark", e.x, e.y, { color: d.shotColor, count: 6, r: e.r * 1.4 });
      }
      if (d.modeT <= 0) bossNextMode(G, e);
      break;
    }

    default:
      bossNextMode(G, e);
  }
}

/* ------------------------------------------------------- crowd separation */

const SEPARATION = 240;      // px/sec of positional correction at full overlap
const SEP_NEIGHBOURS = 12;   // scan cap: keeps a 200-enemy wave off the O(n^2) path

// Positional (not velocity) push-apart: velocity pushes oscillate and make packs
// jitter, position corrections settle. The push is summed and then normalised by
// the *worst* overlap rather than by neighbour count -- averaging lets a dense
// pile cancel itself out and the middle of a blob never escapes.
function separate(G, e, dt) {
  const near = G.grid?.query(e.x, e.y, e.r + 40);
  if (!near || near.length < 2) return;
  let px = 0, py = 0, worst = 0, n = 0;
  for (let i = 0; i < near.length && n < SEP_NEIGHBOURS; i++) {
    const o = near[i];
    if (o === e || o.dead || o.kind !== "enemy") continue;
    const want = e.r + o.r;
    const dx = e.x - o.x, dy = e.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= want * want) continue;
    n++;
    if (d2 < 1e-4) {
      worst = 1;
      continue; // exactly stacked: no usable direction, the fallback handles it
    }
    const dd = Math.sqrt(d2);
    const overlap = (want - dd) / want;
    if (overlap > worst) worst = overlap;
    // Weight by overlap so the nearest neighbour dominates the escape direction.
    px += (dx / dd) * overlap;
    py += (dy / dd) * overlap;
  }
  if (!n) return;
  let mag = Math.hypot(px, py);
  if (mag < 1e-3) {
    // Symmetrically buried (or perfectly stacked): pick a direction at random so
    // the pile has something to unfold along.
    const a = G.rng.float(0, TAU);
    px = Math.cos(a);
    py = Math.sin(a);
    mag = 1;
  }
  const k = SEPARATION * worst * (e.data.shove ?? 1) * dt;
  e.x += (px / mag) * k;
  e.y += (py / mag) * k;
}

/* ------------------------------------------------------------ contact hit */

function contact(G, e, dt) {
  const p = G.player;
  if (!p || p.dead) return;
  const rr = e.r + p.r;
  if (dist2(e.x, e.y, p.x, p.y) > rr * rr) return;
  const d = e.data;
  if (d.touchCd > 0) return;
  d.touchCd = d.touchRate;
  G.hurtPlayer?.(Math.max(1, Math.round(e.damage)));
  G.addFx?.("burst", (e.x + p.x) / 2, (e.y + p.y) / 2, { color: e.color, count: 6, r: 10 });
  if (e.ai !== "boss") {
    // Shove out of the player and back off briefly: keeps the mob a repeating
    // threat instead of a body that parks inside the hitbox.
    const a = norm(e.x - p.x, e.y - p.y);
    e.x += a.x * 6;
    e.y += a.y * 6;
    if (e.ai === "chase" || e.ai === "splitter") d.recoil = 0.22;
  }
}

/* ----------------------------------------------------------------- update */

export function updateEnemies(G, dt) {
  const list = G.enemies;
  const n = list.length; // freshly summoned adds wait until the next frame
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (e.dead) continue;
    const d = e.data;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (d.touchCd > 0) d.touchCd -= dt;
    if (d.recoil > 0) d.recoil -= dt;

    switch (e.ai) {
      case "charger": aiCharger(G, e, dt); break;
      case "shooter": aiShooter(G, e, dt); break;
      case "orbiter": aiOrbiter(G, e, dt); break;
      case "splitter": aiSplitter(G, e, dt); break;
      case "boss": aiBoss(G, e, dt); break;
      default: aiChase(G, e, dt);
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    separate(G, e, dt);
    confine(e);
    contact(G, e, dt);
  }
}

/* ------------------------------------------------------------------ death */

function dropMaterials(G, e) {
  let left = e.mats;
  if (left <= 0) return;
  // Split into a few chunks so a kill sprays pickups instead of dropping one
  // token -- the magnet sweep is most of the reward feel.
  const chunks = clamp(Math.round(Math.sqrt(left)), 1, e.elite || e.ai === "boss" ? 8 : 3);
  const per = Math.max(1, Math.floor(left / chunks));
  for (let i = 0; i < chunks && left > 0; i++) {
    const v = i === chunks - 1 ? left : Math.min(left, per);
    left -= v;
    const a = G.rng.float(0, TAU);
    const rad = G.rng.float(0, e.r * 0.9);
    G.spawnPickup?.(e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad, "material", v);
  }
}

export function onEnemyDeath(G, enemy) {
  const d = enemy.data;
  if (d.dropped) return; // hurtEnemy and a splitter chain must not double-pay
  d.dropped = true;

  const luck = 1 + (G.stats?.luck ?? 0) / 100;
  const boss = enemy.ai === "boss";

  dropMaterials(G, enemy);
  if (enemy.xp > 0) G.spawnPickup?.(enemy.x, enemy.y, "xp", enemy.xp);

  if (boss) {
    G.spawnPickup?.(enemy.x + 24, enemy.y, "heal", 8);
    G.spawnPickup?.(enemy.x - 24, enemy.y, "crate", 1);
    G.addFx?.("burst", enemy.x, enemy.y, { color: enemy.color, count: 40, r: enemy.r * 2.2 });
    G.addFx?.("ring", enemy.x, enemy.y, { color: "#ffffff", r: enemy.r, r1: enemy.r * 6, life: 0.6, width: 5 });
  } else {
    if (G.rng.chance(0.015 * luck * (enemy.elite ? 4 : 1))) {
      G.spawnPickup?.(enemy.x, enemy.y, "heal", enemy.elite ? 4 : 2);
    }
    if (enemy.elite && G.rng.chance(0.2 * luck)) {
      G.spawnPickup?.(enemy.x, enemy.y, "crate", 1);
    }
    G.addFx?.("burst", enemy.x, enemy.y, {
      color: enemy.color,
      count: enemy.elite ? 18 : 8,
      r: enemy.r * (enemy.elite ? 1.8 : 1.2),
    });
  }

  // Splitters pay their real cost here: killing one makes the problem wider.
  if (enemy.ai === "splitter" && d.child && G.enemies.length < HARD_CAP) {
    const count = d.childCount || 2;
    const base = G.rng.float(0, TAU);
    for (let i = 0; i < count; i++) {
      const a = base + (TAU / count) * i;
      const rad = enemy.r + 10;
      spawnEnemy(G, d.child, enemy.x + Math.cos(a) * rad, enemy.y + Math.sin(a) * rad, {
        elite: false,
        scale: d.childScale ?? 0.8,
        silent: true,
      });
    }
  }
}
