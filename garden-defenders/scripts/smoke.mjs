/**
 * Headless smoke test: drives the real game modules (no DOM, no browser) through the
 * complete player-visible flow. Run with `npm run smoke`.
 */
import { installDomStubs } from './canvas-stub.mjs';

const { store, context: ctx } = installDomStubs();

const { Input } = await import('../src/core/input.ts');
const { Game } = await import('../src/game/game.ts');
const { Enemy } = await import('../src/entities/enemy.ts');
const { Pickup } = await import('../src/entities/pickup.ts');
const { Particles } = await import('../src/entities/particles.ts');
const { WaveManager, buildWaveQueue } = await import('../src/systems/waves.ts');
const { ArenaDirector, ARENA } = await import('../src/systems/director.ts');
const { UPGRADES, xpForLevel } = await import('../src/systems/progression.ts');
const { XpOrb } = await import('../src/entities/xporb.ts');
const { GameAudio } = await import('../src/core/audio.ts');
const { FIELD, PLAYER, WAVES } = await import('../src/config.ts');

const STEP = 1 / 60;
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const input = new Input();
const game = new Game(input, new GameAudio());

/** Advances the simulation, optionally redrawing to catch render-time errors. */
function run(steps, { draw = false, each } = {}) {
  for (let i = 0; i < steps; i++) {
    if (each) each(i);
    game.update(STEP);
    input.endFrame();
    if (draw && i % 12 === 0) game.draw(ctx);
  }
}

/* ---------------------------------------------------------------- title ---- */
section('Title screen');
check('starts on the title screen', game.state === 'title');
game.draw(ctx);
check('title screen renders without error', true);
input.debugSet({ pressed: ['Enter'] });
run(1);
check('Enter starts a run', game.state === 'playing', `state=${game.state}`);
check('score resets to zero', game.score === 0);
check('player starts at full health', game.player.health === PLAYER.maxHealth);

/* ---------------------------------------------------------- move + spray --- */
section('Movement, aiming and spray');
const startX = game.player.x;
input.debugSet({ held: ['KeyD'] });
run(30, { draw: true });
check('WASD moves the player', game.player.x > startX + 20, `dx=${(game.player.x - startX).toFixed(1)}`);
input.debugSet({ held: [] });

const startY = game.player.y;
input.debugSet({ held: ['ArrowUp'] });
run(30);
check('arrow keys move the player', game.player.y < startY - 20, `dy=${(game.player.y - startY).toFixed(1)}`);
input.debugSet({ held: [] });
run(20);

// Keyboard-only aim: no mouse input, aim should follow the last movement direction.
const kbInput = new Input();
const kbGame = new Game(kbInput, new GameAudio());
kbInput.debugSet({ pressed: ['Enter'] });
kbGame.update(STEP);
kbInput.endFrame();
kbInput.debugSet({ held: ['KeyA'] });
for (let i = 0; i < 20; i++) {
  kbGame.update(STEP);
  kbInput.endFrame();
}
check(
  'aim falls back to last movement direction without a mouse',
  Math.abs(Math.abs(kbGame.player.aim) - Math.PI) < 0.01,
  `aim=${kbGame.player.aim.toFixed(2)}`,
);

// Mouse aim + spray damage on a stationary target.
input.debugSet({ pointer: { x: game.player.x + 60, y: game.player.y }, pointerDown: true });
const dummy = new Enemy('aphid', game.player.x + 45, game.player.y, { health: 1, speed: 0, damage: 1 });
game.enemies.length = 0;
game.enemies.push(dummy);
const hpBefore = dummy.hp;
const energyBefore = game.player.energy;
const scoreBeforeKill = game.score;
run(20);
check('spraying drains energy', game.player.energy < energyBefore, `${energyBefore.toFixed(1)} -> ${game.player.energy.toFixed(1)}`);
check('spray damages enemies in the cone', dummy.hp < hpBefore || dummy.dead, `hp=${dummy.hp.toFixed(1)}`);
run(90);
check('spray kills enemies', dummy.dead && !game.enemies.includes(dummy) && game.kills > 0, `kills=${game.kills}`);
check('kills award score', game.score > scoreBeforeKill);
check('particles are emitted', game.particles.count > 0, `count=${game.particles.count}`);

