import {
  COLORS,
  FIELD,
  FIELD_BOTTOM,
  FIELD_RIGHT,
  PICKUPS,
  POWERUP,
  SCORE,
  SPAWN_MARGIN,
  VIEW,
  WAVES,
  type EnemyKind,
} from '../config.ts';
import { GameAudio } from '../core/audio.ts';
import { Camera } from '../core/camera.ts';
import type { Input } from '../core/input.ts';
import { clamp, rand, randInt, type Vec } from '../core/math.ts';
import { loadHighScore, saveHighScore } from '../core/storage.ts';
import { Enemy, type EnemyScaling } from '../entities/enemy.ts';
import { Particles } from '../entities/particles.ts';
import { Pickup, PICKUP_INFO, type PickupKind } from '../entities/pickup.ts';
import { Player } from '../entities/player.ts';
import { collectPickups, resolvePlayerContacts, separateEnemies } from '../systems/collisions.ts';
import { SprayWeapon } from '../systems/spray.ts';
import { WaveManager } from '../systems/waves.ts';
import { getGardenLayer } from '../render/background.ts';
import { drawHud, drawLowHealthVignette, type HudState } from '../render/hud.ts';
import {
  drawBanner,
  drawCountdown,
  drawGameOver,
  drawPause,
  drawTitle,
  drawToasts,
  restartRect,
  START_BUTTON,
  type Banner,
  type Toast,
} from '../render/screens.ts';
import { hitRect } from '../render/ui.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

const PAUSE_KEYS = ['KeyP', 'Escape'];
const CONFIRM_KEYS = ['Enter', 'NumpadEnter', 'Space'];

export class Game {
  state: GameState = 'title';
  score = 0;
  highScore = loadHighScore();
  kills = 0;
  elapsed = 0;
  newRecord = false;

  readonly player = new Player();
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  readonly particles = new Particles();
  readonly spray = new SprayWeapon();
  readonly waves = new WaveManager();
  readonly camera = new Camera();

  private readonly input: Input;
  private readonly audio: GameAudio;
  private time = 0;
  private pickupTimer = PICKUPS.interval * 0.6;
  private banner: Banner | null = null;
  private toasts: Toast[] = [];
  private lastMoveAim = -Math.PI / 2;

  constructor(input: Input, audio: GameAudio = new GameAudio()) {
    this.input = input;
    this.audio = audio;
  }

  get sound(): GameAudio {
    return this.audio;
  }

  /** Live enemies plus enemies still queued for this wave. */
  get enemiesRemaining(): number {
    return this.enemies.length + this.waves.pending;
  }

  startRun(): void {
    this.state = 'playing';
    this.score = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.newRecord = false;
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.particles.clear();
    this.player.reset();
    this.spray.reset();
    this.waves.reset();
    this.camera.reset();
    this.toasts = [];
    this.banner = null;
    this.pickupTimer = PICKUPS.interval * 0.6;
    this.audio.stopSpray();
  }

