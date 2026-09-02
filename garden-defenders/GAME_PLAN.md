# Garden Defenders — Implementation Plan

Top-down single-player survival game. The player defends a fenced garden from waves of
insects using a short-range spray. Vite + TypeScript + HTML Canvas, no backend, no external
assets (everything is drawn with canvas primitives and synthesized with the Web Audio API).

## 1. Stack & constraints

- [x] Repository was empty -> scaffold Vite + TypeScript + Canvas (`npm install`, `npm run dev`).
- [x] No backend, database, login, third-party API or paid service.
- [x] All art code-generated (shapes, gradients, particles); all audio synthesized (Web Audio).
- [x] Fixed logical resolution 1280x720, letterboxed and scaled to any window size (down to ~360px wide).
- [x] Modular source layout, no single mega-file.

## 2. Architecture

- [x] `src/main.ts` — bootstrap: canvas, DPR-aware resize/letterbox, fixed-timestep RAF loop.
- [x] `src/config.ts` — all tunables (balance numbers, palette, wave shaping) in one place.
- [x] `src/core/` — engine services:
  - [x] `math.ts` vectors/clamp/lerp/rng helpers
  - [x] `input.ts` keyboard + mouse, logical-space pointer mapping, "mouse active?" tracking
  - [x] `audio.ts` Web Audio synth SFX + persisted mute
  - [x] `camera.ts` screen shake
  - [x] `storage.ts` localStorage high score (safe if storage is blocked)
- [x] `src/entities/` — `Player`, `Enemy` (3 behaviour types), `Pickup`, `Particles` pool.
- [x] `src/systems/` — `Spray` (cone hit test + energy), `WaveManager` (waves, countdown, spawn budget),
      `Collisions` (contact damage, knockback, pickup pickup).
- [x] `src/render/` — `background.ts` (pre-rendered garden), `hud.ts`, `screens.ts` (title/pause/game over/banners).
- [x] `src/game/Game.ts` — state machine (`title | countdown | playing | paused | gameover`) and orchestration.

## 3. Gameplay

- [x] Movement WASD + arrow keys; mouse aim; hold LMB or Space to spray.
- [x] Keyboard-only fallback: aim follows last movement direction when the mouse hasn't moved.
- [x] Player: health, speed, 0.8s damage invulnerability (blink), energy meter with recharge delay.
- [x] Spray: cone, damage over time + knockback, particles, energy drain, empty-tank lockout.
- [x] Enemies spawn outside the fence and pursue:
  - [x] **Aphid** — fast, low HP, basic chaser with slight wander.
  - [x] **Beetle** — slow, high HP, heavy contact damage, knockback-resistant, armoured shell.
  - [x] **Moth** — sine-weaving approach with periodic forward dash bursts.
- [x] Seed pickups: Sun Seed (score), Aloe Seed (heal), Bloom Seed (10s power-up: stronger/cheaper spray + speed).
- [x] Waves: visible wave number, 3s countdown between waves, growing spawn budget, escalating stats.
- [x] Clearing wave 10 = win banner, then endless mode keeps escalating.
- [x] Title screen w/ instructions, Escape/P pause, game over + restart (R / button), score, high score.
- [x] Screen shake, hit flash, particles, SFX; M toggles mute (persisted).

## 4. HUD

- [x] Health bar, energy bar, score, high score, wave number, enemies remaining, pause/mute indicators.
- [x] Active power-up timer chip.

## 5. Process

- [x] Inspect repo, write this plan.
- [x] Implement modules.
- [x] README with setup/run/build/controls/structure.
- [x] `npm install`, `npm run dev`, `npm run build`, `npm run typecheck` all pass.
- [x] Automated headless smoke test (`npm run smoke`, 62 checks) drives the real game modules through
      title -> play -> spray -> damage -> pickups -> waves -> pause -> mute -> game over -> high score,
      renders every screen through a strict canvas stub, and asserts all HUD/menu text stays inside
      the 1280x720 frame.
- [ ] Manual *visual* pass in a real browser — see limitations.

## 6. Arena mode (roguelite)