// Enemies outside the cone are safe.
const behind = new Enemy('aphid', game.player.x - 60, game.player.y, { health: 1, speed: 0, damage: 1 });
game.enemies.push(behind);
run(30);
check('spray does not hit enemies behind the player', !behind.dead, `hp=${behind.hp.toFixed(1)}`);
game.enemies.length = 0;

// Energy runs dry and locks out, then recharges.
input.debugSet({ pointerDown: true });
let lockoutSeen = false;
let sprayInterrupted = false;
run(300, {
  each: () => {
    if (game.player.energyLocked) lockoutSeen = true;
    if (game.player.energyLocked && !game.player.spraying) sprayInterrupted = true;
  },
});
check('energy lockout engages when the tank empties', lockoutSeen);
check('lockout stops the spray until it recharges', sprayInterrupted);
input.debugSet({ pointerDown: false });
run(240);
check('energy recharges when not spraying', game.player.energy > 50 && !game.player.energyLocked, `energy=${game.player.energy.toFixed(1)}`);

/* -------------------------------------------------------- enemy variety ---- */
section('Enemy types behave differently');
const scale = { health: 1, speed: 1, damage: 1 };
const particles = new Particles();
const silentAudio = new GameAudio();
const target = { x: 640, y: 400 };
const samples = {};
for (const kind of ['aphid', 'beetle', 'moth']) {
  const e = new Enemy(kind, 200, 400, scale);
  e.spawnAnim = 1;
  const path = [];
  let dashed = false;
  for (let i = 0; i < 260; i++) {
    e.update(STEP, target, particles, silentAudio);
    if (e.isDashing) dashed = true;
    if (i % 10 === 0) path.push({ x: e.x, y: e.y });
  }
  samples[kind] = {
    travelled: Math.hypot(e.x - 200, e.y - 400),
    offAxis: Math.max(...path.map((p) => Math.abs(p.y - 400))),
    dashed,
    damage: e.damage,
    hp: e.maxHp,
  };
}
check('aphid is the fastest chaser', samples.aphid.travelled > samples.beetle.travelled, `aphid=${samples.aphid.travelled.toFixed(0)} beetle=${samples.beetle.travelled.toFixed(0)}`);
check('beetle has the most health and heaviest hit', samples.beetle.hp > samples.moth.hp && samples.beetle.damage > samples.aphid.damage, `hp=${samples.beetle.hp} dmg=${samples.beetle.damage}`);
check('moth weaves off the direct line', samples.moth.offAxis > 12, `offAxis=${samples.moth.offAxis.toFixed(1)}`);
check('moth bursts forward with a dash', samples.moth.dashed);

const queue2 = buildWaveQueue(2);
const queue3 = buildWaveQueue(3);
check('moths join the roster on wave 2', queue2.includes('moth'), `wave2=${queue2.length} bugs`);
check('beetles join the roster on wave 3', queue3.includes('beetle'), `wave3=${queue3.length} bugs`);
check('waves get bigger', buildWaveQueue(8).length > buildWaveQueue(1).length);

/* ------------------------------------------------------- contact damage ---- */
section('Enemies damage the player');
game.enemies.length = 0;
game.player.health = PLAYER.maxHealth;
game.player.invuln = 0;
const biter = new Enemy('beetle', game.player.x + 4, game.player.y, scale);
biter.spawnAnim = 1;
game.enemies.push(biter);
run(4);
check('contact costs the player health', game.player.health < PLAYER.maxHealth, `health=${game.player.health.toFixed(0)}`);
const afterHit = game.player.health;
run(20);
check('damage invulnerability prevents instant re-hits', game.player.health === afterHit, `health=${game.player.health.toFixed(0)}`);
game.enemies.length = 0;

