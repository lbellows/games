# brotato-clone — module contract

A Brotato-style arena survival game. Vanilla ES modules + canvas, **no build step,
no dependencies** — `index.html` opens directly in a browser. Node 26 is available
for syntax-checking only.

House style (match `../grok-1shot-game`): ES modules, 2-space indent, double quotes,
semicolons, short comments explaining *why*, no framework, no TypeScript.

## Loop shape

Fixed arena `1280x720`, no camera scroll. Player auto-fires at the nearest enemy.
Survive a timed wave -> collect materials -> spend them in a shop -> next wave.
20 waves. Level-ups mid-wave offer a choice of stat upgrades.

## Ownership — edit ONLY your files

| Owner | Files |
|---|---|
| integrator (already written) | `js/core.js`, `js/stats.js`, `js/player.js`, `js/game.js`, `js/main.js` |
| agent A | `js/enemies.js`, `js/waves.js` |
| agent B | `js/weapons.js`, `js/projectiles.js` |
| agent C | `js/items.js`, `js/shop.js` |
| agent D | `js/render.js`, `js/ui.js`, `css/game.css`, `index.html` |

Never edit a file you do not own; never edit `core.js` or `stats.js`. If you need
something from another module that does not exist yet, code against the interface
below and assume it works.

## Shared imports

From `./core.js`: `ARENA`, `RNG`, `Emitter`, `Grid`, `Input`, `clamp`, `lerp`,
`dist`, `dist2`, `angleTo`, `norm`, `hits`, `confine`, `compact`, `TAU`, `fmt`.

From `./stats.js`: `BASE_STATS`, `STAT_LABELS`, `PERCENT_STATS`, `newStats`,
`computeStats`, `moveSpeed`, `applyArmor`, `attackCooldown`, `rollDamage`,
`xpForLevel`, `PLAYER_BASE_SPEED`.

## The game state object `G`

One mutable object threaded through everything. Never reassign its arrays.

```js
G = {
  phase,        // "menu" | "wave" | "shop" | "levelup" | "gameover" | "win"
  wave,         // 1-based wave number
  t,            // seconds elapsed in the current wave
  waveTime,     // total seconds this wave runs
  rng,          // RNG instance
  bus,          // Emitter
  input,        // Input
  player,       // see below
  stats,        // computed stat block (read-only; integrator recomputes)
  enemies, projectiles, hazards, pickups, effects,  // arrays, mutate in place
  weapons,      // array of weapon instances, max 6
  items,        // array of item defs the player owns
  materials,    // currency
  level, xp,
  grid,         // Grid of enemies, rebuilt each frame by the integrator
  kills, waveKills,
}
```

### Entity shapes (fixed — the renderer depends on these exact fields)

```js
player   = { kind:"player", x, y, vx, vy, r:14, hp, iframes, facing, dead }
enemy    = { kind:"enemy", type, x, y, vx, vy, r, hp, maxHp, speed, damage,
             xp, mats, color, shape, elite, hitFlash, dead, ai, data }
proj     = { kind:"proj", x, y, vx, vy, r, damage, crit, pierce, life, maxLife,
             color, shape, rot, hostile, hitSet, dead, data }
pickup   = { kind:"pickup", type:"material"|"xp"|"heal"|"crate",
             x, y, vx, vy, r, value, magnet, dead }
```

`shape` for enemies is one of `"blob" | "spike" | "square" | "triangle" | "ring"`.
`shape` for projectiles is one of `"bullet" | "slash" | "orb" | "shard"`.
`color` is a CSS hex string. `hitFlash` counts down in seconds; the renderer
tints the enemy white while it is > 0. Set `dead = true` to despawn; the
integrator compacts the arrays.

## Interfaces each agent must export

### agent A — `js/enemies.js`

```js
export const ENEMY_TYPES;                  // { id: def }, def has the fields above plus tier
export function spawnEnemy(G, typeId, x, y);  // pushes onto G.enemies, returns it
export function updateEnemies(G, dt);      // AI, movement, contact damage via G.hurtPlayer
export function onEnemyDeath(G, enemy);    // drops materials/xp via G.spawnPickup
```

AI kinds: `"chase"` (straight at player), `"charger"` (winds up, dashes),
`"shooter"` (keeps distance, calls `G.spawnHazard`), `"orbiter"`, `"splitter"`
(spawns smaller copies on death), `"boss"`. At least 10 enemy types with a
difficulty tier 1-4, plus 2 bosses. Scale hp/damage with `G.wave`.

### agent A — `js/waves.js`

```js
export const TOTAL_WAVES = 20;
export function waveDuration(wave);        // seconds, ~20 rising to ~60
export function startWave(G, wave);        // resets the spawn director
export function updateWaveSpawns(G, dt);   // trickle-spawns from arena edges
export function waveBudget(wave);          // spawn-points budget for pacing
```

