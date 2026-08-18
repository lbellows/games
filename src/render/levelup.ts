import { COLORS, VIEW } from '../config.ts';
import { TAU } from '../core/math.ts';
import type { UpgradeDef, UpgradeIcon } from '../systems/progression.ts';
import type { WeaponSystem } from '../systems/weapons.ts';
import { hitRect, panel, text, wrapText, type Rect } from './ui.ts';

const CARD_W = 320;
const CARD_H = 300;
const CARD_GAP = 26;
const CARD_Y = 236;

export function cardRect(index: number): Rect {
  const total = 3 * CARD_W + 2 * CARD_GAP;
  const x0 = (VIEW.w - total) / 2;
  return { x: x0 + index * (CARD_W + CARD_GAP), y: CARD_Y, w: CARD_W, h: CARD_H };
}

/** Index of the card under the pointer, or -1. */
export function cardAt(x: number, y: number, count: number): number {
  for (let i = 0; i < count; i++) {
    if (hitRect(cardRect(i), x, y)) return i;
  }
  return -1;
}

export interface LevelUpView {
  level: number;
  pending: number;
  choices: readonly UpgradeDef[];
  /** Level each choice would become if taken. */
  nextLevels: readonly number[];
  selected: number;
  pointerX: number;
  pointerY: number;
  time: number;
  weapons: WeaponSystem;
}

export function drawLevelUp(ctx: CanvasRenderingContext2D, v: LevelUpView): void {
  ctx.fillStyle = 'rgba(4,10,6,0.82)';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  const bob = Math.sin(v.time * 3) * 2;
  text(ctx, `LEVEL ${v.level}`, VIEW.w / 2, 150 + bob, {
    size: 56,
    align: 'center',
    letterSpacing: 10,
    color: COLORS.seedScore,
  });
  text(ctx, 'CHOOSE AN UPGRADE', VIEW.w / 2, 186, {
    size: 16,
    align: 'center',
    letterSpacing: 6,
    color: COLORS.text,
  });
  if (v.pending > 1) {
    text(ctx, `${v.pending - 1} MORE LEVEL${v.pending - 1 === 1 ? '' : 'S'} QUEUED`, VIEW.w / 2, 210, {
      size: 12,
      align: 'center',
      letterSpacing: 3,
      color: COLORS.textDim,
    });
  }

  v.choices.forEach((def, i) => {
    const r = cardRect(i);
    const hovered = hitRect(r, v.pointerX, v.pointerY) || v.selected === i;
    const nextLevel = v.nextLevels[i] ?? 1;
    drawCard(ctx, r, def, nextLevel, hovered, i, v);
  });

  text(ctx, 'CLICK  ·  1 2 3  ·  ← → + ENTER', VIEW.w / 2, 584, {
    size: 12,
    align: 'center',
    letterSpacing: 4,
    color: COLORS.textDim,
  });
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  def: UpgradeDef,
  nextLevel: number,
  hovered: boolean,
  index: number,
  v: LevelUpView,
): void {
  const accent = def.weapon ? COLORS.energy : nextLevel > 1 ? COLORS.seedScore : COLORS.health;
  const lift = hovered ? 6 : 0;
  const y = r.y - lift;

  ctx.save();
  if (hovered) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
  }
  panel(ctx, r.x, y, r.w, r.h, 16, hovered ? 'rgba(16,34,20,0.96)' : 'rgba(9,20,12,0.9)');
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = hovered ? 3 : 1.6;
  ctx.globalAlpha = hovered ? 1 : 0.55;
  ctx.beginPath();
  ctx.roundRect(r.x, y, r.w, r.h, 16);
  ctx.stroke();
  ctx.restore();

  // hotkey badge
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = hovered ? 1 : 0.7;
  ctx.beginPath();
  ctx.roundRect(r.x + 14, y + 14, 26, 26, 7);
  ctx.fill();
  ctx.restore();
  text(ctx, String(index + 1), r.x + 27, y + 33, {
    size: 15,
    align: 'center',
    color: '#08130a',
    shadow: false,
  });

  drawUpgradeIcon(ctx, def.icon, r.x + r.w / 2, y + 92, 34, accent, v.time);

  // name (wrapped to two lines if needed)
  const nameLines = wrapText(ctx, def.name, r.w - 44, 19);
  nameLines.slice(0, 2).forEach((line, i) => {
    text(ctx, line, r.x + r.w / 2, y + 152 + i * 23, {
      size: 19,
      align: 'center',
      letterSpacing: 1,
      color: COLORS.text,
    });
  });

  const afterName = y + 152 + Math.min(2, nameLines.length) * 23;

  // level pips
  const pips = Math.min(def.maxLevel, 6);
  const pipW = 13;
  const pipGap = 5;
  const totalW = pips * pipW + (pips - 1) * pipGap;
  const px = r.x + (r.w - totalW) / 2;
  for (let i = 0; i < pips; i++) {
    const filled = i < nextLevel;
    ctx.save();
    ctx.fillStyle = filled ? accent : 'rgba(255,255,255,0.14)';
    ctx.globalAlpha = filled && i === nextLevel - 1 ? 1 : filled ? 0.75 : 1;
    ctx.beginPath();
    ctx.roundRect(px + i * (pipW + pipGap), afterName + 10, pipW, 7, 3);
    ctx.fill();
    ctx.restore();
  }
  if (def.maxLevel > 6) {
    text(ctx, `Lv ${nextLevel}`, r.x + r.w / 2, afterName + 34, {
      size: 12,
      align: 'center',
      color: COLORS.textDim,
    });
  } else {
    text(ctx, nextLevel === 1 ? 'NEW' : `LEVEL ${nextLevel}`, r.x + r.w / 2, afterName + 34, {
      size: 12,
      align: 'center',
      letterSpacing: 2,
      color: nextLevel === 1 ? accent : COLORS.textDim,
    });
  }

  // description
  const desc = def.describe(nextLevel, { weapons: v.weapons });
  const lines = wrapText(ctx, desc, r.w - 44, 14, '400');
  lines.slice(0, 3).forEach((line, i) => {
    text(ctx, line, r.x + r.w / 2, afterName + 62 + i * 19, {
      size: 14,
      align: 'center',
      weight: '400',
      color: COLORS.textDim,
    });
  });
}

