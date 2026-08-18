import {
  COLORS,
  FIELD,
  FIELD_BOTTOM,
  FIELD_RIGHT,
  PICKUPS,
  POWERUP,
  SCORE,
  SPAWN_MARGIN,
  SPRAY,
  VIEW,
  WAVES,
  type EnemyKind,
} from '../config.ts';
import { GameAudio } from '../core/audio.ts';
import { Camera } from '../core/camera.ts';
import { SpatialGrid } from '../core/grid.ts';
import type { Input } from '../core/input.ts';
import { clamp, rand, randInt, type Vec } from '../core/math.ts';
import { loadHighScore, saveHighScore } from '../core/storage.ts';
import { Enemy, type EnemyScaling, type EnemyVariant } from '../entities/enemy.ts';
import { Particles } from '../entities/particles.ts';
import { Pickup, PICKUP_INFO, type PickupKind } from '../entities/pickup.ts';
import { Player } from '../entities/player.ts';
import { XpOrb } from '../entities/xporb.ts';
import { collectPickups, resolvePlayerContacts, separateEnemies } from '../systems/collisions.ts';
import { ARENA, ArenaDirector, arenaSurvivalScore } from '../systems/director.ts';
import { Progression, type UpgradeDef } from '../systems/progression.ts';
import { SprayWeapon } from '../systems/spray.ts';
import { arenaStats, baseStats } from '../systems/stats.ts';
import { WaveManager } from '../systems/waves.ts';
import { WeaponSystem } from '../systems/weapons.ts';
import { getGardenLayer } from '../render/background.ts';
import { drawHud, drawLowHealthVignette, type ArenaHud, type HudState } from '../render/hud.ts';
import { cardAt, drawLevelUp } from '../render/levelup.ts';
import {
  drawBanner,
  drawCountdown,
  drawGameOver,
  drawPause,
  drawTitle,
  drawToasts,
  modeCardAt,
  MODES,
  restartRect,
  START_BUTTON,
  type Banner,
  type GameMode,
  type Toast,
} from '../render/screens.ts';
import { hitRect } from '../render/ui.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'levelup' | 'gameover';
export type { GameMode };

const PAUSE_KEYS = ['KeyP', 'Escape'];
const CONFIRM_KEYS = ['Enter', 'NumpadEnter', 'Space'];
const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const CARD_KEYS = ['Digit1', 'Digit2', 'Digit3'];

/** Maximum XP motes on the field; beyond this the oldest are absorbed automatically. */
const MAX_ORBS = 420;

export class Game {
  state: GameState = 'title';
  mode: GameMode = 'campaign';
  score = 0;
  kills = 0;
  elapsed = 0;
  newRecord = false;
  victory = false;
  /** Which mode card the title screen has highlighted. */
  selectedMode = 0;

  readonly highScores: Record<GameMode, number> = {
    campaign: loadHighScore('campaign'),
    arena: loadHighScore('arena'),
  };

  readonly player = new Player();
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  readonly orbs: XpOrb[] = [];
  readonly particles = new Particles();
  readonly spray = new SprayWeapon();
  readonly waves = new WaveManager();
  readonly director = new ArenaDirector();
  readonly progression = new Progression();
  readonly weapons = new WeaponSystem();
  readonly camera = new Camera();
  private readonly grid = new SpatialGrid();

  private readonly input: Input;
  private readonly audio: GameAudio;
  private time = 0;
  private pickupTimer = PICKUPS.interval * 0.6;
  private banner: Banner | null = null;
  private toasts: Toast[] = [];
  private lastMoveAim = -Math.PI / 2;
  private cardSelected = 0;
  private orbSoundGate = 0;

  constructor(input: Input, audio: GameAudio = new GameAudio()) {
    this.input = input;
    this.audio = audio;
  }

  get sound(): GameAudio {
    return this.audio;
  }

  get isArena(): boolean {
    return this.mode === 'arena';
  }

  get highScore(): number {
    return this.highScores[this.mode];
  }

  /** Live enemies plus enemies still queued for the current campaign wave. */
  get enemiesRemaining(): number {
    return this.enemies.length + (this.isArena ? 0 : this.waves.pending);
  }

