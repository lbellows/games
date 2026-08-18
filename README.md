# Garden Defenders

A top-down survival game for the browser. You are the gardener; insects want your vegetable
plots. Move, aim, spray, grab seeds, and hold the garden for as long as you can.

Two modes, picked from the title screen:

- **Campaign** — 10 hand-paced waves, then endless. Manual spray, seed pickups, wave bonuses.
- **Arena** — a 10-minute roguelite run. Auto-fire, XP, level-up drafts, sub-weapons, swarms,
  elites and two bosses.

Everything is generated at runtime — the art is canvas shapes and particles, the sound is
synthesized with the Web Audio API. No images, no audio files, no backend, no accounts.

Built with **Vite + TypeScript + HTML Canvas**.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default <http://localhost:5173>). Click the canvas once so the
browser lets the game play sound, then hit **START**.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload (`npm start` is an alias) |
| `npm run build` | Type-check (`tsc --noEmit`) then build to `dist/` |
| `npm run preview` | Serve the production build from `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run smoke` | Headless smoke test: drives the real game modules through the whole flow |

Requirements: Node 18+ for `dev`/`build`. `npm run smoke` imports `.ts` files directly, so it
needs Node 23+ (or `node --experimental-strip-types scripts/smoke.mjs` on Node 22).

## Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Aim | Mouse — or, with no mouse input, your last movement direction |
| Spray | Hold left mouse button or `Space` |
| Pause / resume | `P` or `Esc` |
| Mute / unmute | `M` (remembered between sessions) |
| Restart | `R` (on the pause or game-over screen), `Enter`, or the on-screen button |
| Back to title | `T` (on the pause or game-over screen) |
| Pick a mode (title) | `←` `→` or `1` / `2`, then `Enter` — or click a mode card |
| Pick an upgrade (Arena) | click a card, `1` / `2` / `3`, or `←` `→` + `Enter` |
| Start | `Enter`, `Space`, or click |

The game is fully playable from the keyboard alone: when the mouse hasn't moved for a couple of
seconds, aim snaps to the direction you last walked, and the arc in front of the gardener shows
where the spray will land.

## How to play — Campaign

- **Spray** is a short-range cone. It damages *and* shoves bugs back, so it doubles as crowd
  control. It burns spray energy; energy refills shortly after you let go. Empty the tank and the
  nozzle locks out until it has recovered a quarter of the meter — don't hold the trigger forever.
- **Contact hurts.** Touching any bug costs health and gives you a short window of invulnerability
  (the gardener flashes) plus a knock-back, so you can escape a pile-up.
- **Bugs**
  - 🟠 **Aphid** — fast, fragile, arrives in numbers, scuttles on a wobbly line.
  - 🟣 **Beetle** — slow and armoured, resists knock-back, hits hard. Beetles have a health bar.
    They also drop seeds most often.
  - ⚪ **Moth** — weaves in a sine pattern, then winds up and *bursts* straight at you. Watch for
    the ring flash before the dash.
- **Seeds** appear on their own every few seconds, and drop from defeated bugs:
  - 🟡 **Sun Seed** — score.
  - 🟢 **Aloe Seed** — health.
  - 🩷 **Bloom Seed** — 10 seconds of stronger, longer, cheaper spray and faster boots.
  Seeds blink before they rot away.
- **Waves** run on a short countdown, then a fixed roster of bugs drips onto the field. Clear the
  roster to bank a wave bonus and 10 health. Every wave adds more bugs with more health, speed and
  damage.
- **Wave 10** is the win condition: the garden is saved, you bank a large bonus, and the run rolls
  straight into **endless mode** (`WAVE 11 ∞`, difficulty still climbing) until you fall.
- **Score** comes from bugs sprayed, seeds collected, seconds survived and wave bonuses. Your best
  score is stored in `localStorage` and shown as `BEST` in the HUD and on the game-over screen.

The HUD along the top shows health, spray energy (striped while locked out, with a Bloom timer when
powered up), score and best, the current wave, and how many bugs are left in it. Mute and pause
state show as chips in the bottom-right corner.

## How to play — Arena

Arena is a 10-minute roguelite run. The rules above still apply — same gardener, same bugs, same
seeds — with these differences:

- **Auto-fire.** The spray targets the nearest bug and fires by itself whenever something is in
  range. Hold left click to override and aim manually. Energy still limits how long you can hose.