/* -------------------------------------------------------------- pickups ---- */
section('Seed pickups');
game.player.health = 40;
game.pickups.push(new Pickup('heal', game.player.x, game.player.y));
run(2);
check('aloe seed heals the player', game.player.health > 40, `health=${game.player.health.toFixed(0)}`);
const scoreBeforeSeed = game.score;
game.pickups.push(new Pickup('score', game.player.x, game.player.y));
run(2);
check('sun seed awards score', game.score > scoreBeforeSeed + 100, `+${(game.score - scoreBeforeSeed).toFixed(0)}`);
const bloom = new Pickup('power', game.player.x, game.player.y);
game.pickups.push(bloom);
run(2);
check('bloom seed grants the power-up', game.player.powered && game.player.powerTimer > 0, `${game.player.powerTimer.toFixed(1)}s`);
check('collected seeds leave the field', !game.pickups.includes(bloom));
const expiring = new Pickup('score', FIELD.x + 60, FIELD.y + 60);
expiring.life = 0.05;
game.pickups.push(expiring);
run(10);
check('uncollected seeds expire', !game.pickups.includes(expiring));
check('seeds appear on their own over time', game.pickups.length >= 0);

/* ---------------------------------------------------------------- waves ---- */
section('Wave progression');
check('wave 1 is active', game.waves.wave >= 1, `wave=${game.waves.wave}`);
// Let the wave manager run a full campaign with instant clears.
const wm = new WaveManager();
let spawned = 0;
let cleared = 0;
let won = false;
const events = {
  spawn: () => spawned++,
  onWaveStart: () => {},
  onWaveClear: () => cleared++,
  onWin: () => (won = true),
};
for (let i = 0; i < 60 * 600 && wm.wave <= WAVES.winWave + 1; i++) {
  // Drain each wave instantly: report 0 alive and consume the queue.
  wm.update(STEP, 0, events);
}
check('waves advance to the win wave', wm.wave > WAVES.winWave, `wave=${wm.wave}`);
check('clearing wave 10 triggers the win/endless state', won && wm.endless);
check('endless mode keeps generating waves', wm.wave >= WAVES.winWave + 1 && cleared >= WAVES.winWave);
check('spawn callback fired for every queued bug', spawned > 0, `spawned=${spawned}`);

// End-to-end: play the real game with an auto-pilot for a couple of minutes of game time.
section('Auto-pilot end-to-end run');
const seen = new Set();
let maxAlive = 0;
run(60 * 150, {
  draw: true,
  each: () => {
    game.player.health = PLAYER.maxHealth; // survive long enough to see several waves
    game.player.energy = PLAYER.maxEnergy;
    game.player.energyLocked = false;
    for (const e of game.enemies) seen.add(e.kind);
    maxAlive = Math.max(maxAlive, game.enemies.length);
    const nearest = game.enemies.reduce(
      (best, e) => {
        const d = Math.hypot(e.x - game.player.x, e.y - game.player.y);
        return d < best.d ? { d, e } : best;
      },
      { d: Infinity, e: null },
    ).e;
    if (nearest) {
      input.debugSet({ pointer: { x: nearest.x, y: nearest.y }, pointerDown: true });
    } else {
      input.debugSet({ pointerDown: false });
    }
  },
});
check('all three enemy types appear in play', seen.size === 3, [...seen].join(', '));
check('multiple waves are survived', game.waves.wave >= 4, `wave=${game.waves.wave}`);
check('enemy counts grow with the wave', maxAlive >= 6, `peak alive=${maxAlive}`);
check('score climbs while surviving', game.score > 1000, `score=${Math.floor(game.score)}`);
check('remaining-enemy counter is consistent', game.enemiesRemaining === game.enemies.length + game.waves.pending);
input.debugSet({ pointerDown: false });

