import { rand, TAU } from '../core/math.ts';

export type ParticleKind = 'dot' | 'ring' | 'shard' | 'leaf';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  drag: number;
  rot: number;
  spin: number;
  color: string;
  alpha: number;
}

const MAX_PARTICLES = 1100;

function blank(): Particle {
  return {
    active: false,
    kind: 'dot',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    grow: 0,
    drag: 2,
    rot: 0,
    spin: 0,
    color: '#fff',
    alpha: 1,
  };
}

/** Fixed-size particle pool: no allocation during play, oldest particle recycled when full. */
export class Particles {
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, blank);
  private cursor = 0;
  count = 0;

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.count = 0;
    this.cursor = 0;
  }

  private next(): Particle {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[(this.cursor + i) % MAX_PARTICLES] as Particle;
      if (!p.active) {
        this.cursor = (this.cursor + i + 1) % MAX_PARTICLES;
        return p;
      }
    }
    const p = this.pool[this.cursor] as Particle;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  spawn(opts: Partial<Particle> & { x: number; y: number; life: number; color: string }): void {
    const p = this.next();
    p.active = true;
    p.kind = opts.kind ?? 'dot';
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.size = opts.size ?? 2.5;
    p.grow = opts.grow ?? 0;
    p.drag = opts.drag ?? 2.4;
    p.rot = opts.rot ?? 0;
    p.spin = opts.spin ?? 0;
    p.color = opts.color;
    p.alpha = opts.alpha ?? 1;
  }

  update(dt: number): void {
    let live = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size = Math.max(0.2, p.size + p.grow * dt);
      live++;
    }
    this.count = live;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.35) * p.alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'ring':
          ctx.lineWidth = Math.max(1, p.size * 0.16);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.42, p.size * 2, p.size * 0.84);
          ctx.restore();
          break;
        case 'leaf':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- emitters ---------------------------------------------------------- */

  sprayMist(x: number, y: number, dirX: number, dirY: number, speed: number, color: string): void {
    const spread = rand(-0.42, 0.42);
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const vx = (dirX * cos - dirY * sin) * speed;
    const vy = (dirX * sin + dirY * cos) * speed;
    this.spawn({
      x: x + rand(-3, 3),
      y: y + rand(-3, 3),
      vx,
      vy,
      life: rand(0.26, 0.5),
      size: rand(1.6, 3.8),
      grow: rand(2, 7),
      drag: 3.1,
      color,
      alpha: 0.85,
    });
  }

  hitSplat(x: number, y: number, color: string): void {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU);
      const s = rand(40, 130);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.16, 0.32),
        size: rand(1.4, 2.6),
        drag: 4,
        color,
      });
    }
  }

  deathBurst(x: number, y: number, color: string, dark: string, big: boolean): void {
    const n = big ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(60, big ? 300 : 200);
      this.spawn({
        kind: i % 3 === 0 ? 'shard' : 'dot',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.28, big ? 0.75 : 0.5),
        size: rand(1.8, big ? 5 : 3.4),
        drag: 2.6,
        rot: a,
        spin: rand(-9, 9),
        color: i % 2 === 0 ? color : dark,
      });
    }
    this.spawn({
      kind: 'ring',
      x,
      y,
      life: big ? 0.4 : 0.26,
      size: big ? 12 : 8,
      grow: big ? 120 : 90,
      drag: 0,
      color,
      alpha: 0.7,
    });
  }

  ring(x: number, y: number, color: string, size: number, grow: number, life: number): void {
    this.spawn({ kind: 'ring', x, y, life, size, grow, drag: 0, color, alpha: 0.8 });
  }

  sparkle(x: number, y: number, color: string, count = 12, power = 150): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(power * 0.3, power);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.7),
        size: rand(1.5, 3.2),
        drag: 2.2,
        color,
      });
    }
  }

  dust(x: number, y: number, color: string): void {
    this.spawn({
      x: x + rand(-4, 4),
      y: y + rand(-2, 5),
      vx: rand(-16, 16),
      vy: rand(-8, 4),
      life: rand(0.2, 0.4),
      size: rand(1.4, 2.8),
      drag: 3,
      color,
      alpha: 0.5,
    });
  }

  leaves(x: number, y: number, color: string, count = 6): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(40, 150);
      this.spawn({
        kind: 'leaf',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.4, 0.9),
        size: rand(3, 6),
        drag: 2.1,
        rot: a,
        spin: rand(-7, 7),
        color,
      });
    }
  }
}
