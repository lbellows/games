import { COLORS, VIEW } from '../config.ts';
import { Enemy } from '../entities/enemy.ts';
import { TAU } from '../core/math.ts';
import { button, hitRect, panel, text, type Rect } from './ui.ts';

export const START_BUTTON: Rect = { x: VIEW.w / 2 - 110, y: 594, w: 220, h: 52 };
export const RESTART_BUTTON: Rect = { x: VIEW.w / 2 - 120, y: 486, w: 240, h: 54 };

export interface ScreenContext {
  time: number;
  pointerX: number;
  pointerY: number;
  highScore: number;
}

let icons: Enemy[] | null = null;
function enemyIcons(): Enemy[] {
  if (!icons) {
    const scale = { health: 1, speed: 1, damage: 1 };
    icons = [
      new Enemy('aphid', 0, 0, scale),
      new Enemy('beetle', 0, 0, scale),
      new Enemy('moth', 0, 0, scale),
    ];
    for (const e of icons) e.spawnAnim = 1;
  }
  return icons;
}

function dim(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(4,10,6,${alpha})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function drawIcon(ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number, time: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  enemy.x = 0;
  enemy.y = 0;
  enemy.facing = 0;
  enemy.draw(ctx, time);
  ctx.restore();
}

export function drawTitle(ctx: CanvasRenderingContext2D, c: ScreenContext): void {
  dim(ctx, 0.68);

  const bob = Math.sin(c.time * 1.7) * 4;
  ctx.save();
  ctx.shadowColor = 'rgba(120,240,140,0.55)';
  ctx.shadowBlur = 26;
  text(ctx, 'GARDEN', VIEW.w / 2, 150 + bob, {
    size: 74,
    align: 'center',
    letterSpacing: 10,
    color: '#f2fff0',
  });
  text(ctx, 'DEFENDERS', VIEW.w / 2, 216 + bob, {
    size: 56,
    align: 'center',
    letterSpacing: 14,
    color: COLORS.health,
  });
  ctx.restore();

  text(ctx, 'TEN WAVES OF HUNGRY BUGS. ONE GARDENER. ONE SPRAY BOTTLE.', VIEW.w / 2, 252, {
    size: 14,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });

  /* ---- bestiary -------------------------------------------------------- */
  const bx = VIEW.w / 2 - 300;
  panel(ctx, bx, 278, 600, 128, 12);
  const rows: Array<[string, string]> = [
    ['APHID', 'Fast, flimsy, never alone'],
    ['BEETLE', 'Armoured tank — heavy contact damage'],
    ['MOTH', 'Weaves in, then bursts forward'],
  ];
  const list = enemyIcons();
  rows.forEach(([name, desc], i) => {
    const y = 312 + i * 36;
    const enemy = list[i] as Enemy;
    drawIcon(ctx, enemy, bx + 40, y - 4, c.time, 1.15);
    text(ctx, name, bx + 74, y + 1, { size: 15, letterSpacing: 2, color: iconColor(i) });
    text(ctx, desc, bx + 180, y + 1, { size: 13, color: COLORS.textDim });
  });

  /* ---- controls -------------------------------------------------------- */
  panel(ctx, bx, 420, 600, 152, 12);
  const controls: Array<[string, string]> = [
    ['MOVE', 'W A S D  /  ARROW KEYS'],
    ['AIM', 'MOUSE  (or last move direction)'],
    ['SPRAY', 'HOLD LEFT CLICK  /  SPACE'],
    ['PAUSE', 'P  or  ESC'],
    ['MUTE', 'M'],
  ];
  controls.forEach(([key, value], i) => {
    const y = 448 + i * 25;
    text(ctx, key, bx + 40, y, { size: 13, color: COLORS.energy, letterSpacing: 2 });
    text(ctx, value, bx + 140, y, { size: 13, color: COLORS.text });
  });

  const hovered = hitRect(START_BUTTON, c.pointerX, c.pointerY);
  button(ctx, START_BUTTON, 'START  ▸', hovered);
  text(ctx, 'PRESS ENTER, SPACE OR CLICK', VIEW.w / 2, 668, {
    size: 12,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });
  if (c.highScore > 0) {
    text(ctx, `BEST SCORE  ${c.highScore.toLocaleString('en-US')}`, VIEW.w / 2, 692, {
      size: 13,
      align: 'center',
      color: COLORS.seedScore,
      letterSpacing: 2,
    });
  }
}

function iconColor(i: number): string {
  return [COLORS.aphid, COLORS.beetle, COLORS.moth][i] ?? COLORS.text;
}

export function drawPause(ctx: CanvasRenderingContext2D, c: ScreenContext): void {
  dim(ctx, 0.6);
  text(ctx, 'PAUSED', VIEW.w / 2, VIEW.h / 2 - 40, {
    size: 58,
    align: 'center',
    letterSpacing: 12,
  });
  text(ctx, 'P or ESC to resume   ·   M to mute   ·   R to restart', VIEW.w / 2, VIEW.h / 2 + 10, {
    size: 15,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 2,
  });
  const pulse = 0.5 + 0.5 * Math.sin(c.time * 3);
  ctx.globalAlpha = 0.25 + pulse * 0.3;
  ctx.strokeStyle = COLORS.health;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(VIEW.w / 2 - 230, VIEW.h / 2 - 90, 460, 130, 14);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export interface GameOverInfo extends ScreenContext {
  score: number;
  wave: number;
  newRecord: boolean;
  kills: number;
  survived: number;
}

export function drawGameOver(ctx: CanvasRenderingContext2D, c: GameOverInfo): void {
  dim(ctx, 0.74);
  text(ctx, 'GARDEN OVERRUN', VIEW.w / 2, 190, {
    size: 56,
    align: 'center',
    letterSpacing: 8,
    color: COLORS.danger,
  });

  panel(ctx, VIEW.w / 2 - 250, 232, 500, 216, 14);
  const rows: Array<[string, string]> = [
    ['SCORE', c.score.toLocaleString('en-US')],
    ['BEST', Math.max(c.score, c.highScore).toLocaleString('en-US')],
    ['WAVE REACHED', String(c.wave)],
    ['BUGS SPRAYED', String(c.kills)],
    ['TIME SURVIVED', `${Math.floor(c.survived / 60)}:${String(Math.floor(c.survived % 60)).padStart(2, '0')}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 272 + i * 34;
    text(ctx, label, VIEW.w / 2 - 210, y, { size: 14, color: COLORS.textDim, letterSpacing: 2 });
    text(ctx, value, VIEW.w / 2 + 210, y, { size: 18, align: 'right', letterSpacing: 1 });
  });

  if (c.newRecord) {
    const pulse = 0.5 + 0.5 * Math.sin(c.time * 6);
    text(ctx, '★ NEW HIGH SCORE ★', VIEW.w / 2, 466, {
      size: 20,
      align: 'center',
      color: COLORS.seedScore,
      letterSpacing: 4,
    });
    ctx.globalAlpha = 0.4 * pulse;
    text(ctx, '★ NEW HIGH SCORE ★', VIEW.w / 2, 466, {
      size: 24,
      align: 'center',
      color: '#fff7c2',
      letterSpacing: 4,
    });
    ctx.globalAlpha = 1;
  }

  const r: Rect = { ...RESTART_BUTTON, y: c.newRecord ? 506 : 486 };
  button(ctx, r, 'REPLANT  ↺', hitRect(r, c.pointerX, c.pointerY), COLORS.health);
  text(ctx, 'PRESS R OR ENTER TO PLAY AGAIN', VIEW.w / 2, r.y + 84, {
    size: 12,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });
}

/** Returns the rect the restart button currently occupies (it shifts for the record banner). */
export function restartRect(newRecord: boolean): Rect {
  return { ...RESTART_BUTTON, y: newRecord ? 506 : 486 };
}

export interface Banner {
  title: string;
  subtitle: string;
  color: string;
  timer: number;
  duration: number;
}

export function drawBanner(ctx: CanvasRenderingContext2D, b: Banner): void {
  const t = b.timer / b.duration;
  // ease in for the first 15%, hold, fade for the last 30%
  const alpha = Math.min(1, Math.min((1 - t) * 6.5, t * 3.2));
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const y = VIEW.h * 0.36;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  text(ctx, b.title, VIEW.w / 2, y, { size: 52, align: 'center', letterSpacing: 8, color: b.color });
  text(ctx, b.subtitle, VIEW.w / 2, y + 34, {
    size: 16,
    align: 'center',
    letterSpacing: 4,
    color: COLORS.text,
  });
  ctx.restore();
}

/** Small floating score/heal notices that rise and fade. */
export interface Toast {
  x: number;
  y: number;
  label: string;
  color: string;
  timer: number;
}

export function drawToasts(ctx: CanvasRenderingContext2D, toasts: readonly Toast[]): void {
  for (const t of toasts) {
    const life = Math.max(0, t.timer);
    ctx.save();
    ctx.globalAlpha = Math.min(1, life * 1.6);
    text(ctx, t.label, t.x, t.y - (1.1 - life) * 26, {
      size: 15,
      align: 'center',
      color: t.color,
      letterSpacing: 1,
    });
    ctx.restore();
  }
}

/** Countdown pips shown in the middle of the field between waves. */
export function drawCountdown(ctx: CanvasRenderingContext2D, seconds: number, wave: number): void {
  const n = Math.ceil(seconds);
  if (n <= 0) return;
  const frac = n - seconds;
  const y = VIEW.h * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.85;
  text(ctx, `WAVE ${wave}`, VIEW.w / 2, y - 42, {
    size: 20,
    align: 'center',
    letterSpacing: 6,
    color: COLORS.textDim,
  });
  ctx.globalAlpha = 0.4 + 0.6 * (1 - frac);
  const size = 74 + (1 - frac) * 16;
  text(ctx, String(n), VIEW.w / 2, y + 24, {
    size,
    align: 'center',
    letterSpacing: 2,
    color: COLORS.seedScore,
  });
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = COLORS.seedScore;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(VIEW.w / 2, y - 4, 62, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - frac));
  ctx.stroke();
  ctx.restore();
}