  get boss(): Enemy | null {
    for (const e of this.enemies) if (e.isBoss) return e;
    return null;
  }

  startRun(mode: GameMode = this.mode): void {
    this.mode = mode;
    this.state = 'playing';
    this.score = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.newRecord = false;
    this.victory = false;
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.orbs.length = 0;
    this.particles.clear();
    this.player.reset(mode === 'arena' ? arenaStats() : baseStats());
    this.spray.reset();
    this.waves.reset();
    this.director.reset();
    this.progression.reset();
    this.weapons.reset();
    this.camera.reset();
    this.toasts = [];
    this.banner = null;
    this.cardSelected = 0;
    this.pickupTimer = PICKUPS.interval * 0.6;
    this.audio.stopSpray();

    if (mode === 'arena') {
      this.banner = {
        title: 'ARENA',
        subtitle: 'SURVIVE TEN MINUTES',
        color: COLORS.energy,
        timer: 2.4,
        duration: 2.4,
      };
    }
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
      case 'levelup':
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
        for (const c of clicked) {
          const card = modeCardAt(c.x, c.y);
          if (card >= 0) this.selectedMode = card;
        }
        if (input.wasPressed(...LEFT_KEYS)) this.selectedMode = (this.selectedMode + MODES.length - 1) % MODES.length;
        if (input.wasPressed(...RIGHT_KEYS)) this.selectedMode = (this.selectedMode + 1) % MODES.length;
        if (input.wasPressed('Digit1')) this.selectedMode = 0;
        if (input.wasPressed('Digit2')) this.selectedMode = 1;

        const startHit = clicked.some(
          (c) => hitRect(START_BUTTON, c.x, c.y) || modeCardAt(c.x, c.y) >= 0,
        );
        if (startHit || input.wasPressed(...CONFIRM_KEYS) || clicked.length > 0) {
          this.audio.unlock();
          this.audio.ui();
          this.startRun(MODES[this.selectedMode] ?? 'campaign');
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
        } else if (input.wasPressed('KeyT')) {
          this.audio.ui();
          this.state = 'title';
        }
        break;
      case 'levelup': {
        const count = this.progression.choices.length;
        if (count === 0) {
          this.state = 'playing';
          break;
        }
        for (const c of clicked) {
          const card = cardAt(c.x, c.y, count);
          if (card >= 0) {
            this.pickUpgrade(card);
            return;
          }
        }
        if (input.wasPressed(...LEFT_KEYS)) this.cardSelected = (this.cardSelected + count - 1) % count;
        if (input.wasPressed(...RIGHT_KEYS)) this.cardSelected = (this.cardSelected + 1) % count;
        for (let i = 0; i < CARD_KEYS.length && i < count; i++) {
          if (input.wasPressed(CARD_KEYS[i] as string)) {
            this.pickUpgrade(i);
            return;
          }
        }
        if (input.wasPressed('Enter', 'NumpadEnter', 'Space')) this.pickUpgrade(this.cardSelected);
        break;
      }
      case 'gameover': {
        const rect = restartRect(this.newRecord, this.gameOverRows().length);
        const buttonHit = clicked.some((c) => hitRect(rect, c.x, c.y));
        if (input.wasPressed('KeyT')) {
          this.audio.ui();
          this.state = 'title';
          this.selectedMode = MODES.indexOf(this.mode);
        } else if (buttonHit || input.wasPressed('KeyR', 'Enter', 'NumpadEnter')) {
          this.audio.ui();
          this.startRun();
        }
        break;
      }
    }
  }

  /**
   * Campaign aims with the mouse (or the last movement direction). Arena auto-targets the
   * nearest bug, but holding the mouse button hands control back to the player.
   */
  private aimAngle(move: Vec): number {
    const manual = this.input.pointerDown && this.input.pointerIsFresh;
    if (this.isArena && !manual) {
      const target = this.nearestEnemy(900);
      if (target) return Math.atan2(target.y - this.player.y, target.x - this.player.x);
      if (move.x !== 0 || move.y !== 0) this.lastMoveAim = Math.atan2(move.y, move.x);
      return this.lastMoveAim;
    }
    if (this.input.pointerIsFresh) {
      return Math.atan2(this.input.pointer.y - this.player.y, this.input.pointer.x - this.player.x);
    }
    if (move.x !== 0 || move.y !== 0) this.lastMoveAim = Math.atan2(move.y, move.x);
    return this.lastMoveAim;
  }

  private nearestEnemy(maxDistance: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDistance;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Arena auto-fire: spray whenever something is close enough to be worth wetting. */
  private wantsSpray(): boolean {
    if (!this.isArena) return this.input.sprayHeld;
    if (this.input.sprayHeld) return true;
    const reach = SPRAY.range * this.player.stats.sprayRange * 1.25;
    return this.nearestEnemy(reach) !== null;
  }

  /* ----------------------------------------------------------------- update */

  private updatePlaying(dt: number): void {
    this.elapsed += dt;
    const move = this.input.moveVector();
    const aim = this.aimAngle(move);

    this.player.update(dt, { move, aim, wantSpray: this.wantsSpray() }, this.particles);

    if (this.isArena) this.updateArenaDirector(dt);
    else this.updateWaves(dt);

    const target: Vec = { x: this.player.x, y: this.player.y };
    for (const e of this.enemies) e.update(dt, target, this.particles, this.audio);

    this.grid.rebuild(this.enemies);
    separateEnemies(this.enemies, this.grid);

    const tick = this.spray.update(dt, this.player, this.enemies, this.particles, this.audio, this.camera);
    for (const killed of tick.kills) this.onEnemyKilled(killed);

    if (this.isArena) {
      this.weapons.update(dt, this.player, {
        enemies: this.enemies,
        grid: this.grid,
        particles: this.particles,
        audio: this.audio,
        onKill: (enemy) => this.onEnemyKilled(enemy),
      });
    }

    resolvePlayerContacts(this.player, this.enemies, this.particles, this.audio, this.camera);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if ((this.enemies[i] as Enemy).dead) this.enemies.splice(i, 1);
    }

    this.updatePickups(dt);
    if (this.isArena) this.updateOrbs(dt);
    this.particles.update(dt);
    this.camera.update(dt);

    if (!this.player.alive) this.handleDeath();
    else if (this.isArena && this.director.finished) this.endRun(true);
  }

  private updateWaves(dt: number): void {
    this.waves.update(dt, this.enemies.length, {
      spawn: (kind, scaling) => this.spawnEnemy(kind, scaling, 'normal'),
      onWaveStart: (wave) => this.onWaveStart(wave),
      onWaveClear: (wave) => this.onWaveClear(wave),
      onWin: () => this.onWin(),
    });
    if (this.waves.phase === 'active') this.score += SCORE.survival * dt;
  }

  private updateArenaDirector(dt: number): void {
    this.director.update(dt, this.enemies.length, {
      spawn: (kind, scaling, variant, at, bossName) =>
        this.spawnEnemy(kind, scaling, variant, at, bossName),
      onSwarm: (edge, kind, count) => {
        this.banner = {
          title: 'SWARM INBOUND',
          subtitle: `${count} ${kind.toUpperCase()}S FROM THE ${edge}`,
          color: COLORS.danger,
          timer: 2,
          duration: 2,
        };
        this.audio.swarmWarning();
        this.camera.shake(4);
      },
      onElite: (kind) => {
        this.toast(this.player.x, this.player.y - 46, `ELITE ${kind.toUpperCase()}`, COLORS.seedScore);
      },
      onBoss: (name) => {
        this.banner = {
          title: name,
          subtitle: 'A MONSTER ENTERS THE GARDEN',
          color: '#ff4f7a',
          timer: 3,
          duration: 3,
        };
        this.audio.bossWarning();
        this.camera.shake(10);
      },
    });
    this.score += arenaSurvivalScore(this.director.progress) * dt;
  }

  private updateOrbs(dt: number): void {
    const magnet = this.player.stats.magnetRadius;
    const reach = 16 + this.player.stats.magnetRadius * 0.06;
    let gainedXp = 0;

    // Overflow protection: absorb the oldest motes rather than letting the field fill up.
    while (this.orbs.length > MAX_ORBS) {
      const orb = this.orbs.shift();
      if (orb) gainedXp += orb.value;
    }

    for (const orb of this.orbs) {
      orb.update(dt, this.player.x, this.player.y, magnet);
      if (!orb.taken && Math.hypot(orb.x - this.player.x, orb.y - this.player.y) <= reach + orb.radius) {
        orb.taken = true;
        gainedXp += orb.value;
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      if ((this.orbs[i] as XpOrb).taken) this.orbs.splice(i, 1);
    }

    if (gainedXp > 0) {
      this.orbSoundGate -= 1;
      if (this.orbSoundGate <= 0) {
        this.orbSoundGate = 4;
        this.audio.xp();
      }
      const levels = this.progression.addXp(gainedXp * this.player.stats.xpGain);
      if (levels > 0) this.openLevelUp();
    }
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

  /* ------------------------------------------------------------- level-ups */

  private openLevelUp(): void {
    if (this.progression.pending <= 0) return;
    this.progression.rollChoices(this.weapons.loadout);
    this.cardSelected = 0;
    this.state = 'levelup';
    this.audio.stopSpray();
    this.audio.levelUp();
    this.particles.ring(this.player.x, this.player.y, COLORS.seedScore, 18, 220, 0.5);
  }

  private pickUpgrade(index: number): void {
    const def = this.progression.choices[index] as UpgradeDef | undefined;
    if (!def) return;
    const level = this.progression.take(def, {
      stats: this.player.stats,
      player: this.player,
      weapons: this.weapons,
      addScore: (amount) => {
        this.score += amount;
      },
    });
    this.audio.upgradePicked();
    this.particles.sparkle(this.player.x, this.player.y, COLORS.seedScore, 22, 240);
    this.toast(
      this.player.x,
      this.player.y - 40,
      `${def.name}${def.maxLevel > 1 ? ` ${level}` : ''}`,
      def.weapon ? COLORS.energy : COLORS.seedScore,
    );

    if (this.progression.pending > 0) {
      this.progression.rollChoices(this.weapons.loadout);
      this.cardSelected = 0;
    } else {
      this.state = 'playing';
    }
  }

  /* ------------------------------------------------------------------ events */

  private spawnEnemy(
    kind: EnemyKind,
    scaling: EnemyScaling,
    variant: EnemyVariant,
    at?: Vec,
    bossName?: string,
  ): void {
    let pos = at ?? randomEdgePoint();
    if (!at) {
      for (let tries = 0; tries < 6; tries++) {
        if (Math.hypot(pos.x - this.player.x, pos.y - this.player.y) > 170) break;
        pos = randomEdgePoint();
      }
    }
    const enemy = new Enemy(kind, pos.x, pos.y, scaling, variant);
    if (bossName) enemy.bossName = bossName;
    this.enemies.push(enemy);
    const color = kindColor(kind);
    this.particles.ring(pos.x, pos.y, color, 4, 70, 0.32);
    if (variant === 'normal') this.particles.leaves(pos.x, pos.y, COLORS.grassEdge, 3);
    else this.particles.sparkle(pos.x, pos.y, variant === 'boss' ? '#ff4f7a' : COLORS.seedScore, 16, 220);
  }

  private spawnPickup(): void {
    const kinds: Array<[PickupKind, number]> = [
      ['score', 1],
      ['heal', this.player.health < this.player.maxHealth * 0.6 ? 1.5 : 0.7],
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
    const bonus = this.player.stats.seedBonus;
    switch (p.kind) {
      case 'score': {
        const points = Math.round(PICKUPS.scoreValue * bonus);
        this.score += points;
        this.toast(p.x, p.y, `+${points}`, info.color);
        this.audio.pickup('score');
        break;
      }
      case 'heal': {
        const before = this.player.health;
        this.player.heal(PICKUPS.healValue * bonus);
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
    const waveBonus = this.isArena ? 1 + this.director.progress * 0.8 : 1 + (this.waves.wave - 1) * 0.05;
    const points = Math.round(enemy.scoreValue * waveBonus);
    this.score += points;
    const big = enemy.spec.cost >= 3 || enemy.variant !== 'normal';
    const color = kindColor(enemy.kind);
    const dark = enemy.kind === 'beetle' ? COLORS.beetleDark : COLORS.aphidDark;
    this.particles.deathBurst(enemy.x, enemy.y, color, dark, big);
    this.audio.kill(big);

    if (enemy.variant !== 'normal') {
      this.camera.shake(enemy.isBoss ? 14 : 6);
      this.toast(enemy.x, enemy.y - 12, `+${points}`, enemy.isBoss ? '#ff8fae' : COLORS.seedScore);
      if (enemy.isBoss) {
        this.banner = {
          title: `${enemy.bossName} DOWN`,
          subtitle: '+2500 POINTS',
          color: COLORS.seedScore,
          timer: 2.4,
          duration: 2.4,
        };
        this.score += 2500;
        this.particles.sparkle(enemy.x, enemy.y, COLORS.seedScore, 40, 320);
      }
    } else if (enemy.spec.cost >= 3) {
      this.toast(enemy.x, enemy.y - 10, `+${points}`, color);
    }

    if (this.isArena) this.dropOrbs(enemy);
    if (Math.random() < enemy.spec.seedDropChance) this.dropSeed(enemy.x, enemy.y);
  }

  private dropOrbs(enemy: Enemy): void {
    const count = enemy.isBoss ? 10 : enemy.variant === 'elite' ? 4 : 1;
    const each = Math.max(1, Math.round(enemy.xpValue / count));
    for (let i = 0; i < count; i++) {
      this.orbs.push(new XpOrb(enemy.x + rand(-10, 10), enemy.y + rand(-10, 10), each));
    }
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

  /** Second Wind spends a revive instead of ending the run. */
  private handleDeath(): void {
    if (this.player.revive()) {
      this.banner = {
        title: 'SECOND WIND',
        subtitle: 'THE GARDENER GETS BACK UP',
        color: COLORS.seedPower,
        timer: 2.4,
        duration: 2.4,
      };
      this.audio.revive();
      this.camera.shake(12);
      this.particles.ring(this.player.x, this.player.y, COLORS.seedPower, 20, 420, 0.6);
      // Clear breathing room: shove everything nearby away.
      for (const e of this.enemies) {
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        if (Math.hypot(dx, dy) < 220) e.applyKnockback(dx, dy, 900);
      }
      return;
    }
    this.endRun(false);
  }

  private endRun(victory: boolean): void {
    this.state = 'gameover';
    this.victory = victory;
    this.score = Math.floor(this.score);
    this.audio.stopSpray();
    this.camera.shake(victory ? 8 : 12);
    if (victory) {
      this.audio.victory();
      for (let i = 0; i < 10; i++) {
        this.particles.sparkle(rand(FIELD.x, FIELD_RIGHT), rand(FIELD.y, FIELD_BOTTOM), COLORS.seedScore, 18, 260);
      }
    } else {
      this.audio.gameOver();
      this.particles.deathBurst(this.player.x, this.player.y, COLORS.playerHat, COLORS.danger, true);
    }
    if (this.score > this.highScores[this.mode]) {
      this.highScores[this.mode] = this.score;
      this.newRecord = true;
      saveHighScore(this.score, this.mode);
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

    const inRun = this.state !== 'title';
    if (inRun && this.isArena) this.weapons.drawUnder(ctx, this.player);

    for (const p of this.pickups) p.draw(ctx);
    if (inRun && this.isArena) for (const orb of this.orbs) orb.draw(ctx);

    if (inRun) {
      this.spray.drawAimGuide(ctx, this.player);
      this.spray.draw(ctx, this.player);
    }

    // Sort by y so overlapping bugs and the gardener layer front-to-back.
    const drawables: Array<{ y: number; draw: () => void }> = this.enemies.map((e) => ({
      y: e.y,
      draw: () => e.draw(ctx, this.time),
    }));
    if (inRun && this.player.alive) {
      drawables.push({ y: this.player.y, draw: () => this.player.draw(ctx, this.time) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    if (inRun && this.isArena) this.weapons.drawOver(ctx, this.player);

    this.particles.draw(ctx);
    drawToasts(ctx, this.toasts);
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused' || this.state === 'levelup') {
      drawLowHealthVignette(ctx, this.player.health, this.player.maxHealth);
      if (!this.isArena && this.waves.phase === 'countdown' && this.state === 'playing') {
        drawCountdown(ctx, this.waves.countdown, this.waves.nextWave);
      }
      drawHud(ctx, this.hudState(), this.time);
      if (this.banner && this.state === 'playing') drawBanner(ctx, this.banner);
    }

    const screenCtx = {
      time: this.time,
      pointerX: this.input.pointer.x,
      pointerY: this.input.pointer.y,
      highScore: this.highScore,
    };

    switch (this.state) {
      case 'title':
        drawTitle(ctx, {
          ...screenCtx,
          selectedMode: this.selectedMode,
          bestByMode: this.highScores,
        });
        break;
      case 'paused':
        drawPause(ctx, screenCtx);
        break;
      case 'levelup':
        drawLevelUp(ctx, {
          level: this.progression.level,
          pending: this.progression.pending,
          choices: this.progression.choices,
          nextLevels: this.progression.choices.map((d) => this.progression.levelOf(d.id) + 1),
          selected: this.cardSelected,
          pointerX: this.input.pointer.x,
          pointerY: this.input.pointer.y,
          time: this.time,
          weapons: this.weapons,
        });
        break;
      case 'gameover':
        drawHud(ctx, this.hudState(), this.time);
        drawGameOver(ctx, {
          ...screenCtx,
          score: this.score,
          newRecord: this.newRecord,
          victory: this.victory,
          headline: this.victory ? 'GARDEN HELD!' : 'GARDEN OVERRUN',
          subhead: this.victory
            ? 'TEN MINUTES, ONE SPRAY BOTTLE, NOT ONE PLOT LOST'
            : this.isArena
              ? 'THE SWARM GOT THROUGH'
              : 'THE BUGS GOT THROUGH',
          rows: this.gameOverRows(),
        });
        break;
      case 'playing':
        break;
    }
  }

  private gameOverRows(): Array<[string, string]> {
    const best = Math.max(this.score, this.highScores[this.mode]);
    const time = `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`;
    if (this.isArena) {
      return [
        ['SCORE', this.score.toLocaleString('en-US')],
        ['BEST', best.toLocaleString('en-US')],
        ['HELD FOR', `${time} / 10:00`],
        ['LEVEL REACHED', String(this.progression.level)],
        ['BUGS SPRAYED', String(this.kills)],
        ['UPGRADES TAKEN', String([...this.progression.taken.values()].reduce((a, b) => a + b, 0))],
      ];
    }
    return [
      ['SCORE', this.score.toLocaleString('en-US')],
      ['BEST', best.toLocaleString('en-US')],
      ['WAVE REACHED', String(this.waves.wave)],
      ['BUGS SPRAYED', String(this.kills)],
      ['TIME SURVIVED', time],
    ];
  }

  private arenaHud(): ArenaHud | null {
    if (!this.isArena) return null;
    const boss = this.boss;
    return {
      timeLeft: this.director.remaining,
      level: this.progression.level,
      xp: this.progression.xp,
      xpToNext: this.progression.xpToNext,
      upgrades: this.progression.summary(),
      boss: boss ? { name: boss.bossName || 'BOSS', hp: boss.hp, maxHp: boss.maxHp } : null,
      revives: this.player.stats.revives,
    };
  }

  hudState(): HudState {
    return {
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      energy: this.player.energy,
      energyLocked: this.player.energyLocked,
      powerTimer: this.player.powerTimer,
      score: Math.floor(this.score),
      highScore: Math.max(this.highScores[this.mode], Math.floor(this.score)),
      wave: this.waves.wave,
      nextWave: this.waves.nextWave,
      phase: this.waves.phase,
      countdown: this.waves.countdown,
      enemiesRemaining: this.enemiesRemaining,
      endless: this.waves.endless,
      muted: this.audio.muted,
      paused: this.state === 'paused',
      arena: this.arenaHud(),
    };
  }
}

function kindColor(kind: EnemyKind): string {
  return kind === 'aphid' ? COLORS.aphid : kind === 'beetle' ? COLORS.beetle : COLORS.moth;
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

export { ARENA };
