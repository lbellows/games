import { COLORS, VIEW } from '../config.ts';
import { Enemy } from '../entities/enemy.ts';
import { TAU } from '../core/math.ts';
import { button, hitRect, panel, text, type Rect } from './ui.ts';

export const START_BUTTON: Rect = { x: VIEW.w / 2 - 110, y: 600, w: 220, h: 48 };
export const RESTART_BUTTON: Rect = { x: VIEW.w / 2 - 120, y: 486, w: 240, h: 54 };

export type GameMode = 'campaign' | 'arena';
export const MODES: GameMode[] = ['campaign', 'arena'];

const CARD_W = 420;
const CARD_H = 196;
const CARD_GAP = 30;

export function modeCardRect(index: number): Rect {
  const total = 2 * CARD_W + CARD_GAP;
  return { x: (VIEW.w - total) / 2 + index * (CARD_W + CARD_GAP), y: 276, w: CARD_W, h: CARD_H };
}

/** Index of the mode card under the pointer, or -1. */
export function modeCardAt(x: number, y: number): number {
  for (let i = 0; i < MODES.length; i++) {
    if (hitRect(modeCardRect(i), x, y)) return i;
  }
  return -1;
}

export interface ScreenContext {
  time: number;
  pointerX: number;
  pointerY: number;
  highScore: number;
}