- **XP and levels.** Defeated bugs drop XP motes that magnet toward you. Filling the bar (the thin
  blue bar under the HUD) freezes the run and deals you **three upgrade cards** — pick one with a
  click, `1`/`2`/`3`, or `←`/`→` + `Enter`. Multiple levels queue up and you draft them in turn.
- **16 upgrades**, most stacking several levels: spray damage/range/arc, move speed, max health,
  regeneration, spray recharge, XP magnet radius, XP gain, knockback, seed value, and **Second
  Wind**, which lets you survive one fatal hit. Your picks show as icon chips along the bottom.
- **Three sub-weapons** fight for you once drafted, and level up alongside everything else:
  - **Sprinkler** — droplets orbiting the gardener, damaging whatever they touch.
  - **Seed Shot** — homing seeds fired on a timer; higher levels add seeds and pierce.
  - **Thorn Aura** — a constant damage ring around you.
- **The spawn director** ramps for the full ten minutes: a steady trickle, **swarm bursts** that
  wall in from one edge (announced with a banner), **elites** (crowned, tanky, big XP), and two
  bosses — **BROOD MOTHER** at 5:00 and **SWARM QUEEN** at 9:00, each with a health bar at the top
  of the screen. Bug health, speed and damage all climb with the clock.
- **Surviving to 0:00 wins the run** and shows the victory screen. Dying ends it early.
- Arena keeps its **own high score**, separate from Campaign.

Balance reference: a crude auto-pilot (perfect aim, no dodging, greedy drafting) usually dies
between 4 and 5:30 and wins about one run in four, so the clock is a real but beatable goal.

## Project structure

```
index.html               Canvas host page and letterbox styling
src/
  main.ts                Bootstrap: canvas + DPR sizing, fixed-timestep loop
  config.ts              All tunables: layout, palette, player/enemy/wave/pickup balance
  core/
    math.ts              Vector, clamp/lerp, RNG and angle helpers
    input.ts             Keyboard + mouse, logical-space pointer mapping, aim-source tracking
    audio.ts             Web Audio synthesis for every sound effect, persisted mute
    camera.ts            Screen shake
    storage.ts           localStorage high score / mute, safe when storage is blocked
  entities/
    player.ts            Gardener: movement, health, invulnerability, energy, power-up, sprite
    enemy.ts             Aphid / Beetle / Moth behaviour and sprites
    pickup.ts            Seed pickups and their icons
    particles.ts         Fixed-size particle pool plus emitters (mist, splat, death, sparkle)
  systems/
    spray.ts             Spray cone: hit test, falloff damage, knock-back, cone rendering
    waves.ts             Wave composition, spawn pacing, countdown, win/endless transition
    collisions.ts        Enemy separation, contact damage, seed collection
  render/
    background.ts        Garden pre-rendered once to an offscreen canvas (plots, paths, fence)
    hud.ts               Health/energy bars, score, wave, status chips, low-health vignette
    screens.ts           Title, pause, game over, wave banners, countdown, floating toasts
    ui.ts                Shared text/panel/bar/button primitives
  game/
    game.ts              State machine (title → playing ⇄ paused → gameover) and orchestration
scripts/
  smoke.mjs              Headless end-to-end smoke test
  canvas-stub.mjs        Strict DOM/canvas stubs used by the smoke test
GAME_PLAN.md             Implementation plan, completion checklist, known limitations
```

Rendering runs at a fixed logical resolution of 1280×720 and is letterboxed to fit the window, so
smaller windows scale the whole game down rather than cropping it. The simulation steps at a fixed
1/60s regardless of display refresh rate.

## Browser support

Desktop Chromium (Chrome, Brave, Edge) and Firefox 112+ / Safari 16.4+ — the game uses
`CanvasRenderingContext2D.roundRect`. Canvas `letterSpacing` is feature-detected, so Firefox simply
renders headings without extra tracking. There are no touch controls, so phones and tablets are out
of scope.

## Tuning

Balance lives in a few dedicated places, all hot-reloaded by the dev server:

- `src/config.ts` — player speed and energy economy, spray damage/range/knock-back, per-enemy
  stats, campaign wave curves, pickup rates.
- `src/entities/enemy.ts` — the `VARIANTS` table (elite and boss multipliers).
- `src/systems/director.ts` — the `ARENA` block: run length, enemy caps, swarm/elite cadence, boss
  timeline, plus the difficulty ramp in `scaling()`.
- `src/systems/progression.ts` — the XP curve (`xpForLevel`) and every upgrade's effect and weight.
- `src/systems/weapons.ts` — the per-level formulas for the three sub-weapons.
- `src/systems/stats.ts` — starting stats per mode.
