import { COLORS, FIELD, FIELD_BOTTOM, FIELD_RIGHT, PLAYER, POWERUP } from '../config.ts';
import { clamp, damp, norm, TAU, type Vec } from '../core/math.ts';
import { baseStats, type StatBlock } from '../systems/stats.ts';
import type { Particles } from './particles.ts';

export interface PlayerIntent {
  move: Vec;
  aim: number;
  wantSpray: boolean;
}

export class Player {
  /** Per-run stats; Arena upgrades mutate this block, campaign leaves it at the defaults. */
  stats: StatBlock = baseStats();
  x = (FIELD.x + FIELD_RIGHT) / 2;
  y = (FIELD.y + FIELD_BOTTOM) / 2;
  vx = 0;
  vy = 0;
  aim = -Math.PI / 2;
  health: number = PLAYER.maxHealth;
  energy: number = PLAYER.maxEnergy;
  energyLocked = false;
  invuln = 0;
  hurtFlash = 0;
  spraying = false;
  /** Seconds of Bloom Seed power-up remaining. */
  powerTimer = 0;
  private energyIdle: number = PLAYER.energyDelay;
  private walkPhase = 0;
  private dustTimer = 0;

  get powered(): boolean {
    return this.powerTimer > 0;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get speed(): number {
    return PLAYER.speed * this.stats.speed * (this.powered ? POWERUP.speedMul : 1);
  }

  get maxHealth(): number {
    return this.stats.maxHealth;
  }

  reset(stats: StatBlock = baseStats()): void {
    this.stats = stats;
    this.x = (FIELD.x + FIELD_RIGHT) / 2;
    this.y = (FIELD.y + FIELD_BOTTOM) / 2;
    this.vx = 0;
    this.vy = 0;
    this.aim = -Math.PI / 2;
    this.health = stats.maxHealth;
    this.energy = PLAYER.maxEnergy;
    this.energyLocked = false;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.spraying = false;
    this.powerTimer = 0;
    this.energyIdle = PLAYER.energyDelay;
    this.walkPhase = 0;
  }

  update(dt: number, intent: PlayerIntent, particles: Particles): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.2);
    this.powerTimer = Math.max(0, this.powerTimer - dt);
    this.aim = intent.aim;
    if (this.stats.regen > 0 && this.health > 0) this.heal(this.stats.regen * dt);