  update(dt: number): void {
    this.time += dt;
    this.input.tick(dt);
    this.handleKeys();

    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'title':
      case 'gameover':
        this.particles.update(dt);
        this.camera.update(dt);
        break;
      case 'paused':
        // Frozen: nothing advances, not even banner timers.
        return;
    }
    this.updateToasts(dt);
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }
  }

  /* ------------------------------------------------------------------ input */

  private handleKeys(): void {
    const input = this.input;

    if (input.wasPressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.toast(this.player.x, this.player.y - 30, muted ? 'MUTED' : 'SOUND ON', COLORS.textDim);
      if (!muted) this.audio.ui();
    }

    const clicked = input.takeClicks();

    switch (this.state) {
      case 'title': {
        const buttonHit = clicked.some((c) => hitRect(START_BUTTON, c.x, c.y));
        if (buttonHit || input.wasPressed(...CONFIRM_KEYS) || clicked.length > 0) {
          this.audio.unlock();
          this.audio.ui();
          this.startRun();
        }
        break;
      }
      case 'playing':
        if (input.wasPressed(...PAUSE_KEYS)) {
          this.state = 'paused';
          this.audio.stopSpray();
          this.audio.ui();
        }
        break;
      case 'paused':
        if (input.wasPressed(...PAUSE_KEYS)) {
          this.state = 'playing';
          this.audio.ui();
        } else if (input.wasPressed('KeyR')) {
          this.audio.ui();
          this.startRun();
        }
        break;
      case 'gameover': {
        const rect = restartRect(this.newRecord);
        const buttonHit = clicked.some((c) => hitRect(rect, c.x, c.y));
        if (buttonHit || input.wasPressed('KeyR', 'Enter', 'NumpadEnter')) {
          this.audio.ui();
          this.startRun();
        }
        break;
      }
    }
  }

  private aimAngle(move: Vec): number {
    if (this.input.pointerIsFresh) {
      return Math.atan2(this.input.pointer.y - this.player.y, this.input.pointer.x - this.player.x);
    }
    // Keyboard-only fallback: aim wherever the gardener last walked.
    if (move.x !== 0 || move.y !== 0) this.lastMoveAim = Math.atan2(move.y, move.x);
    return this.lastMoveAim;
  }

  /* ----------------------------------------------------------------- update */

  private updatePlaying(dt: number): void {
    this.elapsed += dt;
    const move = this.input.moveVector();
    const aim = this.aimAngle(move);

    this.player.update(dt, { move, aim, wantSpray: this.input.sprayHeld }, this.particles);

    this.waves.update(dt, this.enemies.length, {
      spawn: (kind, scaling) => this.spawnEnemy(kind, scaling),
      onWaveStart: (wave) => this.onWaveStart(wave),
      onWaveClear: (wave) => this.onWaveClear(wave),
      onWin: () => this.onWin(),
    });

    if (this.waves.phase === 'active') this.score += SCORE.survival * dt;

    const target: Vec = { x: this.player.x, y: this.player.y };
    for (const e of this.enemies) e.update(dt, target, this.particles, this.audio);
    separateEnemies(this.enemies);

    const tick = this.spray.update(dt, this.player, this.enemies, this.particles, this.audio, this.camera);
    for (const killed of tick.kills) this.onEnemyKilled(killed);

    resolvePlayerContacts(this.player, this.enemies, this.particles, this.audio, this.camera);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if ((this.enemies[i] as Enemy).dead) this.enemies.splice(i, 1);
    }

    this.updatePickups(dt);
    this.particles.update(dt);
    this.camera.update(dt);

    if (!this.player.alive) this.gameOver();
  }

  private updatePickups(dt: number): void {
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer = PICKUPS.interval + rand(-PICKUPS.intervalJitter, PICKUPS.intervalJitter);
      if (this.pickups.length < PICKUPS.maxOnField) this.spawnPickup();
    }

    for (const p of this.pickups) p.update(dt);

    for (const p of collectPickups(this.player, this.pickups)) this.applyPickup(p);

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i] as Pickup;
      if (p.taken || p.life <= 0) {
        if (!p.taken) this.particles.dust(p.x, p.y, COLORS.textDim);
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateToasts(dt: number): void {
    for (const t of this.toasts) t.timer -= dt;
    this.toasts = this.toasts.filter((t) => t.timer > 0);
  }

  /* ------------------------------------------------------------------ events */

  private spawnEnemy(kind: EnemyKind, scaling: EnemyScaling): void {
    let pos = randomEdgePoint();
    for (let tries = 0; tries < 6; tries++) {
      if (Math.hypot(pos.x - this.player.x, pos.y - this.player.y) > 170) break;
      pos = randomEdgePoint();
    }
    const enemy = new Enemy(kind, pos.x, pos.y, scaling);
    this.enemies.push(enemy);
    const color = kind === 'aphid' ? COLORS.aphid : kind === 'beetle' ? COLORS.beetle : COLORS.moth;
    this.particles.ring(pos.x, pos.y, color, 4, 70, 0.32);
    this.particles.leaves(pos.x, pos.y, COLORS.grassEdge, 3);
  }

  private spawnPickup(): void {
    const kinds: Array<[PickupKind, number]> = [
      ['score', 1],
      ['heal', this.player.health < 60 ? 1.5 : 0.7],
      ['power', 0.55],
    ];
    const total = kinds.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    let kind: PickupKind = 'score';
    for (const [k, w] of kinds) {
      roll -= w;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }

    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = rand(FIELD.x + 50, FIELD_RIGHT - 50);
      y = rand(FIELD.y + 50, FIELD_BOTTOM - 50);
      if (Math.hypot(x - this.player.x, y - this.player.y) > 130) break;
    }
    this.pickups.push(new Pickup(kind, x, y));
    this.particles.ring(x, y, PICKUP_INFO[kind].color, 6, 90, 0.4);
  }

  /** Spawns a seed at a defeated enemy's position (loot drop). */
  private dropSeed(x: number, y: number): void {
    if (this.pickups.length >= PICKUPS.maxOnField) return;
    const kind: PickupKind = Math.random() < 0.45 ? 'heal' : Math.random() < 0.5 ? 'power' : 'score';
    const px = clamp(x, FIELD.x + 30, FIELD_RIGHT - 30);
    const py = clamp(y, FIELD.y + 30, FIELD_BOTTOM - 30);
    this.pickups.push(new Pickup(kind, px, py));
    this.particles.ring(px, py, PICKUP_INFO[kind].color, 5, 80, 0.35);
  }

  private applyPickup(p: Pickup): void {
    const info = PICKUP_INFO[p.kind];
    switch (p.kind) {
      case 'score':
        this.score += PICKUPS.scoreValue;
        this.toast(p.x, p.y, `+${PICKUPS.scoreValue}`, info.color);
        this.audio.pickup('score');
        break;
      case 'heal': {
        const before = this.player.health;
        this.player.heal(PICKUPS.healValue);
        const gained = Math.round(this.player.health - before);
        this.score += 40;
        this.toast(p.x, p.y, gained > 0 ? `+${gained} HP` : '+40', info.color);
        this.audio.pickup('heal');
        break;
      }
      case 'power':
        this.player.grantPower();
        this.score += 60;
        this.toast(p.x, p.y, `BLOOM ${POWERUP.duration}s`, info.color);
        this.audio.pickup('power');
        break;
    }
    this.particles.sparkle(p.x, p.y, info.color, 16, 210);
    this.camera.shake(2);
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills += 1;
    const points = Math.round(enemy.spec.score * (1 + (this.waves.wave - 1) * 0.05));
    this.score += points;
    const big = enemy.spec.cost >= 3;
    const color = enemy.kind === 'aphid' ? COLORS.aphid : enemy.kind === 'beetle' ? COLORS.beetle : COLORS.moth;
    const dark = enemy.kind === 'beetle' ? COLORS.beetleDark : COLORS.aphidDark;
    this.particles.deathBurst(enemy.x, enemy.y, color, dark, big);
    this.audio.kill(big);
    if (big) this.toast(enemy.x, enemy.y - 10, `+${points}`, color);
    if (Math.random() < enemy.spec.seedDropChance) this.dropSeed(enemy.x, enemy.y);
  }

  private onWaveStart(wave: number): void {
    const count = this.waves.pending;
    this.banner = {
      title: `WAVE ${wave}`,
      subtitle: `${count} BUG${count === 1 ? '' : 'S'} INCOMING`,
      color: wave > WAVES.winWave ? COLORS.seedPower : COLORS.text,
      timer: 1.8,
      duration: 1.8,
    };
    this.audio.waveStart();
  }

  private onWaveClear(wave: number): void {
    const bonus = WAVES.clearBonus(wave);
    this.score += bonus;
    this.player.heal(14);
    this.banner = {
      title: 'WAVE CLEARED',
      subtitle: `+${bonus} POINTS   ·   +14 HEALTH`,
      color: COLORS.health,
      timer: 2.2,
      duration: 2.2,
    };
    this.audio.waveClear();
    this.particles.sparkle(this.player.x, this.player.y, COLORS.health, 24, 260);
  }

  private onWin(): void {
    this.score += 2500;
    this.banner = {
      title: 'GARDEN SAVED!',
      subtitle: 'ENDLESS MODE — HOW LONG CAN YOU HOLD?',
      color: COLORS.seedScore,
      timer: 3.6,
      duration: 3.6,
    };
    this.audio.win();
    this.camera.shake(6);
    for (let i = 0; i < 6; i++) {
      this.particles.sparkle(
        rand(FIELD.x, FIELD_RIGHT),
        rand(FIELD.y, FIELD_BOTTOM),
        COLORS.seedScore,
        14,
        220,
      );
    }
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.score = Math.floor(this.score);
    this.audio.stopSpray();
    this.audio.gameOver();
    this.camera.shake(12);
    this.particles.deathBurst(this.player.x, this.player.y, COLORS.playerHat, COLORS.danger, true);
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.newRecord = true;
      saveHighScore(this.highScore);
    }
  }

  private toast(x: number, y: number, label: string, color: string): void {
    this.toasts.push({ x, y, label, color, timer: 1.1 });
  }

  /* ------------------------------------------------------------------- draw */

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.grassEdge;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.drawImage(getGardenLayer(), 0, 0);

    for (const p of this.pickups) p.draw(ctx);

    if (this.state !== 'title') {
      this.spray.drawAimGuide(ctx, this.player);
      this.spray.draw(ctx, this.player);
    }

    // Sort by y so overlapping bugs and the gardener layer front-to-back.
    const drawables: Array<{ y: number; draw: () => void }> = this.enemies.map((e) => ({
      y: e.y,
      draw: () => e.draw(ctx, this.time),
    }));
    if (this.state !== 'title' && this.player.alive) {
      drawables.push({ y: this.player.y, draw: () => this.player.draw(ctx, this.time) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.particles.draw(ctx);
    drawToasts(ctx, this.toasts);
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') {
      drawLowHealthVignette(ctx, this.player.health);
      if (this.waves.phase === 'countdown' && this.state === 'playing') {
        drawCountdown(ctx, this.waves.countdown, this.waves.nextWave);
      }
      drawHud(ctx, this.hudState());
      if (this.banner) drawBanner(ctx, this.banner);
    }

    const screenCtx = {
      time: this.time,
      pointerX: this.input.pointer.x,
      pointerY: this.input.pointer.y,
      highScore: this.highScore,
    };

    switch (this.state) {
      case 'title':
        drawTitle(ctx, screenCtx);
        break;
      case 'paused':
        drawPause(ctx, screenCtx);
        break;
      case 'gameover':
        drawHud(ctx, this.hudState());
        drawGameOver(ctx, {
          ...screenCtx,
          score: this.score,
          wave: this.waves.wave,
          newRecord: this.newRecord,
          kills: this.kills,
          survived: this.elapsed,
        });
        break;
      case 'playing':
        break;
    }
  }

  hudState(): HudState {
    return {
      health: this.player.health,
      energy: this.player.energy,
      energyLocked: this.player.energyLocked,
      powerTimer: this.player.powerTimer,
      score: Math.floor(this.score),
      highScore: Math.max(this.highScore, Math.floor(this.score)),
      wave: this.waves.wave,
      nextWave: this.waves.nextWave,
      phase: this.waves.phase,
      countdown: this.waves.countdown,
      enemiesRemaining: this.enemiesRemaining,
      endless: this.waves.endless,
      muted: this.audio.muted,
      paused: this.state === 'paused',
    };
  }
}

/** A point just outside the fence, on a random edge. */
function randomEdgePoint(): Vec {
  const side = randInt(0, 3);
  const along = Math.random();
  switch (side) {
    case 0:
      return { x: FIELD.x + along * FIELD.w, y: FIELD.y - SPAWN_MARGIN };
    case 1:
      return { x: FIELD_RIGHT + SPAWN_MARGIN, y: FIELD.y + along * FIELD.h };
    case 2:
      return { x: FIELD.x + along * FIELD.w, y: FIELD_BOTTOM + SPAWN_MARGIN };
    default:
      return { x: FIELD.x - SPAWN_MARGIN, y: FIELD.y + along * FIELD.h };
  }
}