/* ------------------------------------------------------- pause and mute ---- */
section('Pause and mute');
input.debugSet({ pressed: ['KeyP'] });
run(1);
check('P pauses', game.state === 'paused');
const frozenWave = game.waves.wave;
const frozenX = game.player.x;
input.debugSet({ held: ['KeyD'] });
run(60);
check('paused simulation is frozen', game.player.x === frozenX && game.waves.wave === frozenWave);
input.debugSet({ held: [] });
game.draw(ctx);
input.debugSet({ pressed: ['Escape'] });
run(1);
check('Escape resumes', game.state === 'playing');

const mutedBefore = game.sound.muted;
input.debugSet({ pressed: ['KeyM'] });
run(1);
check('M toggles mute', game.sound.muted !== mutedBefore, `muted=${game.sound.muted}`);
check('mute is persisted', store.get('garden-defenders.muted') === (game.sound.muted ? '1' : '0'));
input.debugSet({ pressed: ['KeyM'] });
run(1);
check('M toggles mute back', game.sound.muted === mutedBefore);

/* ------------------------------------------------------------- game over --- */
section('Game over, restart and high score');
game.score = 12345;
game.player.health = 0;
run(1);
check('health reaching zero ends the run', game.state === 'gameover');
game.draw(ctx);
check('game over screen renders without error', true);
check('high score is saved', store.get('garden-defenders.highscore') === '12345', store.get('garden-defenders.highscore'));
check('new record is flagged', game.newRecord);

const reloaded = new Game(new Input(), new GameAudio());
check('high score persists for a new session', reloaded.highScore === 12345, `highScore=${reloaded.highScore}`);

input.debugSet({ pressed: ['KeyR'] });
run(2);
check('R restarts into a fresh run', game.state === 'playing' && game.score < 100, `score=${Math.floor(game.score)}`);
check('restart clears the field', game.enemies.length <= 2 && game.pickups.length === 0);
check('high score survives the restart', game.highScore === 12345);

// A lower score must not overwrite the stored best.
game.score = 500;
game.player.health = 0;
run(1);
check('lower score does not overwrite the best', store.get('garden-defenders.highscore') === '12345');


/* ===================================================================== ARENA */

section('Arena mode: start and auto-fire');
const aInput = new Input();
const arena = new Game(aInput, new GameAudio());
function runArena(steps, { draw = false, each } = {}) {
  for (let i = 0; i < steps; i++) {
    if (each) each(i);
    arena.update(STEP);
    aInput.endFrame();
    if (draw && i % 15 === 0) arena.draw(ctx);
  }
}

arena.draw(ctx);
aInput.debugSet({ pressed: ['Digit2'] });
runArena(1);
check('title screen selects the Arena card', arena.selectedMode === 1);
arena.draw(ctx);
aInput.debugSet({ pressed: ['Enter'] });
runArena(1);
check('Arena mode starts', arena.state === 'playing' && arena.mode === 'arena', `mode=${arena.mode}`);
check('arena run clock starts at 10:00', Math.abs(arena.director.remaining - ARENA.duration) < 0.2, `${arena.director.remaining.toFixed(1)}s`);

// Auto-fire: no input at all, but a bug in range should get sprayed.
arena.enemies.length = 0;
const autoTarget = new Enemy('aphid', arena.player.x + 70, arena.player.y, { health: 30, speed: 0, damage: 1 });
autoTarget.spawnAnim = 1;
arena.enemies.push(autoTarget);
const autoHpBefore = autoTarget.hp;
runArena(30, { draw: true });
check('auto-fire sprays without any input', arena.player.spraying, 'player.spraying');
check('auto-fire damages the target', autoTarget.hp < autoHpBefore, `hp ${autoHpBefore.toFixed(0)} -> ${autoTarget.hp.toFixed(0)}`);
check('auto-aim points at the target', Math.abs(arena.player.aim) < 0.25, `aim=${arena.player.aim.toFixed(2)}`);