    // Acceleration toward the input direction, friction when there is none.
    const target = { x: intent.move.x * this.speed, y: intent.move.y * this.speed };
    const moving = intent.move.x !== 0 || intent.move.y !== 0;
    const rate = moving ? PLAYER.accel : PLAYER.friction;
    this.vx = damp(this.vx, target.x, rate / 90, dt);
    this.vy = damp(this.vy, target.y, rate / 90, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const r = PLAYER.radius;
    this.x = clamp(this.x, FIELD.x + r, FIELD_RIGHT - r);
    this.y = clamp(this.y, FIELD.y + r, FIELD_BOTTOM - r);

    const sp = Math.hypot(this.vx, this.vy);
    this.walkPhase += (sp / 40) * dt * 6;
    if (sp > 40) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.07;
        particles.dust(this.x, this.y + r * 0.7, COLORS.grassEdge);
      }
    }

    this.updateEnergy(dt, intent.wantSpray);
  }

  private updateEnergy(dt: number, wantSpray: boolean): void {
    const drainMul = this.stats.energyDrain * (this.powered ? POWERUP.energyDrainMul : 1);
    const canSpray = !this.energyLocked && this.energy > 0;
    this.spraying = wantSpray && canSpray;

    if (this.spraying) {
      this.energy -= PLAYER.energyDrain * drainMul * dt;
      this.energyIdle = 0;
      if (this.energy <= 0) {
        this.energy = 0;
        this.energyLocked = true;
        this.spraying = false;
      }
    } else {
      this.energyIdle += dt;
      if (this.energyIdle >= PLAYER.energyDelay) {
        const regen = PLAYER.energyRegen * this.stats.energyRegen * (this.powered ? 1.5 : 1);
        this.energy = Math.min(PLAYER.maxEnergy, this.energy + regen * dt);
      }
      if (this.energyLocked && this.energy >= PLAYER.energyUnlock) this.energyLocked = false;
    }
  }

  /** Returns true when the hit landed (i.e. the player was not invulnerable). */
  takeDamage(amount: number): boolean {
    if (this.invuln > 0 || !this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = PLAYER.invulnTime;
    this.hurtFlash = 1;
    return true;
  }

  heal(amount: number): void {
    this.health = Math.min(this.stats.maxHealth, this.health + amount);
  }

  /** Second Wind: spends a revive and brings the gardener back. Returns false when none left. */
  revive(): boolean {
    if (this.stats.revives <= 0) return false;
    this.stats.revives -= 1;
    this.health = this.stats.maxHealth * 0.4;
    this.invuln = 2.5;
    this.hurtFlash = 1;
    this.energy = PLAYER.maxEnergy;
    this.energyLocked = false;
    return true;
  }

  grantPower(): void {
    this.powerTimer = POWERUP.duration;
    this.energy = PLAYER.maxEnergy;
    this.energyLocked = false;
  }

  knock(dx: number, dy: number, power: number): void {
    const d = norm(dx, dy);
    this.vx += d.x * power;
    this.vy += d.y * power;
  }

  aimVector(): Vec {
    return { x: Math.cos(this.aim), y: Math.sin(this.aim) };
  }

  /** Muzzle position of the spray bottle, used as the particle origin. */
  nozzle(): Vec {
    const a = this.aim;
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    const sx = -fy;
    const sy = fx;
    return { x: this.x + fx * 15 + sx * 7, y: this.y + fy * 15 + sy * 7 };
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    ctx.save();
    ctx.translate(this.x, this.y);

    // Ground shadow stays unrotated so it always reads as "under" the gardener.
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 15, 8, 0, 0, TAU);
    ctx.fill();

    if (this.powered) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 9);
      ctx.strokeStyle = COLORS.seedPower;
      ctx.globalAlpha = 0.35 + pulse * 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + pulse * 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(this.aim + Math.PI / 2);
    ctx.globalAlpha = blink ? 0.35 : 1;

    const step = Math.sin(this.walkPhase) * 4;

    // boots
    ctx.fillStyle = '#2c3b57';
    ctx.beginPath();
    ctx.roundRect(-9, -4 + step, 6, 9, 2);
    ctx.roundRect(3, -4 - step, 6, 9, 2);
    ctx.fill();

    // torso
    ctx.fillStyle = COLORS.playerOveralls;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-9.5, -8, 19, 15, 5);
    ctx.fill();
    ctx.stroke();

    // shirt / shoulders
    ctx.fillStyle = COLORS.playerBody;
    ctx.beginPath();
    ctx.roundRect(-9.5, -8, 19, 6, 3);
    ctx.fill();
    ctx.stroke();

    // arms reaching forward toward the nozzle
    ctx.strokeStyle = COLORS.playerSkin;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-4, -13);
    ctx.moveTo(6, -5);
    ctx.lineTo(5, -13);
    ctx.stroke();

    // spray bottle
    ctx.fillStyle = '#d6e9f2';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(2.5, -18, 7, 9, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.sprayDeep;
    ctx.beginPath();
    ctx.roundRect(4, -16.5, 4, 5, 1.5);
    ctx.fill();
    ctx.strokeStyle = '#8ea3ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, -18);
    ctx.lineTo(6, -22);
    ctx.stroke();

    // straw hat (top-down silhouette)
    ctx.fillStyle = COLORS.playerHat;
    ctx.strokeStyle = '#a9762a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -1, 12.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe49a';
    ctx.beginPath();
    ctx.arc(0, -2.5, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c9902f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -1, 9.4, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.hurtFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, this.hurtFlash * 0.55);
      ctx.fillStyle = COLORS.danger;
      ctx.beginPath();
      ctx.arc(this.x, this.y, PLAYER.radius + 8, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