Spawn at arena edges, never on top of the player. Every 5th wave (5,10,15,20) is
a boss wave. Difficulty must ramp smoothly, not spike.

### agent B — `js/weapons.js`

```js
export const WEAPON_DEFS;                  // { id: def }, >= 14 weapons
export function makeWeapon(defId, tier);   // -> weapon instance
export function updateWeapons(G, dt);      // aim, cooldowns, fire
export function weaponDps(w, stats);       // number, for shop tooltips
```

Weapon def: `{ id, name, type:"melee"|"ranged"|"elemental", damage, cooldown,
range, knockback, tier:1..4, price, pierce, count, spread, color, projShape,
desc, scaling:{melee|ranged|damage} }`. Weapons auto-target the nearest enemy in
range and fire on cooldown — the player never aims. Melee weapons sweep an arc
(spawn a short-lived `"slash"` projectile). Include at least one turret/structure
weapon that scales with `engineering`. Tier 1-4 mirrors Brotato's rarity.

### agent B — `js/projectiles.js`

```js
export function spawnProjectile(G, spec);  // spec merges onto the proj shape
export function spawnHazard(G, spec);      // same, hostile:true
export function updateProjectiles(G, dt);  // move, collide, expire
```

Player projectiles collide with enemies using `G.grid`; hazards collide with the
player. Use `hitSet` (a `Set`) so a piercing shot hits each enemy once. On hit
call `G.hurtEnemy(enemy, damage, crit, proj)`. Expire off-arena or at `life <= 0`.

### agent C — `js/items.js`

```js
export const ITEM_DEFS;                    // { id: def }, >= 30 items
export function itemPool(G, tier);         // items eligible to roll
export function applyItemEffects(G, item); // one-shot effects on pickup (heals etc.)
```

Item def: `{ id, name, tier:1..4, price, mods:{...stat keys}, tags, desc, color }`.
Most items are pure stat modifiers folded by `computeStats` — the integrator
collects `G.items.map(i => i.mods)`. Include trade-off items (e.g. +damage,
-max hp), as Brotato does.

### agent C — `js/shop.js`

```js
export function openShop(G);               // rolls 4 offers, resets reroll price
export function rerollShop(G);             // charges G.materials, re-rolls
export function buyOffer(G, index);        // validates cost, applies item/weapon
export function sellWeapon(G, slotIndex);  // refunds
export function shopState(G);              // -> { offers, rerollCost, canReroll }
```

Offers mix items and weapons. Tier odds improve with `G.wave` and `stats.luck`.
Reroll cost rises within a visit. Prices scale with wave number. The shop is
pure state — agent D renders it from `shopState(G)`.

### agent D — `js/render.js`

```js
export function initRender(canvas);
export function render(G, alpha);          // draws one frame
export function addFx(G, kind, x, y, opts);// particles, damage numbers, ring bursts
export function updateFx(G, dt);
```

Draw order: arena floor/grid, pickups, player, enemies, projectiles, effects.
No sprite assets — everything is drawn with canvas primitives (shapes, gradients,
strokes). Floating damage numbers, crits in a distinct color, hit flashes, death
bursts, muzzle flashes, a subtle screen shake on player damage. Must stay 60fps
with ~300 entities. Effects live in `G.effects` and are visual-only.

### agent D — `js/ui.js`, `css/game.css`, `index.html`

```js
export function initUI(G, actions);        // actions: {start, reroll, buy, sell, next, pickUpgrade, restart}
export function syncUI(G);                 // called every frame; keep it cheap
```

DOM overlay on top of `<canvas id="view">`. Screens: title, in-wave HUD (hp bar,
wave number, countdown, materials, level/xp bar, weapon slots), level-up choice
(3 stat cards), shop (4 offers + reroll + weapon slots + stat sheet), game over,
victory. Keyboard: WASD/arrows move, `Space` confirm, `R` reroll, `1-4` buy,
`Esc` pause. `index.html` loads Google Fonts, `css/game.css`, and
`<script type="module" src="js/main.js">`. Style it dark, punchy, arcade — this
is a game, not a dashboard. Must be readable at 1280x720 and scale down.

## Integrator-provided callbacks on `G` (assume these exist)

```js
G.hurtEnemy(enemy, amount, crit, source)  // applies damage, life steal, death
G.hurtPlayer(amount)                      // dodge, armor, i-frames, death
G.spawnPickup(x, y, type, value)
G.spawnProjectile(spec)  G.spawnHazard(spec)   // thin wrappers over agent B
G.addFx(kind, x, y, opts)                 // thin wrapper over agent D
G.grantXp(amount)  G.grantMaterials(amount)
```

## Definition of done

Your files must parse as ES modules under Node 26
(`node --input-type=module -e "import('./js/yourfile.js')"` resolves, allowing for
imports of not-yet-written sibling modules). Balance for a ~15 minute run that is
winnable but not trivial. Write real content — no `TODO`, no placeholder arrays.
