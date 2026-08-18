import { COLORS, PICKUPS } from '../config.ts';
import { TAU } from '../core/math.ts';

export type PickupKind = 'score' | 'heal' | 'power';

export const PICKUP_INFO: Record<PickupKind, { color: string; label: string }> = {
  score: { color: COLORS.seedScore, label: 'SUN SEED' },
  heal: { color: COLORS.seedHeal, label: 'ALOE SEED' },
  power: { color: COLORS.seedPower, label: 'BLOOM SEED' },
};

export class Pickup {
  readonly kind: PickupKind;
  x: number;
  y: number;
  life = PICKUPS.life;
  taken = false;
  private age = Math.random() * 6;

  constructor(kind: PickupKind, x: number, y: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
  }

  get expiring(): boolean {
    return this.life < 4;
  }

  update(dt: number): void {
    this.age += dt;
    this.life -= dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.expiring && Math.floor(this.life * 6) % 2 === 0) return;
    const color = PICKUP_INFO[this.kind].color;
    const bob = Math.sin(this.age * 3.2) * 3;
    const pulse = 0.5 + 0.5 * Math.sin(this.age * 4.4);
    const r = PICKUPS.radius;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, r + 6 - bob, r * 0.8, r * 0.35, 0, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.22 + pulse * 0.18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8 + pulse * 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    switch (this.kind) {
      case 'score':
        this.drawSunSeed(ctx, r, color);
        break;
      case 'heal':
        this.drawAloeSeed(ctx, r, color);
        break;
      case 'power':
        this.drawBloomSeed(ctx, r, color);
        break;
    }
    ctx.restore();
  }

  private drawSunSeed(ctx: CanvasRenderingContext2D, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#8a6210';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.85, 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff6cf';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, r * 0.4);
    ctx.lineTo(r * 0.2, -r * 0.45);
    ctx.stroke();
  }

  private drawAloeSeed(ctx: CanvasRenderingContext2D, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0f6d51';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eafff8';
    const t = r * 0.22;
    ctx.fillRect(-t / 2, -r * 0.5, t, r);
    ctx.fillRect(-r * 0.5, -t / 2, r, t);
  }

  private drawBloomSeed(ctx: CanvasRenderingContext2D, r: number, color: string): void {
    ctx.rotate(this.age * 1.6);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#a11f6c';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * TAU);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 0.3, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fill();
  }
}