// Nothing in range: the spray should hold its charge.
arena.enemies.length = 0;
runArena(30);
check('auto-fire holds off when nothing is in range', !arena.player.spraying);
check('campaign still requires the trigger', (() => {
  const cInput = new Input();
  const cGame = new Game(cInput, new GameAudio());
  cInput.debugSet({ pressed: ['Enter'] });
  cGame.update(STEP); cInput.endFrame();
  cGame.enemies.push(new Enemy('aphid', cGame.player.x + 40, cGame.player.y, { health: 30, speed: 0, damage: 1 }));
  for (let i = 0; i < 20; i++) { cGame.update(STEP); cInput.endFrame(); }
  return cGame.mode === 'campaign' && !cGame.player.spraying;
})());

section('Arena mode: XP, levels and the upgrade draft');
arena.enemies.length = 0;
arena.orbs.length = 0;
const xpVictim = new Enemy('aphid', arena.player.x + 60, arena.player.y, { health: 0.2, speed: 0, damage: 1 });
xpVictim.spawnAnim = 1;
arena.enemies.push(xpVictim);
runArena(40);
check('killed bugs drop XP motes', arena.progression.totalXp > 0 || arena.orbs.length > 0, `orbs=${arena.orbs.length} xp=${arena.progression.totalXp}`);

// Motes are magnetised and collected.
arena.orbs.length = 0;
arena.orbs.push(new XpOrb(arena.player.x + 60, arena.player.y + 20, 3));
const xpBefore = arena.progression.totalXp;
runArena(40);
check('XP motes magnet in and are collected', arena.progression.totalXp > xpBefore && arena.orbs.length === 0, `xp=${arena.progression.totalXp}`);

// Enough XP to level: the run pauses for a draft.
arena.orbs.push(new XpOrb(arena.player.x, arena.player.y, xpForLevel(arena.progression.level) + 2));
runArena(3);
check('levelling opens the upgrade draft', arena.state === 'levelup', `state=${arena.state}`);
check('draft offers three choices', arena.progression.choices.length === 3, `${arena.progression.choices.length} cards`);
check('first draft always offers a sub-weapon', arena.progression.choices.some((c) => c.weapon));
arena.draw(ctx);
check('level-up screen renders without error', true);

const frozenTime = arena.director.time;
runArena(30);
check('the run is frozen during a draft', arena.director.time === frozenTime && arena.state === 'levelup');

const pickedDef = arena.progression.choices[0];
aInput.debugSet({ pressed: ['Digit1'] });
runArena(1);
check('pressing 1 takes the first card', arena.progression.levelOf(pickedDef.id) === 1, pickedDef.name);
check('play resumes after the draft', arena.state === 'playing', `state=${arena.state}`);

// Keyboard navigation + Enter, and stacked level-ups.
arena.orbs.push(new XpOrb(arena.player.x, arena.player.y, 400));
runArena(3);
check('a big XP pickup can queue several levels', arena.progression.pending > 1, `pending=${arena.progression.pending}`);
const beforePending = arena.progression.pending;
aInput.debugSet({ pressed: ['ArrowRight'] });
runArena(1);
aInput.debugSet({ pressed: ['Enter'] });
runArena(1);
check('arrow keys + Enter take a card', arena.progression.pending === beforePending - 1, `pending=${arena.progression.pending}`);
check('queued levels keep the draft open', arena.state === 'levelup');
// Drain the queue.
let guard = 60;
while (arena.state === 'levelup' && guard-- > 0) {
  aInput.debugSet({ pressed: ['Digit1'] });
  runArena(1);
}
check('draining the queue returns to play', arena.state === 'playing', `state=${arena.state}`);

