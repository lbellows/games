// Game state, phase machine, and the per-frame update. This is the seam every
// other module plugs into: it owns `G` and the callbacks agents call.

import { ARENA, RNG, Emitter, Grid, Input, compact, clamp } from "./core.js";
import { computeStats, xpForLevel, STAT_LABELS, PERCENT_STATS } from "./stats.js";
import { createPlayer, updatePlayer, hurtPlayer, healPlayer, spawnPickup, grantXp } from "./player.js";
import { spawnEnemy, updateEnemies, onEnemyDeath } from "./enemies.js";
import { TOTAL_WAVES, waveDuration, startWave, updateWaveSpawns } from "./waves.js";
import { makeWeapon, updateWeapons } from "./weapons.js";
import { spawnProjectile, spawnHazard, updateProjectiles } from "./projectiles.js";
import { openShop } from "./shop.js";
import { addFx, updateFx } from "./render.js";

export const MAX_WEAPONS = 6;

// Enemy contact damage climbs with the wave, but a player who never bought an
// HP item stayed at ~13 max HP and got one-shot by the wave-5 boss. A small
// implicit pool per level keeps hits survivable without blunting item choices.
export const TUNING = { hpPerLevel: 3 };

/* ------------------------------------------------------- level-up upgrades */

// Each level-up offers a choice of three of these. Values are deliberately
// smaller than shop items — leveling is a steady trickle, not a power spike.
const UPGRADE_POOL = [
  { stat: "maxHp", amount: 3, weight: 10 },
  { stat: "hpRegen", amount: 1, weight: 7 },
  { stat: "damage", amount: 5, weight: 10 },
  { stat: "meleeDamage", amount: 8, weight: 8 },
  { stat: "rangedDamage", amount: 8, weight: 8 },
  { stat: "attackSpeed", amount: 6, weight: 9 },
  { stat: "critChance", amount: 3, weight: 7 },
  { stat: "range", amount: 8, weight: 6 },
  { stat: "armor", amount: 2, weight: 8 },
  { stat: "dodge", amount: 3, weight: 6 },
  { stat: "speed", amount: 5, weight: 8 },
  { stat: "lifeSteal", amount: 2, weight: 5 },
  { stat: "luck", amount: 6, weight: 6 },
  { stat: "harvesting", amount: 3, weight: 6 },
  { stat: "engineering", amount: 8, weight: 4 },
];

function rollUpgrades(G) {
  const pool = UPGRADE_POOL.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const pairs = pool.map((u) => [u, u.weight]);
    const pick = G.rng.weighted(pairs);
    pool.splice(pool.indexOf(pick), 1);
    out.push({
      stat: pick.stat,
      amount: pick.amount,
      label: STAT_LABELS[pick.stat],
      suffix: PERCENT_STATS.has(pick.stat) ? "%" : "",
    });
  }
  return out;
}

/* -------------------------------------------------------------- construction */

export function createGame(seed = (Math.random() * 1e9) | 0) {
  const G = {
    phase: "menu",
    wave: 1,
    t: 0,
    waveTime: waveDuration(1),
    rng: new RNG(seed),
    bus: new Emitter(),
    input: new Input(),
    player: createPlayer(),
    stats: null,
    enemies: [],
    projectiles: [],
    hazards: [],
    pickups: [],
    effects: [],
    weapons: [],
    items: [],
    materials: 0,
    level: 1,
    xp: 0,
    pendingLevelUps: 0,
    upgradeChoices: [],
    levelBonuses: [],
    grid: new Grid(72),
    kills: 0,
    waveKills: 0,
    paused: false,
    shake: 0,
    seed,
  };

  // Callbacks the agent modules call. Bound here so nobody needs to import
  // sideways across module boundaries.
  G.hurtEnemy = (enemy, amount, crit, source) => hurtEnemy(G, enemy, amount, crit, source);
  G.hurtPlayer = (amount) => hurtPlayer(G, amount);
  G.spawnPickup = (x, y, type, value) => spawnPickup(G, x, y, type, value);
  G.spawnProjectile = (spec) => spawnProjectile(G, spec);
  G.spawnHazard = (spec) => spawnHazard(G, spec);
  G.spawnEnemy = (typeId, x, y) => spawnEnemy(G, typeId, x, y);
  // The renderer reads `value` for floating numbers while gameplay code speaks
  // in `amount`; normalize here so neither side has to know about the other.
  G.addFx = (kind, x, y, opts) => {
    const o = opts || {};
    if (o.value === undefined && o.amount !== undefined) o.value = o.amount;
    return addFx(G, kind, x, y, o);
  };
  G.grantXp = (amount) => grantXp(G, amount);
  G.grantMaterials = (amount) => {
    G.materials += amount;
  };

  // The shop mutates G.items / G.weapons; stats must be refolded after each buy.
  G.recomputeStats = () => recomputeStats(G);
  G.bus.on("itemBought", () => recomputeStats(G));
  G.bus.on("weaponBought", () => recomputeStats(G));
  G.bus.on("weaponSold", () => recomputeStats(G));

  recomputeStats(G);
  G.player.hp = G.stats.maxHp;

  // Everyone starts with a pistol, as in Brotato.
  G.weapons.push(makeWeapon("pistol", 1));

  return G;
}

