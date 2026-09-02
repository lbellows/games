// Headless simulation of the game logic — no DOM, no rendering.
// Drives the real update loop for full runs and asserts the systems interact.
// Run: node test/sim-test.js

import { createGame, update, startRun, nextWave, pickUpgrade, recomputeStats } from "../js/game.js";
import { TOTAL_WAVES } from "../js/waves.js";
import { WEAPON_DEFS, makeWeapon } from "../js/weapons.js";
import { ITEM_DEFS } from "../js/items.js";
import { ENEMY_TYPES } from "../js/enemies.js";
import { BASE_STATS, applyArmor } from "../js/stats.js";
import { shopState, buyOffer, rerollShop } from "../js/shop.js";

const STEP = 1 / 60;
let fails = 0;
const ok = (m) => console.log("  ✓ " + m);
const bad = (m, e) => {
  console.log("  ✗ " + m + " :: " + e);
  fails++;
};
function chk(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(name, e.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Walk the player in a slow circle so it dodges rather than standing still.
function steer(G, tick) {
  const a = tick / 240;
  G.input.keys.clear();
  if (Math.cos(a) > 0.3) G.input.keys.add("d");
  if (Math.cos(a) < -0.3) G.input.keys.add("a");
  if (Math.sin(a) > 0.3) G.input.keys.add("s");
  if (Math.sin(a) < -0.3) G.input.keys.add("w");
}

function step(G, ticks, tick0 = 0) {
  for (let i = 0; i < ticks; i++) {
    steer(G, tick0 + i);
    update(G, STEP);
    G.input.endFrame();
  }
}

console.log("\ncontent tables");
chk("weapon roster is populated", () => {
  const n = Object.keys(WEAPON_DEFS).length;
  assert(n >= 14, `only ${n} weapons`);
});
chk("item roster is populated", () => {
  const n = Object.keys(ITEM_DEFS).length;
  assert(n >= 30, `only ${n} items`);
});
chk("enemy roster is populated", () => {
  const n = Object.keys(ENEMY_TYPES).length;
  assert(n >= 12, `only ${n} enemy types`);
});
chk("every item mod targets a real stat", () => {
  for (const [id, def] of Object.entries(ITEM_DEFS)) {
    for (const k of Object.keys(def.mods || {})) {
      assert(k in BASE_STATS, `item "${id}" modifies unknown stat "${k}"`);
    }
  }
});
chk("every weapon declares the fields the renderer needs", () => {
  for (const [id, d] of Object.entries(WEAPON_DEFS)) {
    assert(typeof d.name === "string", `${id} has no name`);
    assert(["melee", "ranged", "elemental"].includes(d.type), `${id} bad type "${d.type}"`);
    assert(d.damage > 0, `${id} has no damage`);
    assert(d.cooldown > 0, `${id} has no cooldown`);
  }
});
chk("every enemy declares a legal shape and color", () => {
  const shapes = new Set(["blob", "spike", "square", "triangle", "ring"]);
  for (const [id, d] of Object.entries(ENEMY_TYPES)) {
    assert(shapes.has(d.shape), `${id} bad shape "${d.shape}"`);
    assert(/^#|rgb/.test(String(d.color)), `${id} bad color "${d.color}"`);
  }
});
chk("every weapon can be instantiated at all four tiers", () => {
  for (const id of Object.keys(WEAPON_DEFS)) {
    let prev = 0;
    for (let t = 1; t <= 4; t++) {
      const w = makeWeapon(id, t);
      assert(w && w.name && w.damage > 0 && w.cooldown > 0, `${id} tier ${t} produced nothing usable`);
      assert(w.tier === t, `${id} tier ${t} reports tier ${w.tier}`);
      assert(w.damage >= prev, `${id} tier ${t} damage ${w.damage} regressed from ${prev}`);
      prev = w.damage;
    }
  }
});

console.log("\nwave 1 simulation");
const G = createGame(12345);
startRun(G);
chk("a wave starts in the wave phase", () => assert(G.phase === "wave", `phase is ${G.phase}`));
step(G, 60 * 6);
chk("enemies spawn during a wave", () => assert(G.enemies.length > 0, "no enemies after 6s"));
chk("weapons fire at enemies", () =>
  assert(G.projectiles.length > 0 || G.kills > 0, "no projectiles and no kills"));
step(G, 60 * 8, 360);
chk("enemies actually die", () => assert(G.kills > 0, "zero kills after 14s"));
chk("materials accrue from kills", () => assert(G.materials > 0, "no materials earned"));
chk("xp accrues from kills", () => assert(G.xp > 0 || G.level > 1, "no xp earned"));
chk("no NaN leaked into entity positions", () => {
  for (const e of [G.player, ...G.enemies, ...G.projectiles, ...G.hazards, ...G.pickups]) {
    assert(Number.isFinite(e.x) && Number.isFinite(e.y), `NaN position on ${e.kind}/${e.type || ""}`);
  }
});
chk("enemies stay inside the arena", () => {
  for (const e of G.enemies) {
    assert(e.x >= -60 && e.x <= 1340 && e.y >= -60 && e.y <= 780, `enemy escaped to ${e.x | 0},${e.y | 0}`);
  }
});

console.log("\nwave -> levelup -> shop transitions");
// Run out the clock on wave 1.
let guard = 0;
while (G.phase === "wave" && guard++ < 60 * 200) {
  steer(G, guard);
  update(G, STEP);
  G.input.endFrame();
}
chk("wave ends into levelup or shop", () =>
  assert(["levelup", "shop", "gameover"].includes(G.phase), `phase is ${G.phase}`));
if (G.phase === "levelup") {
  chk("levelup offers three choices", () => assert(G.upgradeChoices.length === 3, "not 3 choices"));
  let lguard = 0;
  while (G.phase === "levelup" && lguard++ < 30) pickUpgrade(G, 0);
  chk("picking upgrades reaches the shop", () => assert(G.phase === "shop", `phase is ${G.phase}`));
}
chk("shop offers four things", () => {
  const st = shopState(G);
  assert(st.offers.length === 4, `got ${st.offers.length} offers`);
});
chk("shop offers carry price and name", () => {
  for (const o of shopState(G).offers) {
    assert(typeof o.name === "string" && o.name.length, "offer has no name");
    assert(Number.isFinite(o.price), "offer has no price");
  }
});
chk("reroll charges materials when affordable", () => {
  G.materials = 500;
  const before = G.materials;
  const cost = shopState(G).rerollCost;
  rerollShop(G);
  assert(G.materials === before - cost, `expected -${cost}, got ${before - G.materials}`);
});
chk("buying an affordable offer spends materials", () => {
  G.materials = 5000;
  const before = G.materials;
  const st = shopState(G);
  buyOffer(G, 0);
  assert(G.materials < before, "materials unchanged after buy");
  assert(G.items.length + G.weapons.length > 1, "nothing was acquired");
});
chk("weapon slots never exceed six", () => {
  for (let i = 0; i < 40; i++) {
    G.materials = 99999;
    const st = shopState(G);
    const wi = st.offers.findIndex((o) => o.kind === "weapon");
    if (wi >= 0) buyOffer(G, wi);
    else rerollShop(G);
  }
  assert(G.weapons.length <= 6, `${G.weapons.length} weapons in 6 slots`);
});
chk("stats recompute from owned items", () => {
  recomputeStats(G);
  for (const [k, v] of Object.entries(G.stats)) {
    assert(Number.isFinite(v), `stat ${k} is ${v}`);
  }
});

console.log("\nfull 20-wave endurance run (god-mode player, checks for crashes)");
chk("all 20 waves run to completion without throwing", () => {
  const H = createGame(999);
  startRun(H);
  let t = 0;
  const cap = 60 * 60 * 30; // 30 simulated minutes is plenty for 20 waves
  while (H.phase !== "win" && t++ < cap) {
    // Keep the player alive so we exercise late waves rather than an early death.
    // hurtPlayer short-circuits on i-frames, so this is true invulnerability —
    // topping up hp alone still lets a single late-wave hit exceed max hp.
    H.player.iframes = 999;
    H.player.hp = H.stats.maxHp;
    H.player.dead = false;
    steer(H, t);
    update(H, STEP);
    H.input.endFrame();
    if (H.phase === "levelup") pickUpgrade(H, 0);
    else if (H.phase === "shop") {
      H.materials += 40;
      const st = shopState(H);
      for (let i = 0; i < 4; i++) if (st.offers[i] && st.offers[i].affordable) buyOffer(H, i);
      nextWave(H);
    }
  }
  assert(H.phase === "win", `run ended in phase "${H.phase}" at wave ${H.wave} after ${(t / 60) | 0}s`);
  assert(H.wave === TOTAL_WAVES, `finished on wave ${H.wave}`);
  console.log(`      reached wave ${H.wave}, ${H.kills} kills, ${H.weapons.length} weapons, ${H.items.length} items, level ${H.level}`);
});

console.log("\nno-one-shot guarantee");
chk("a leveled player out-scales boss contact damage at every boss wave", () => {
  // Regression: the wave-5 boss once dealt 13 to a 13-max-hp player, killing
  // from full with no counterplay. Levels now carry an implicit hp pool.
  const B = createGame(3);
  for (const [wave, level, bossId] of [[5, 4, "bramble_king"], [10, 8, "iron_maw"],
                                       [15, 12, "bramble_king"], [20, 16, "iron_maw"]]) {
    B.wave = wave;
    B.level = level;
    recomputeStats(B);
    const boss = B.spawnEnemy(bossId, 100, 100);
    boss.dead = true;
    const taken = applyArmor(boss.damage, B.stats.armor);
    assert(taken < B.stats.maxHp,
      `wave ${wave}: ${bossId} hits for ${taken} vs ${B.stats.maxHp} max hp — one-shot from full`);
  }
});

console.log("\ndifficulty sanity (no god mode)");
chk("an idle player dies, so the game is not trivially safe", () => {
  const D = createGame(7);
  startRun(D);
  let t = 0;
  while (D.phase === "wave" && t++ < 60 * 400) {
    D.input.keys.clear(); // stand perfectly still
    update(D, STEP);
    D.input.endFrame();
    if (D.wave >= 6) break;
    if (D.phase === "levelup") pickUpgrade(D, 0);
    if (D.phase === "shop") nextWave(D);
  }
  assert(D.phase === "gameover" || D.player.hp < D.stats.maxHp,
    "a motionless player never even took a scratch");
});

console.log(fails ? `\n${fails} FAILED\n` : "\nall sim tests passed\n");
process.exit(fails ? 1 : 0);
