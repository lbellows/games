import { COLORS } from '../config.ts';
import { clamp } from '../core/math.ts';

export const FONT_STACK = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export interface TextOptions {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: string;
  letterSpacing?: number;
  shadow?: boolean;
}

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: TextOptions = {},
): void {
  const size = opts.size ?? 16;
  ctx.save();
  ctx.font = `${opts.weight ?? '700'} ${size}px ${FONT_STACK}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  if (opts.letterSpacing !== undefined && 'letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${opts.letterSpacing}px`;
  }
  if (opts.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(value, x + 2, y + 2);
  }
  ctx.fillStyle = opts.color ?? COLORS.text;
  ctx.fillText(value, x, y);
  ctx.restore();
}

export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 10,
  fill: string = COLORS.panel,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface BarOptions {
  value: number;
  max: number;
  color: string;
  /** Optional second colour for a low/critical state. */
  warnColor?: string;
  warnBelow?: number;
  segments?: number;
  striped?: boolean;
}

export function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: BarOptions,
): void {
  const t = clamp(opts.max === 0 ? 0 : opts.value / opts.max, 0, 1);
  const critical = opts.warnBelow !== undefined && t <= opts.warnBelow;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();

  if (t > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = critical && opts.warnColor ? opts.warnColor : opts.color;
    ctx.fillRect(x, y, w * t, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w * t, h * 0.4);
    if (opts.striped) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let sx = x - h; sx < x + w * t; sx += 10) {
        ctx.beginPath();
        ctx.moveTo(sx, y + h);
        ctx.lineTo(sx + h * 0.6, y);
        ctx.lineTo(sx + h * 0.6 + 4, y);
        ctx.lineTo(sx + 4, y + h);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  if (opts.segments) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < opts.segments; i++) {
      const sx = x + (w * i) / opts.segments;
      ctx.beginPath();
      ctx.moveTo(sx, y + 1);
      ctx.lineTo(sx, y + h - 1);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.stroke();
  ctx.restore();
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function hitRect(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  hovered: boolean,
  accent: string = COLORS.health,
): void {
  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(93,221,106,0.24)' : 'rgba(8,18,10,0.85)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = hovered ? 2.6 : 1.8;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 6, {
    size: 18,
    align: 'center',
    color: hovered ? '#ffffff' : COLORS.text,
    letterSpacing: 2,
  });
}
