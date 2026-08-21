// Wave director: how long a wave runs, how many spawn points it may spend, and
// the drip that spends them.
//
// Everything is a budget of *spawn points*, not a body count. A late wave can
// spend its points on three juggernauts or twenty runners and still feel like
// the same amount of pressure, which is what keeps the ramp smooth when new
// enemy types unlock.

import { ARENA, TAU, clamp, dist } from "./core.js";
import { ENEMY_TYPES, spawnEnemy, unlockedTypes } from "./enemies.js";

export const TOTAL_WAVES = 20;

// Tuning block for the whole ramp.
const PACING = {
  baseDuration: 20,     // wave 1 length in seconds
  durationStep: 1.7,    // seconds added per wave
  durationMax: 55,
  bossMinDuration: 40,  // boss fights need room to cycle their phases
  baseBudget: 14,
  budgetLinear: 7.5,
  budgetQuad: 0.85,     // the wave 12+ squeeze
  bossAddFraction: 0.45, // boss waves trickle far fewer adds
  releaseEnd: 0.9,      // all points are spent by 90% of the wave
  releaseShape: 1.12,   // >1 means the wave builds rather than front-loads
  firstSpawnDelay: 0.6,
  safeRadius: 260,      // never spawn this close to the player
  aliveBase: 45,
  alivePerWave: 5,
  aliveMax: 150,
};

// Waves 5/15 get the summoner, 10/20 the bruiser -- the second visit is the
// same fight with the scaling curve turned up, so players get to use what they
// learned the first time.
const BOSS_SCHEDULE = { 5: "bramble_king", 10: "iron_maw", 15: "bramble_king", 20: "iron_maw" };

let director = null; // module fallback if G was rebuilt without startWave

export function isBossWave(wave) {
  return !!BOSS_SCHEDULE[wave];
}

export function bossForWave(wave) {
  return BOSS_SCHEDULE[wave] || null;
}

/** Seconds this wave runs. ~20s early, ~52s at wave 20. */
export function waveDuration(wave) {
  const base = clamp(
    Math.round(PACING.baseDuration + PACING.durationStep * (wave - 1)),
    PACING.baseDuration,
    PACING.durationMax
  );
  return isBossWave(wave) ? Math.max(base, PACING.bossMinDuration) : base;
}

/** Spawn points this wave may spend on trickled enemies (boss excluded). */
export function waveBudget(wave) {
  const w = Math.max(0, wave - 1);
  const pts = PACING.baseBudget + PACING.budgetLinear * w + PACING.budgetQuad * w * w;
  return Math.round(isBossWave(wave) ? pts * PACING.bossAddFraction : pts);
}

function maxAlive(wave) {
  return Math.min(PACING.aliveMax, PACING.aliveBase + PACING.alivePerWave * wave);
}

// Older types thin out as newer ones unlock so wave 18 is not half mites, and
// a just-unlocked type gets a spotlight so the player notices it arriving.
function weightFor(def, wave) {
  let w = def.weight;
  const age = wave - def.minWave;
  if (age <= 1) w *= 1.6;
  if (age >= 6) w *= 0.55;
  if (age >= 11) w *= 0.5;
  return Math.max(0.2, w);
}

// Fraction of the budget that should have been spent by `p` of the wave.
function releaseCurve(p) {
  return Math.pow(clamp(p / PACING.releaseEnd, 0, 1), PACING.releaseShape);
}

function aliveCount(G) {
  let n = 0;
  for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) n++;
  return n;
}

