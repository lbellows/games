# brotato-clone

A Brotato-style arena survival roguelite that runs in the browser. Vanilla ES
modules and a 2D canvas — **no dependencies, no build step**. The player is one
PNG sprite; shop, upgrade and weapon icons are inline SVG. Everything else is
drawn with canvas primitives.

You never aim. Your weapons pick their own targets and fire on cooldown; your
only job is to move, survive the wave, and spend the materials you collect.

```
git clone <this repo> && cd brotato-clone
npm start          # -> http://localhost:8080
```

`index.html` also opens directly from disk if you prefer `file://`.

## Playing

| Key | Does |
|---|---|
| `WASD` / arrows | move (this is the whole game) |
| `1`-`4` | buy the matching shop offer |
| `R` | reroll the shop |
| `Space` | confirm / next wave |
| `Esc` | pause |

Survive 20 waves. Every 5th wave is a boss. Between waves you pick a stat
upgrade for each level gained, then shop. Materials left on the ground are swept
up automatically when a wave ends, so you never have to suicide for loot.

## What's in it

- **19 weapons** — 7 melee, 9 ranged, 3 elemental, each at 4 tiers. Melee sweeps
  a real arc; the rocket homes and explodes; lightning forks to three more
  targets; the ice wand leaves a chilling patch; the turret and orbital saw
  scale off Engineering instead of Melee/Ranged damage.
- **53 items** across 4 tiers, most with a genuine downside. Ten tier-4
  build-definers are gated behind wave 8+ and limited to one each.
- **19 enemies** including 2 multi-phase bosses, across 6 AI behaviours: chase,
  charger (telegraphed dash), shooter, orbiter, splitter, and boss.
- **15 stats** that all actually do something, with armor on a diminishing
  curve and dodge hard-capped at 60%.
- **20 waves**, ~12.5 minutes of wave time, difficulty ramping on a tuned
  spawn-point budget rather than a flat multiplier.

## Layout

```
js/core.js         RNG, vector math, collision, spatial hash, input, events
js/stats.js        the stat contract: scaling, armor, crits, xp curve
js/player.js       movement, i-frames, pickup magnetism, leveling
js/game.js         game state, damage routing, phase machine
js/main.js         fixed-timestep bootstrap
js/enemies.js      enemy roster + AI                     js/waves.js     spawn director
js/weapons.js      weapon roster + auto-targeting        js/projectiles.js  bullets, arcs, areas
js/items.js        item roster                           js/shop.js      offers, rerolls, economy
js/render.js       all canvas drawing + effects          js/ui.js        DOM overlay, screens
js/icons.js        SVG shop/upgrade/weapon glyphs        art/player.png  the spud
```

The simulation runs at a fixed 60Hz step with the renderer interpolating, so
the game plays identically regardless of display refresh rate.

## Tests

```
npm test           # headless logic sim: content tables, a full 20-wave run, balance guards
npm run test:browser   # real headless Brave: canvas, input, UI wiring, screenshots
```

The browser suite drives an actual browser over CDP with trusted input — it
catches module load errors, renderer exceptions and broken UI wiring that a
headless sim cannot. `node test/browser-test.cjs --head` shows the window.

## Tuning

Most balance lives in three places: `SCALING` in `js/enemies.js` (enemy hp,
damage and elite curves), `PACING` in `js/waves.js` (spawn budget and ramp), and
`TUNING` in `js/game.js` (implicit max HP per level). Item and weapon numbers sit
inline in their definition tables.