/** Small procedural glyphs — no icon font, no images. */
export function drawUpgradeIcon(
  ctx: CanvasRenderingContext2D,
  icon: UpgradeIcon,
  cx: number,
  cy: number,
  size: number,
  accent: string,
  time = 0,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 34;
  ctx.scale(s, s);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;

  switch (icon) {
    case 'damage': {
      // spray droplet burst
      ctx.beginPath();
      ctx.moveTo(-16, 8);
      ctx.quadraticCurveTo(-2, -18, 12, -2);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(6 + i * 6, 6 + i * 3, 3 - i * 0.5, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'range':
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(12, 0);
      ctx.moveTo(4, -7);
      ctx.lineTo(12, 0);
      ctx.lineTo(4, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-16, 0, 3.4, 0, TAU);
      ctx.fill();
      break;
    case 'cone':
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.arc(-14, 0, 26, -0.7, 0.7);
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    case 'boots':
      ctx.beginPath();
      ctx.roundRect(-14, -10, 11, 20, 3);
      ctx.roundRect(2, -4, 11, 14, 3);
      ctx.fill();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.bezierCurveTo(-20, -2, -12, -16, 0, -6);
      ctx.bezierCurveTo(12, -16, 20, -2, 0, 12);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(-12, 12);
      ctx.quadraticCurveTo(-14, -12, 12, -12);
      ctx.quadraticCurveTo(12, 12, -12, 12);
      ctx.fill();
      ctx.strokeStyle = '#08130a';
      ctx.beginPath();
      ctx.moveTo(-10, 10);
      ctx.lineTo(8, -8);
      ctx.stroke();
      break;
    case 'tank':
      ctx.beginPath();
      ctx.roundRect(-11, -13, 22, 26, 5);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.roundRect(-8, -2, 16, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'magnet':
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 2, 12, Math.PI, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, 2);
      ctx.lineTo(-12, 11);
      ctx.moveTo(12, 2);
      ctx.lineTo(12, 11);
      ctx.stroke();
      break;
    case 'xp':
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-9, -9, 18, 18);
      ctx.fill();
      break;
    case 'fist':
      ctx.beginPath();
      ctx.roundRect(-13, -9, 20, 18, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9, -4);
      ctx.lineTo(16, 0);
      ctx.lineTo(9, 4);
      ctx.stroke();
      break;
    case 'sprinkler': {
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = time * 1.8 + (i / 4) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 15, Math.sin(a) * 15, 3.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'seed':
      ctx.beginPath();
      ctx.ellipse(2, 0, 9, 6, 0.4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-16, 4);
      ctx.lineTo(-6, 1);
      ctx.stroke();
      break;
    case 'thorn':
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
        ctx.stroke();
      }
      break;
    case 'seedbag':
      ctx.beginPath();
      ctx.moveTo(-11, -8);
      ctx.lineTo(11, -8);
      ctx.lineTo(14, 13);
      ctx.lineTo(-14, 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#08130a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, -8);
      ctx.quadraticCurveTo(0, -18, 7, -8);
      ctx.stroke();
      break;
    case 'wind':
      for (let i = 0; i < 3; i++) {
        const y = -8 + i * 8;
        ctx.beginPath();
        ctx.moveTo(-15, y);
        ctx.quadraticCurveTo(4, y - 5, 13, y + 2);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}
