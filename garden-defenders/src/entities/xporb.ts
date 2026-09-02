import { COLORS } from '../config.ts';
import { rand, TAU } from '../core/math.ts';

/**
 * XP mote dropped by defeated bugs in Arena mode. Drifts, then accelerates toward the player
 * once inside the magnet radius so collection feels satisfying rather than fiddly.
 */
export class XpOrb {
  x: number;
  y: number;
  vx = rand(-40, 40);
  vy = rand(-40, 40);
  readonly value: number;
  taken = false;
  private phase = rand(0, TAU);
  private homing = false;

  constructor(x: number, y: number, value: number) {
    this.x = x;
    this.y = y;
    this.value = value;
  }

  get radius(): number {
    return this.value >= 20 ? 8 : this.value >= 6 ? 6 : 4.5;
  }

  update(dt: number, px: number, py: number, magnet: number): void {
    this.phase += dt * 6;
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < magnet) this.homing = true;

    if (this.homing) {
      // Accelerate harder the closer it gets, so trails of motes snap in.
      const pull = 900 + (1 - Math.min(1, d / magnet)) * 1400;
      this.vx += (dx / d) * pull * dt;
      this.vy += (dy / d) * pull * dt;
      const damp = Math.exp(-4 * dt);
      this.vx *= damp;
      this.vy *= damp;
    } else {
      const damp = Math.exp(-3 * dt);
      this.vx *= damp;
      this.vy *= damp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.radius;
    const pulse = 0.75 + 0.25 * Math.sin(this.phase);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = 0.28 * pulse;
    ctx.fillStyle = COLORS.energy;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = this.value >= 20 ? COLORS.seedScore : '#9bf6ff';
    ctx.strokeStyle = '#0e4b5a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