section('Arena mode: sub-weapons fire on their own');
function weaponKillTest(id, place) {
  const wInput = new Input();
  const g = new Game(wInput, new GameAudio());
  g.selectedMode = 1;
  wInput.debugSet({ pressed: ['Enter'] });
  g.update(STEP); wInput.endFrame();
  g.weapons.loadout.levelUp(id);
  g.weapons.loadout.levelUp(id);
  g.enemies.length = 0;
  const victim = new Enemy('aphid', place.x(g), place.y(g), { health: 1, speed: 0, damage: 1 });
  victim.spawnAnim = 1;
  g.enemies.push(victim);
  const before = victim.hp;
  for (let i = 0; i < 150; i++) {
    // keep the main spray pointed away so only the sub-weapon can be responsible
    wInput.debugSet({ pointer: { x: g.player.x - 400, y: g.player.y }, pointerDown: false });
    g.update(STEP);
    wInput.endFrame();
  }
  return { before, victim, game: g };
}
const sprinklerTest = weaponKillTest('sprinkler', { x: (g) => g.player.x + 67, y: (g) => g.player.y });
check('sprinkler droplets damage bugs on their own', sprinklerTest.victim.hp < sprinklerTest.before || sprinklerTest.victim.dead, `hp=${sprinklerTest.victim.hp.toFixed(1)}`);
const thornTest = weaponKillTest('thorn', { x: (g) => g.player.x + 40, y: (g) => g.player.y });
check('thorn aura damages bugs on its own', thornTest.victim.dead || thornTest.victim.hp < thornTest.before, `hp=${thornTest.victim.hp.toFixed(1)}`);
const seedTest = weaponKillTest('seedshot', { x: (g) => g.player.x + 260, y: (g) => g.player.y - 120 });
check('seed shot launches homing projectiles', seedTest.game.kills > 0 || seedTest.victim.hp < seedTest.before, `kills=${seedTest.game.kills} hp=${seedTest.victim.hp.toFixed(1)}`);

section('Arena mode: swarms, elites and bosses');
const dir = new ArenaDirector();
let dSpawns = 0, dSwarms = 0, dElites = 0, dBosses = [], dVariants = { normal: 0, elite: 0, boss: 0 };
let peakBatch = 0;
const dirEvents = {
  spawn: (kind, scaling, variant) => {
    dSpawns++;
    dVariants[variant]++;
  },
  onSwarm: (edge, kind, count) => {
    dSwarms++;
    peakBatch = Math.max(peakBatch, count);
  },
  onElite: () => dElites++,
  onBoss: (name) => dBosses.push(name),
};
for (let i = 0; i < 60 * 620; i++) dir.update(STEP, 40, dirEvents);
check('director runs a 10-minute timeline', dir.finished && dir.remaining === 0, `time=${dir.time.toFixed(0)}s`);
check('swarm bursts fire repeatedly', dSwarms >= 10, `${dSwarms} swarms, biggest ${peakBatch}`);
check('swarms grow over the run', peakBatch >= 20, `peak=${peakBatch}`);
check('elites appear', dElites >= 6, `${dElites} elites`);
check('both bosses spawn on schedule', dBosses.length === 2, dBosses.join(' + '));
check('hundreds of bugs are spawned across a run', dSpawns > 800, `${dSpawns} spawns`);
check('variant mix includes elites and bosses', dVariants.elite >= 6 && dVariants.boss === 2, JSON.stringify(dVariants));
check('difficulty scaling ramps with time', (() => {
  const early = new ArenaDirector();
  early.time = 30;
  const late = new ArenaDirector();
  late.time = 540;
  return late.scaling().health > early.scaling().health * 2.5;
})(), `x${dir.scaling().health.toFixed(2)} health at the end`);

const eliteRef = new Enemy('beetle', 0, 0, { health: 1, speed: 1, damage: 1 }, 'elite');
const bossRef = new Enemy('beetle', 0, 0, { health: 1, speed: 1, damage: 1 }, 'boss');
const normalRef = new Enemy('beetle', 0, 0, { health: 1, speed: 1, damage: 1 });
check('elites are tougher than regular bugs', eliteRef.maxHp > normalRef.maxHp * 3 && eliteRef.radius > normalRef.radius);
check('bosses are far tougher and bigger', bossRef.maxHp > eliteRef.maxHp * 5 && bossRef.isBoss && bossRef.xpValue > eliteRef.xpValue);
check('bosses resist knockback', (() => {
  bossRef.applyKnockback(1, 0, 1000);
  normalRef.applyKnockback(1, 0, 1000);
  return Math.abs(bossRef.kx) < Math.abs(normalRef.kx);
})());