export interface TitleContext extends ScreenContext {
  selectedMode: number;
  bestByMode: Record<GameMode, number>;
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

export function drawTitle(ctx: CanvasRenderingContext2D, c: TitleContext): void {
  dim(ctx, 0.68);

  const bob = Math.sin(c.time * 1.7) * 4;
  ctx.save();
  ctx.shadowColor = 'rgba(120,240,140,0.55)';
  ctx.shadowBlur = 26;
  text(ctx, 'GARDEN', VIEW.w / 2, 138 + bob, {
    size: 68,
    align: 'center',
    letterSpacing: 10,
    color: '#f2fff0',
  });
  text(ctx, 'DEFENDERS', VIEW.w / 2, 198 + bob, {
    size: 52,
    align: 'center',
    letterSpacing: 14,
    color: COLORS.health,
  });
  ctx.restore();

  text(ctx, 'HUNGRY BUGS. ONE GARDENER. ONE SPRAY BOTTLE.', VIEW.w / 2, 232, {
    size: 13,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });
  text(ctx, 'CHOOSE A MODE', VIEW.w / 2, 262, {
    size: 12,
    align: 'center',
    color: COLORS.text,
    letterSpacing: 5,
  });

  /* ---- mode cards ------------------------------------------------------ */
  const cards: Array<{ title: string; tag: string; lines: string[]; accent: string }> = [
    {
      title: 'CAMPAIGN',
      tag: '10 WAVES, THEN ENDLESS',
      lines: [
        'Hold the garden wave by wave',
        'Manual spray  ·  seed pickups',
        'Beat wave 10 to save the garden',
      ],
      accent: COLORS.health,
    },
    {
      title: 'ARENA',
      tag: '10-MINUTE ROGUELITE RUN',
      lines: [
        'Auto-fire  ·  level up  ·  draft upgrades',
        'Swarms, elites and two bosses',
        'Survive the clock to win',
      ],
      accent: COLORS.energy,
    },
  ];

  cards.forEach((card, i) => {
    const r = modeCardRect(i);
    const mode = MODES[i] as GameMode;
    const hovered = hitRect(r, c.pointerX, c.pointerY);
    const active = c.selectedMode === i || hovered;
    const lift = active ? 4 : 0;
    const y = r.y - lift;

    ctx.save();
    if (active) {
      ctx.shadowColor = card.accent;
      ctx.shadowBlur = 20;
    }
    panel(ctx, r.x, y, r.w, r.h, 16, active ? 'rgba(16,34,20,0.95)' : 'rgba(9,20,12,0.88)');
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = card.accent;
    ctx.globalAlpha = active ? 1 : 0.45;
    ctx.lineWidth = active ? 3 : 1.6;
    ctx.beginPath();
    ctx.roundRect(r.x, y, r.w, r.h, 16);
    ctx.stroke();
    ctx.restore();

    // hotkey badge
    ctx.save();
    ctx.fillStyle = card.accent;
    ctx.globalAlpha = active ? 1 : 0.65;
    ctx.beginPath();
    ctx.roundRect(r.x + 16, y + 16, 24, 24, 7);
    ctx.fill();
    ctx.restore();
    text(ctx, String(i + 1), r.x + 28, y + 34, {
      size: 14,
      align: 'center',
      color: '#08130a',
      shadow: false,
    });

    text(ctx, card.title, r.x + r.w / 2, y + 52, {
      size: 30,
      align: 'center',
      letterSpacing: 6,
      color: active ? '#ffffff' : COLORS.text,
    });
    text(ctx, card.tag, r.x + r.w / 2, y + 76, {
      size: 12,
      align: 'center',
      letterSpacing: 3,
      color: card.accent,
    });
    card.lines.forEach((line, li) => {
      text(ctx, line, r.x + r.w / 2, y + 106 + li * 21, {
        size: 13,
        align: 'center',
        weight: '400',
        color: COLORS.textDim,
      });
    });
    const best = c.bestByMode[mode];
    text(ctx, best > 0 ? `BEST  ${best.toLocaleString('en-US')}` : 'NO SCORE YET', r.x + r.w / 2, y + 176, {
      size: 12,
      align: 'center',
      letterSpacing: 2,
      color: best > 0 ? COLORS.seedScore : 'rgba(157,187,153,0.6)',
    });
  });

  /* ---- controls -------------------------------------------------------- */
  const cx = VIEW.w / 2;
  panel(ctx, cx - 435, 490, 870, 96, 12);
  const controls: Array<[string, string]> = [
    ['MOVE', 'W A S D  /  ARROWS'],
    ['AIM', 'MOUSE  (or last move direction)'],
    ['SPRAY', 'HOLD CLICK  /  SPACE'],
    ['PAUSE', 'P  or  ESC'],
    ['MUTE', 'M'],
    ['UPGRADES', 'CLICK  /  1 2 3'],
  ];
  controls.forEach(([key, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = cx - 400 + col * 430;
    const y = 518 + row * 24;
    text(ctx, key, x, y, { size: 12, color: COLORS.energy, letterSpacing: 2 });
    text(ctx, value, x + 100, y, { size: 12, color: COLORS.text, weight: '400' });
  });

  const hovered = hitRect(START_BUTTON, c.pointerX, c.pointerY);
  const startLabel = `START  ${(MODES[c.selectedMode] ?? 'campaign').toUpperCase()}  ▸`;
  button(ctx, START_BUTTON, startLabel, hovered);
  text(ctx, '← → SELECT   ·   ENTER OR CLICK TO PLANT YOUR BOOTS', VIEW.w / 2, 668, {
    size: 11,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });

  /* ---- bestiary strip -------------------------------------------------- */
  const list = enemyIcons();
  const names = ['APHID', 'BEETLE', 'MOTH'];
  const notes = ['fast swarmer', 'armoured tank', 'weaves + dashes'];
  names.forEach((name, i) => {
    const x = VIEW.w / 2 - 330 + i * 235;
    const y = 698;
    drawIcon(ctx, list[i] as Enemy, x, y - 4, c.time, 1);
    text(ctx, name, x + 22, y - 1, { size: 12, color: iconColor(i), letterSpacing: 1 });
    text(ctx, notes[i] as string, x + 84, y - 1, {
      size: 11,
      color: COLORS.textDim,
      weight: '400',
    });
  });
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
  text(ctx, 'P or ESC resume   ·   M mute   ·   R restart   ·   T title', VIEW.w / 2, VIEW.h / 2 + 10, {
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
  newRecord: boolean;
  victory: boolean;
  headline: string;
  subhead: string;
  /** Mode-specific stat rows, built by the game. */
  rows: ReadonlyArray<[string, string]>;
}

export function drawGameOver(ctx: CanvasRenderingContext2D, c: GameOverInfo): void {
  dim(ctx, 0.74);
  const accent = c.victory ? COLORS.seedScore : COLORS.danger;

  if (c.victory) {
    // celebratory glow behind the headline
    ctx.save();
    ctx.shadowColor = 'rgba(255,217,61,0.6)';
    ctx.shadowBlur = 30;
    text(ctx, c.headline, VIEW.w / 2, 176, {
      size: 54,
      align: 'center',
      letterSpacing: 8,
      color: accent,
    });
    ctx.restore();
  } else {
    text(ctx, c.headline, VIEW.w / 2, 176, {
      size: 54,
      align: 'center',
      letterSpacing: 8,
      color: accent,
    });
  }
  text(ctx, c.subhead, VIEW.w / 2, 204, {
    size: 14,
    align: 'center',
    letterSpacing: 4,
    color: COLORS.textDim,
  });

  const rows = c.rows.slice(0, 6);
  const panelH = 30 + rows.length * 32;
  panel(ctx, VIEW.w / 2 - 250, 226, 500, panelH, 14);
  rows.forEach(([label, value], i) => {
    const y = 262 + i * 32;
    text(ctx, label, VIEW.w / 2 - 210, y, { size: 13, color: COLORS.textDim, letterSpacing: 2 });
    text(ctx, value, VIEW.w / 2 + 210, y, { size: 17, align: 'right', letterSpacing: 1 });
  });

  const afterPanel = 226 + panelH;
  if (c.newRecord) {
    const pulse = 0.5 + 0.5 * Math.sin(c.time * 6);
    text(ctx, '★ NEW HIGH SCORE ★', VIEW.w / 2, afterPanel + 30, {
      size: 20,
      align: 'center',
      color: COLORS.seedScore,
      letterSpacing: 4,
    });
    ctx.globalAlpha = 0.4 * pulse;
    text(ctx, '★ NEW HIGH SCORE ★', VIEW.w / 2, afterPanel + 30, {
      size: 24,
      align: 'center',
      color: '#fff7c2',
      letterSpacing: 4,
    });
    ctx.globalAlpha = 1;
  }

  const r = restartRect(c.newRecord, rows.length);
  button(ctx, r, c.victory ? 'PLAY AGAIN  ↺' : 'REPLANT  ↺', hitRect(r, c.pointerX, c.pointerY), COLORS.health);
  text(ctx, 'R OR ENTER TO PLAY AGAIN   ·   T FOR TITLE SCREEN', VIEW.w / 2, r.y + 76, {
    size: 12,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 3,
  });
}

/** Returns the rect the restart button currently occupies (it shifts with the panel size). */
export function restartRect(newRecord: boolean, rowCount = 5): Rect {
  const afterPanel = 226 + 30 + rowCount * 32;
  return { ...RESTART_BUTTON, y: afterPanel + (newRecord ? 48 : 20) };
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
