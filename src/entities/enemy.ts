import {
  COLORS,
  ENEMIES,
  FIELD,
  FIELD_BOTTOM,
  FIELD_RIGHT,
  MOTH,
  SPAWN_MARGIN,
  type EnemyKind,
  type EnemySpec,
} from '../config.ts';
import { clamp, norm, rand, TAU, type Vec } from '../core/math.ts';
import type { GameAudio } from '../core/audio.ts';
import type { Particles } from './particles.ts';

export interface EnemyScaling {
  health: number;
  speed: number;
  damage: number;
}

type DashState = 'cruise' | 'windup' | 'dash';

/** How far outside the fence an enemy may be pushed before it is walled off. */
const OUT_OF_BOUNDS = SPAWN_MARGIN + 26;

export class Enemy {
  readonly kind: EnemyKind;
  readonly spec: EnemySpec;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** Knockback velocity, decays quickly and is added on top of steering. */
  kx = 0;
  ky = 0;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  facing: number;
  hitFlash = 0;
  /** 0..1 materialise animation. */
  spawnAnim = 0;
  dead = false;
  contactCooldown = 0;
  private age = 0;
  private seed = rand(0, 100);
  private dashState: DashState = 'cruise';
  private dashClock = rand(MOTH.dashCooldownMin, MOTH.dashCooldownMax);
  private dashDir: Vec = { x: 0, y: 0 };
  private trailTimer = 0;

  constructor(kind: EnemyKind, x: number, y: number, scale: EnemyScaling) {
    this.kind = kind;
    this.spec = ENEMIES[kind];
    this.x = x;
    this.y = y;
    this.maxHp = this.spec.health * scale.health;
    this.hp = this.maxHp;
    this.radius = this.spec.radius;
    this.speed = this.spec.speed * scale.speed;
    this.damage = this.spec.damage * scale.damage;
    this.facing = 0;
  }

  get isDashing(): boolean {
    return this.dashState === 'dash';
  }

  update(dt: number, target: Vec, particles: Particles, audio: GameAudio): void {
    this.age += dt;
    this.spawnAnim = Math.min(1, this.spawnAnim + dt * 3.6);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);

    const toward = norm(target.x - this.x, target.y - this.y);
    let dir = toward;
    let speed = this.speed * (0.35 + 0.65 * this.spawnAnim);

    switch (this.kind) {
      case 'aphid': {
        // Restless scuttle: the heading wobbles so a swarm never forms a clean line.
        const wobble = Math.sin(this.age * 3.4 + this.seed) * 0.45;
        dir = rotate(toward, wobble);
        speed *= 1 + Math.sin(this.age * 12 + this.seed) * 0.12;
        break;
      }
      case 'beetle': {
        // Heavy trudge with a stomping rhythm.
        speed *= 0.82 + 0.34 * Math.max(0, Math.sin(this.age * 3.6 + this.seed));
        break;
      }
      case 'moth': {
        speed = this.updateMoth(dt, toward, speed, particles, audio);
        dir = this.dashState === 'dash' ? this.dashDir : rotate(toward, this.weave());
        break;
      }
    }

    this.vx = dir.x * speed;
    this.vy = dir.y * speed;

    const decay = Math.exp(-7 * dt);
    this.kx *= decay;
    this.ky *= decay;

    this.x += (this.vx + this.kx) * dt;
    this.y += (this.vy + this.ky) * dt;

    this.x = clamp(this.x, FIELD.x - OUT_OF_BOUNDS, FIELD_RIGHT + OUT_OF_BOUNDS);
    this.y = clamp(this.y, FIELD.y - OUT_OF_BOUNDS, FIELD_BOTTOM + OUT_OF_BOUNDS);