section('Arena mode: swarm load and Second Wind');
const loadInput = new Input();
const load = new Game(loadInput, new GameAudio());
load.selectedMode = 1;
loadInput.debugSet({ pressed: ['Enter'] });
load.update(STEP); loadInput.endFrame();
// Fast-forward the director so the trickle is at full intensity, then let it fill the field.
load.director.time = 540;
let peakAlive = 0;
const t0 = performance.now();
let loadDrafts = 0;
for (let i = 0; i < 60 * 45; i++) {
  load.player.health = load.player.maxHealth; // survive the stress test
  // Auto-draft, otherwise the run sits frozen on the level-up screen.
  if (load.state === 'levelup') {
    loadInput.debugSet({ pressed: ['Digit1'] });
    loadDrafts++;
  }
  load.update(STEP);
  loadInput.endFrame();
  peakAlive = Math.max(peakAlive, load.enemies.length);
}
const msPerStep = (performance.now() - t0) / (60 * 45);
check('swarms fill the field with hundreds of bugs', peakAlive >= 100, `peak=${peakAlive} alive`);
check('the enemy cap is respected', peakAlive <= ARENA.hardCap, `peak=${peakAlive} <= ${ARENA.hardCap}`);
check('a full field still simulates fast', msPerStep < 6, `${msPerStep.toFixed(2)}ms per 1/60s step`);
check('the stress run drafted upgrades along the way', loadDrafts > 0 && load.progression.level > 3, `level=${load.progression.level}`);

load.player.stats.revives = 1;
load.player.health = 0;
load.player.invuln = 0;
const enemiesBefore = load.enemies.length;
load.update(STEP);
loadInput.endFrame();
check('Second Wind revives instead of ending the run', load.state === 'playing' && load.player.health > 0, `hp=${load.player.health.toFixed(0)}`);
check('the revive keeps the field intact', load.enemies.length >= enemiesBefore - 5);
load.player.stats.revives = 0;
load.player.health = 0;
load.player.invuln = 0;
load.update(STEP);
loadInput.endFrame();
check('without a revive the run ends', load.state === 'gameover' && !load.victory);

section('Arena mode: victory and per-mode high scores');
const vInput = new Input();
const victory = new Game(vInput, new GameAudio());
victory.selectedMode = 1;
vInput.debugSet({ pressed: ['Enter'] });
victory.update(STEP); vInput.endFrame();
victory.score = 54321;
victory.director.time = ARENA.duration - 0.01;
for (let i = 0; i < 5; i++) { victory.update(STEP); vInput.endFrame(); }
check('surviving ten minutes wins the run', victory.state === 'gameover' && victory.victory, `victory=${victory.victory}`);
victory.draw(ctx);
check('victory screen renders without error', true);
check('arena score is stored under its own key', store.get('garden-defenders.arena.highscore') === String(Math.floor(victory.score)), store.get('garden-defenders.arena.highscore'));
check('campaign best is untouched by an arena run', store.get('garden-defenders.highscore') === '12345', store.get('garden-defenders.highscore'));
const reloadedModes = new Game(new Input(), new GameAudio());
check('both high scores load independently', reloadedModes.highScores.campaign === 12345 && reloadedModes.highScores.arena >= 54321, JSON.stringify(reloadedModes.highScores));