- [x] Mode select on the title screen (Campaign / Arena) with per-mode high scores.
- [x] `src/systems/stats.ts` — per-run `StatBlock`; campaign keeps every multiplier at 1.0.
- [x] `src/core/grid.ts` — uniform spatial hash so 200+ bug swarms stay near O(n) for separation
      and weapon queries (measured 240 bugs at ~0.11ms per 1/60s step).
- [x] Auto-fire: spray auto-targets the nearest bug and fires when in range; holding the mouse
      button hands aiming back to the player. Energy still gates uptime.
- [x] XP motes (`src/entities/xporb.ts`) with a magnet radius, plus overflow absorption.
- [x] `src/systems/progression.ts` — XP curve, 16-upgrade pool, weighted 3-card draft that
      guarantees a sub-weapon while the run has none; queued level-ups drafted in turn.
- [x] Level-up screen (`src/render/levelup.ts`) — cards with procedural icons, level pips, and
      mouse / `1` `2` `3` / arrows+Enter selection. Freezes the run while open.
- [x] `src/systems/weapons.ts` — three auto-firing sub-weapons: orbiting Sprinkler, homing
      piercing Seed Shot, damaging Thorn Aura; all level up.
- [x] Second Wind upgrade: survive one fatal hit, shove the swarm off, keep the run alive.
- [x] `src/systems/director.ts` — 10-minute timeline: ramping trickle, edge swarm bursts with
      warning banner, elites, and two bosses (BROOD MOTHER 5:00, SWARM QUEEN 9:00).
- [x] Elite and boss enemy variants with crowns, auras, boss health bar in the HUD.
- [x] Arena HUD: countdown timer, XP bar + level badge, acquired-upgrade chips, revive chip.
- [x] Victory screen for surviving the full ten minutes; mode-specific game-over stat rows.
- [x] Arena sound effects (seed shot, XP tick, level up, swarm/boss warnings, revive, victory).
- [x] 51 additional smoke checks covering all of the above (113 total).
- [x] Balance tuned against a drafting auto-pilot: deaths spread 4:00-5:30, ~25% win rate.

## Deliberate limitations

- **The visual pass is the one thing not machine-verified.** Browser automation was unavailable in
  this environment, so no screenshot of the running game was taken. Everything behavioural is
  covered by `npm run smoke` (which exercises the real update *and* draw paths and checks screen
  layout bounds), and `npm run build` is clean, but colour/feel judgement calls need a human look at
  `npm run dev`.

- **Desktop-first.** Mouse aim + keyboard are the supported inputs; there are no touch controls
  or on-screen joystick, so phones/tablets can't play even though the canvas scales down.
- **No sprite atlas / no animation frames.** Enemies and the player are procedural vector shapes
  with rotation, squash and wobble instead of hand-drawn frames.
- **No music.** Only short synthesized SFX, to keep the Web Audio footprint small and non-annoying.
- **Single garden layout.** The garden background is generated from a fixed seed, so plots and
  flowers are identical every run (intentional: readability and stable enemy sightlines).
- **Local-only scores.** High score lives in `localStorage`; there is no leaderboard or profile.
- **Balance is tuned against bots, not human playtesters.** A crude kiting auto-pilot averages
  wave 5 in Campaign; a drafting auto-pilot dies between 4:00 and 5:30 in Arena and wins about one
  run in four. Both goals should therefore be reachable for a human, but real playtesting may still
  want the numbers nudged (see the Tuning section of the README for where they live).
- **Endless mode does not add mechanics.** Past campaign wave 10 only the counts and stat
  multipliers grow, so very deep runs (~wave 25+) become a war of attrition.
- **Arena has no meta-progression.** No unlocks, characters or persistent upgrades between runs —
  only the high score carries over. Each run starts from the same base stats.
- **The upgrade pool has no synergies or evolutions.** Cards stack numerically; there are no
  combined/evolved weapons the way the genre often does it.
- **Only two bosses, sharing regular bug behaviour.** They are scaled-up beetles and moths with
  crowns, auras and a health bar, not bespoke attack patterns.