    if (this.vx !== 0 || this.vy !== 0) this.facing = Math.atan2(this.vy, this.vx);
  }

  private weave(): number {
    return Math.sin(this.age * MOTH.weaveSpeed + this.seed) * MOTH.weaveAmplitude;
  }

  private updateMoth(
    dt: number,
    toward: Vec,
    speed: number,
    particles: Particles,
    audio: GameAudio,
  ): number {
    this.dashClock -= dt;
    switch (this.dashState) {
      case 'cruise':
        if (this.dashClock <= 0) {
          this.dashState = 'windup';
          this.dashClock = MOTH.dashWindup;
        }
        return speed;
      case 'windup':
        if (this.dashClock <= 0) {
          this.dashState = 'dash';
          this.dashClock = MOTH.dashTime;
          this.dashDir = toward;
          audio.dash();
          particles.ring(this.x, this.y, COLORS.moth, 6, 90, 0.25);
        }
        return speed * 0.3;
      case 'dash': {
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
          this.trailTimer = 0.02;
          particles.spawn({
            x: this.x,
            y: this.y,
            life: 0.28,
            size: rand(2, 4),
            grow: 6,
            drag: 3,
            color: COLORS.moth,
            alpha: 0.5,
          });
        }
        if (this.dashClock <= 0) {
          this.dashState = 'cruise';
          this.dashClock = rand(MOTH.dashCooldownMin, MOTH.dashCooldownMax);
        }
        return speed * MOTH.dashSpeedMul;
      }
    }
  }

  /** Applies damage; returns true if this hit killed the enemy. */
  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  applyKnockback(dx: number, dy: number, power: number): void {
    const d = norm(dx, dy);
    const scale = (1 - this.spec.knockResist) * power;
    this.kx += d.x * scale;
    this.ky += d.y * scale;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const s = 0.4 + 0.6 * this.spawnAnim;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.55, this.radius * 0.95, this.radius * 0.5, 0, 0, TAU);
    ctx.fill();

    ctx.rotate(this.facing);
    ctx.scale(s, s);

    switch (this.kind) {
      case 'aphid':
        this.drawAphid(ctx, time);
        break;
      case 'beetle':
        this.drawBeetle(ctx, time);
        break;
      case 'moth':
        this.drawMoth(ctx, time);
        break;
    }

    if (this.hitFlash > 0) {
      ctx.globalAlpha = this.hitFlash * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.15, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Damage read-out for the tanky types.
    if (this.hp < this.maxHp && this.spec.health >= 26) {
      const w = this.radius * 2.2;
      const y = this.y - this.radius - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(this.x - w / 2, y, w, 3.5);
      ctx.fillStyle = COLORS.danger;
      ctx.fillRect(this.x - w / 2, y, w * (this.hp / this.maxHp), 3.5);
    }
  }

  private legs(ctx: CanvasRenderingContext2D, time: number, count: number, spread: number, length: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const along = -spread + (i / (count - 1)) * spread * 2;
      const kick = Math.sin(time * 16 + i * 1.7 + this.seed) * 2.6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(along, side * this.radius * 0.45);
        ctx.lineTo(along + kick * 0.4, side * (this.radius * 0.45 + length) + kick * 0.2);
        ctx.stroke();
      }
    }
  }

  private drawAphid(ctx: CanvasRenderingContext2D, time: number): void {
    const r = this.radius;
    this.legs(ctx, time, 3, r * 0.55, r * 0.62, COLORS.aphidDark);

    ctx.fillStyle = COLORS.aphid;
    ctx.strokeStyle = COLORS.aphidDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r, r * 0.82, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // head
    ctx.fillStyle = COLORS.aphidDark;
    ctx.beginPath();
    ctx.arc(r * 0.72, 0, r * 0.42, 0, TAU);
    ctx.fill();

    // antennae
    ctx.strokeStyle = COLORS.aphidDark;
    ctx.lineWidth = 1.2;
    const twitch = Math.sin(time * 9 + this.seed) * 0.3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.85, side * r * 0.2);
      ctx.lineTo(r * 1.6, side * (r * 0.6 + twitch));
      ctx.stroke();
    }

    // back highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.28, r * 0.35, r * 0.2, -0.4, 0, TAU);
    ctx.fill();
  }

  private drawBeetle(ctx: CanvasRenderingContext2D, time: number): void {
    const r = this.radius;
    this.legs(ctx, time, 3, r * 0.6, r * 0.5, '#1a1327');

    // carapace
    ctx.fillStyle = COLORS.beetleDark;
    ctx.strokeStyle = '#160f24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, 0, r * 1.05, r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.beetle;
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r * 0.86, r * 0.74, 0, 0, TAU);
    ctx.fill();

    // shell split + plates
    ctx.strokeStyle = COLORS.beetleDark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const x = -r * 0.7 + i * r * 0.45;
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.55);
      ctx.lineTo(x + r * 0.12, -r * 0.15);
      ctx.moveTo(x, r * 0.55);
      ctx.lineTo(x + r * 0.12, r * 0.15);
      ctx.stroke();
    }

    // head plate + horn
    ctx.fillStyle = '#241a3a';
    ctx.beginPath();
    ctx.ellipse(r * 0.82, 0, r * 0.38, r * 0.52, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f0e6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0);
    ctx.lineTo(r * 1.5, 0);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 1.0, side * r * 0.25);
      ctx.lineTo(r * 1.45, side * r * 0.5);
      ctx.stroke();
    }
  }

  private drawMoth(ctx: CanvasRenderingContext2D, time: number): void {
    const r = this.radius;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * 17 + this.seed));
    const boost = this.isDashing ? 1.35 : 1;

    if (this.isDashing) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = COLORS.moth;
      ctx.beginPath();
      ctx.ellipse(-r * 1.2, 0, r * 1.5, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // wings
    ctx.fillStyle = COLORS.moth;
    ctx.strokeStyle = COLORS.mothDark;
    ctx.lineWidth = 1.3;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(1, side);
      ctx.beginPath();
      ctx.ellipse(-r * 0.2, -r * 0.75 * flap * boost, r * 1.05, r * 0.62 * flap, -0.35, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.mothDark;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(-r * 0.55, -r * 0.85 * flap * boost, r * 0.34, r * 0.22 * flap, -0.35, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.moth;
      ctx.restore();
    }

    // fuzzy body
    ctx.fillStyle = '#cbbde6';
    ctx.strokeStyle = COLORS.mothDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.75, r * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f6f1ff';
    ctx.beginPath();
    ctx.arc(r * 0.68, 0, r * 0.3, 0, TAU);
    ctx.fill();

    // feathery antennae
    ctx.strokeStyle = COLORS.mothDark;
    ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.8, side * r * 0.12);
      ctx.quadraticCurveTo(r * 1.3, side * r * 0.45, r * 1.15, side * r * 0.8);
      ctx.stroke();
    }
  }
}

function rotate(v: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