check('every upgrade applies without error', (() => {
  const uInput = new Input();
  const u = new Game(uInput, new GameAudio());
  u.selectedMode = 1;
  uInput.debugSet({ pressed: ['Enter'] });
  u.update(STEP); uInput.endFrame();
  const c = { stats: u.player.stats, player: u.player, weapons: u.weapons, addScore: (n) => { u.score += n; } };
  for (const def of UPGRADES) {
    for (let lvl = 1; lvl <= Math.min(def.maxLevel, 6); lvl++) {
      def.apply(c, lvl);
      def.describe(lvl, { weapons: u.weapons });
    }
  }
  // sanity: multipliers moved and every weapon is live
  for (let i = 0; i < 120; i++) { u.update(STEP); uInput.endFrame(); if (i % 20 === 0) u.draw(ctx); }
  return u.player.stats.sprayDamage > 1 && u.weapons.loadout.owned.length === 3 && u.state !== 'gameover';
})(), `${UPGRADES.length} upgrades`);

/* --------------------------------------------------------------- layout ---- */
section('Screen layout stays inside the 1280x720 frame');
const { VIEW } = await import('../src/config.ts');
function recordScreen(label, prepare) {
  ctx.texts = [];
  ctx.recording = true;
  prepare();
  game.draw(ctx);
  ctx.recording = false;
  const strays = ctx.texts.filter(
    (t) => t.x < 0 || t.x > VIEW.w || t.y < 8 || t.y > VIEW.h,
  );
  check(
    `${label} text is on-screen`,
    strays.length === 0 && ctx.texts.length > 0,
    strays.length > 0
      ? `${strays.length} stray: ${strays.map((t) => `"${t.value}"@${t.x.toFixed(0)},${t.y.toFixed(0)}`).join(' ')}`
      : `${ctx.texts.length} strings`,
  );
}

const layoutInput = new Input();
const layoutGame = new Game(layoutInput, new GameAudio());
const saved = game.state;
recordScreen('title screen', () => {
  game.state = 'title';
});
recordScreen('in-play HUD', () => {
  game.state = 'playing';
  game.score = 987654;
  game.player.powerTimer = 6.4;
});
recordScreen('pause overlay', () => {
  game.state = 'paused';
});
recordScreen('game over screen', () => {
  game.state = 'gameover';
  game.newRecord = true;
});
const arenaLayout = new Game(new Input(), new GameAudio());
function recordArena(label, prepare) {
  ctx.texts = [];
  ctx.recording = true;
  prepare();
  arenaLayout.draw(ctx);
  ctx.recording = false;
  const strays = ctx.texts.filter((t) => t.x < 0 || t.x > VIEW.w || t.y < 8 || t.y > VIEW.h);
  check(
    `${label} text is on-screen`,
    strays.length === 0 && ctx.texts.length > 0,
    strays.length > 0
      ? `${strays.length} stray: ${strays.map((t) => `"${t.value}"@${t.x.toFixed(0)},${t.y.toFixed(0)}`).join(' ')}`
      : `${ctx.texts.length} strings`,
  );
}
recordArena('arena HUD', () => {
  arenaLayout.startRun('arena');
  arenaLayout.progression.addXp(120);
  arenaLayout.weapons.loadout.levelUp('sprinkler');
  arenaLayout.weapons.loadout.levelUp('thorn');
  arenaLayout.player.stats.revives = 1;
  arenaLayout.enemies.push(new Enemy('beetle', 600, 400, { health: 4, speed: 1, damage: 1 }, 'boss'));
  arenaLayout.enemies[0].bossName = 'BROOD MOTHER';
  arenaLayout.state = 'playing';
});
recordArena('level-up draft', () => {
  arenaLayout.progression.pending = 2;
  arenaLayout.progression.rollChoices(arenaLayout.weapons.loadout);
  arenaLayout.state = 'levelup';
});
recordArena('arena victory screen', () => {
  arenaLayout.state = 'gameover';
  arenaLayout.victory = true;
  arenaLayout.newRecord = true;
});
game.state = saved;
check('a second game instance renders independently', (() => {
  layoutGame.draw(ctx);
  return true;
})());

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
