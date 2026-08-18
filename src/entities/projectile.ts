import { COLORS, FIELD, FIELD_BOTTOM, FIELD_RIGHT } from '../config.ts';
import { TAU } from '../core/math.ts';
import type { Enemy } from './enemy.ts';

/** Seed Shot projectile: mildly homing, pierces a few bugs before it is spent. */
export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly damage: number;
  pierce: number;
  dead = false;
  life = 2.4;
  private readonly hit = new Set<Enemy>();
  private spin = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, pierce: number) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.pierce = pierce;
  }

  alreadyHit(enemy: Enemy): boolean {
    return this.hit.has(enemy);
  }

  registerHit(enemy: Enemy): void {
    this.hit.add(enemy);
    this.pierce -= 1;
    if (this.pierce < 0) this.dead = true;
  }

  /** `target` steers the seed gently so shots do not whiff on weaving moths. */
  update(dt: number, target: Enemy | null): void {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(this.vx, this.vy);
      this.vx += (dx / d) * speed * 2.6 * dt;
      this.vy += (dy / d) * speed * 2.6 * dt;
      const now = Math.hypot(this.vx, this.vy) || 1;
      this.vx = (this.vx / now) * speed;
      this.vy = (this.vy / now) * speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * 14;
    const pad = 40;
    if (
      this.x < FIELD.x - pad ||
      this.x > FIELD_RIGHT + pad ||
      this.y < FIELD.y - pad ||
      this.y > FIELD_BOTTOM + pad
    ) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = COLORS.seedScore;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 9, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(this.spin * 0.15);
    ctx.fillStyle = COLORS.seedScore;
    ctx.strokeStyle = '#8a6210';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.4, 3.4, 0.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