// A point on the arena rim, biased away from the player. Sampling and keeping
// the farthest candidate is cheaper and more robust than solving for the legal
// arc, and it degrades gracefully when the player hugs a corner.
function edgePoint(G, r) {
  const p = G.player;
  const pad = r + 6;
  let best = null;
  let bestD = -1;
  for (let i = 0; i < 14; i++) {
    const side = G.rng.int(0, 3);
    let x, y;
    if (side === 0) { x = G.rng.float(pad, ARENA.w - pad); y = pad; }
    else if (side === 1) { x = ARENA.w - pad; y = G.rng.float(pad, ARENA.h - pad); }
    else if (side === 2) { x = G.rng.float(pad, ARENA.w - pad); y = ARENA.h - pad; }
    else { x = pad; y = G.rng.float(pad, ARENA.h - pad); }
    if (!p) return { x, y };
    const d = dist(x, y, p.x, p.y);
    if (d >= PACING.safeRadius) return { x, y };
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best || { x: pad, y: pad };
}

function spawnGroup(G, d) {
  const id = G.rng.weighted(d.pool);
  const def = ENEMY_TYPES[id];
  if (!def) return;

  const pack = def.pack || [1, 1];
  let count = G.rng.int(pack[0], pack[1]);
  const room = Math.floor((d.budget - d.spent) / def.cost);
  count = clamp(Math.min(count, room), 1, 8);

  const at = edgePoint(G, def.r);
  for (let i = 0; i < count; i++) {
    // Fan the pack along the rim; separation untangles the rest on frame one.
    const a = G.rng.float(0, TAU);
    const spread = 10 + def.r * 1.4 * i;
    const x = clamp(at.x + Math.cos(a) * spread, def.r, ARENA.w - def.r);
    const y = clamp(at.y + Math.sin(a) * spread, def.r, ARENA.h - def.r);
    spawnEnemy(G, id, x, y, { wave: d.wave });
  }
  d.spent += def.cost * count;
}

function spawnBoss(G, d) {
  d.bossSpawned = true;
  const def = ENEMY_TYPES[d.boss];
  const at = edgePoint(G, def ? def.r : 34);
  const boss = spawnEnemy(G, d.boss, at.x, at.y, { elite: false, silent: true, wave: d.wave });
  if (boss) {
    G.addFx?.("ring", boss.x, boss.y, { color: boss.color, r: boss.r, r1: boss.r * 8, life: 0.9, width: 5 });
    G.addFx?.("burst", boss.x, boss.y, { color: boss.color, count: 30, r: boss.r * 2 });
    G.bus?.emit("boss", boss);
  }
}

/** Reset the spawn director for `wave`. Call once when the wave starts. */
export function startWave(G, wave) {
  const ids = unlockedTypes(wave);
  const pool = ids.map((id) => [id, weightFor(ENEMY_TYPES[id], wave)]);
  const d = {
    wave,
    duration: waveDuration(wave),
    budget: waveBudget(wave),
    spent: 0,
    t: 0,
    nextIn: PACING.firstSpawnDelay,
    pool: pool.length ? pool : [["mite", 1]],
    boss: bossForWave(wave),
    bossSpawned: false,
    bossDelay: 1.4,
    done: false,
  };
  // Roughly how many groups the budget buys, used to space the drip evenly.
  d.interval = clamp(d.duration / Math.max(6, d.budget / 3), 0.3, 1.8);
  G.waveTime = d.duration;
  G.waveDirector = d;
  director = d;
  return d;
}

/** Trickle enemies in from the rim according to the release curve. */
export function updateWaveSpawns(G, dt) {
  const d = G.waveDirector || director;
  if (!d) return;
  d.t += dt;

  if (d.boss && !d.bossSpawned && d.t >= d.bossDelay) spawnBoss(G, d);

  if (d.done) return;
  d.nextIn -= dt;
  if (d.nextIn > 0) return;
  if (d.spent >= d.budget) {
    d.done = true;
    return;
  }
  if (d.spent >= d.budget * releaseCurve(d.t / d.duration)) return;
  if (aliveCount(G) >= maxAlive(d.wave)) {
    d.nextIn = 0.35; // at the cap, bank the points instead of dropping them
    return;
  }

  spawnGroup(G, d);
  d.nextIn = d.interval * G.rng.float(0.7, 1.3);
}