/** Fold base stats + item mods + level-up bonuses into G.stats. */
export function recomputeStats(G) {
  const mods = [];
  for (const it of G.items) if (it.mods) mods.push(it.mods);
  for (const b of G.levelBonuses) mods.push(b);
  if (G.level > 1) mods.push({ maxHp: (G.level - 1) * TUNING.hpPerLevel });
  const prevMax = G.stats ? G.stats.maxHp : null;
  G.stats = computeStats(mods);
  // Gaining max hp grants the difference, so +hp items feel immediately useful.
  if (prevMax !== null && G.stats.maxHp > prevMax) {
    G.player.hp = Math.min(G.stats.maxHp, G.player.hp + (G.stats.maxHp - prevMax));
  }
  G.player.hp = Math.min(G.player.hp, G.stats.maxHp);
}

/* ------------------------------------------------------------------ damage */

function hurtEnemy(G, enemy, amount, crit, source) {
  if (!enemy || enemy.dead) return;
  enemy.hp -= amount;
  enemy.hitFlash = 0.08;
  G.addFx("damage", enemy.x, enemy.y - enemy.r - 4, { amount, crit });

  // Life steal rolls per hit rather than per damage point, so it stays swingy.
  const ls = G.stats.lifeSteal;
  if (ls > 0 && G.rng.chance(Math.min(1, ls / 100))) {
    const healed = healPlayer(G, 1);
    if (healed > 0) G.addFx("heal", G.player.x, G.player.y, { amount: healed });
  }

  if (enemy.hp <= 0) {
    enemy.dead = true;
    G.kills += 1;
    G.waveKills += 1;
    onEnemyDeath(G, enemy);
    G.bus.emit("enemyKilled", enemy);
  }
}

/* ------------------------------------------------------------ phase control */

export function startRun(G) {
  G.phase = "wave";
  beginWave(G, 1);
}

export function beginWave(G, wave) {
  G.wave = wave;
  G.t = 0;
  G.waveTime = waveDuration(wave);
  G.waveKills = 0;
  G.enemies.length = 0;
  G.projectiles.length = 0;
  G.hazards.length = 0;
  G.pickups.length = 0;
  G.player.x = ARENA.w / 2;
  G.player.y = ARENA.h / 2;
  G.player.iframes = 1.0; // brief grace on wave start
  G.phase = "wave";
  startWave(G, wave);
  G.bus.emit("waveStart", wave);
}

function endWave(G) {
  // Harvesting pays out at wave end, and unclaimed drops are swept up.
  G.materials += G.stats.harvesting;
  for (const pk of G.pickups) {
    if (pk.dead) continue;
    if (pk.type === "material" || pk.type === "crate") G.materials += pk.value;
    else if (pk.type === "xp") grantXp(G, pk.value);
  }
  G.pickups.length = 0;
  G.enemies.length = 0;
  G.hazards.length = 0;
  G.projectiles.length = 0;

  if (G.wave >= TOTAL_WAVES) {
    G.phase = "win";
    G.bus.emit("win", null);
    return;
  }
  advancePostWave(G);
}

/** Level-up choices are resolved between waves, then the shop opens. */
function advancePostWave(G) {
  if (G.pendingLevelUps > 0) {
    G.upgradeChoices = rollUpgrades(G);
    G.phase = "levelup";
  } else {
    openShop(G);
    G.phase = "shop";
  }
}

export function pickUpgrade(G, index) {
  if (G.phase !== "levelup") return;
  const choice = G.upgradeChoices[index];
  if (!choice) return;
  G.levelBonuses.push({ [choice.stat]: choice.amount });
  G.pendingLevelUps -= 1;
  recomputeStats(G);
  G.bus.emit("upgradePicked", choice);
  advancePostWave(G);
}

export function nextWave(G) {
  if (G.phase !== "shop") return;
  beginWave(G, G.wave + 1);
}

export function restart(G) {
  const fresh = createGame((Math.random() * 1e9) | 0);
  // Copy onto the same object so held references stay valid.
  for (const k of Object.keys(fresh)) G[k] = fresh[k];
  G.phase = "menu";
  return G;
}

/* ------------------------------------------------------------------ update */

export function update(G, dt) {
  updateFx(G, dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);

  if (G.phase !== "wave" || G.paused) return;

  G.t += dt;
  G.grid.rebuild(G.enemies);

  updatePlayer(G, dt);
  updateWaveSpawns(G, dt);
  updateEnemies(G, dt);
  updateWeapons(G, dt);
  updateProjectiles(G, dt);

  compact(G.enemies);
  compact(G.projectiles);
  compact(G.hazards);

  if (G.player.dead) {
    G.phase = "gameover";
    G.bus.emit("gameover", null);
    return;
  }

  if (G.t >= G.waveTime) endWave(G);
}

/* ------------------------------------------------------------------ getters */

export const waveRemaining = (G) => Math.max(0, G.waveTime - G.t);
export const xpToNext = (G) => xpForLevel(G.level);
export const xpFraction = (G) => clamp(G.xp / xpForLevel(G.level), 0, 1);
