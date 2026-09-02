import { COLORS, FIELD, FIELD_BOTTOM, FIELD_RIGHT, VIEW } from '../config.ts';
import { makeRng, TAU } from '../core/math.ts';

/**
 * The garden is drawn once into an offscreen canvas and blitted each frame: it is a lot of
 * little shapes and none of them move. A fixed RNG seed keeps the layout identical per run.
 */
let cache: HTMLCanvasElement | null = null;

export function getGardenLayer(): HTMLCanvasElement {
  if (cache) return cache;
  const canvas = document.createElement('canvas');
  canvas.width = VIEW.w;
  canvas.height = VIEW.h;
  const ctx = canvas.getContext('2d');
  if (ctx) drawGarden(ctx);
  cache = canvas;
  return canvas;
}

const PLOTS: Array<{ x: number; y: number; w: number; h: number; crop: 'leafy' | 'root' | 'flower' }> = [
  { x: 92, y: 150, w: 210, h: 128, crop: 'leafy' },
  { x: 92, y: 452, w: 210, h: 128, crop: 'root' },
  { x: 535, y: 150, w: 210, h: 128, crop: 'flower' },
  { x: 535, y: 452, w: 210, h: 128, crop: 'leafy' },
  { x: 978, y: 150, w: 210, h: 128, crop: 'root' },
  { x: 978, y: 452, w: 210, h: 128, crop: 'flower' },
];

export function drawGarden(ctx: CanvasRenderingContext2D): void {
  const rng = makeRng(0x5eed);

  // --- base turf ---------------------------------------------------------
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  grad.addColorStop(0, COLORS.grass);
  grad.addColorStop(1, COLORS.grassDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // darker apron outside the fence
  ctx.fillStyle = COLORS.grassEdge;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, VIEW.w, FIELD.y);
  ctx.fillRect(0, FIELD_BOTTOM, VIEW.w, VIEW.h - FIELD_BOTTOM);
  ctx.fillRect(0, FIELD.y, FIELD.x, FIELD.h);
  ctx.fillRect(FIELD_RIGHT, FIELD.y, VIEW.w - FIELD_RIGHT, FIELD.h);
  ctx.globalAlpha = 1;

  // grass tufts
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 1400; i++) {
    const x = rng() * VIEW.w;
    const y = FIELD.y + rng() * FIELD.h;
    const h = 2 + rng() * 4;
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2, y - h);
    ctx.stroke();
  }

  // --- gravel paths (a cross through the middle) --------------------------
  drawPath(ctx, rng, FIELD.x + 6, FIELD.y + FIELD.h / 2 - 26, FIELD.w - 12, 52);
  drawPath(ctx, rng, FIELD.x + FIELD.w / 2 - 26, FIELD.y + 6, 52, FIELD.h - 12);

  // --- plots -------------------------------------------------------------
  for (const plot of PLOTS) drawPlot(ctx, rng, plot);

  // --- fence -------------------------------------------------------------
  drawFence(ctx);

  // --- vignette ----------------------------------------------------------
  const vig = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.35, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.92);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.pathDark;
  for (let i = 0; i < (w * h) / 90; i++) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    const r = 0.8 + rng() * 1.8;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawPlot(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  plot: { x: number; y: number; w: number; h: number; crop: 'leafy' | 'root' | 'flower' },
): void {
  const { x, y, w, h } = plot;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 5, w, h, 8);
  ctx.fill();

  ctx.fillStyle = COLORS.soil;
  ctx.strokeStyle = COLORS.soilDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // furrows
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 3;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const ry = y + ((r + 0.5) * h) / rows;
    ctx.beginPath();
    ctx.moveTo(x + 10, ry);
    ctx.lineTo(x + w - 10, ry);
    ctx.stroke();
  }

  // soil speckle
  ctx.fillStyle = COLORS.soilDark;
  for (let i = 0; i < 90; i++) {
    ctx.beginPath();
    ctx.arc(x + 6 + rng() * (w - 12), y + 6 + rng() * (h - 12), 0.7 + rng() * 1.4, 0, TAU);
    ctx.fill();
  }

  // crops
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + 20 + (c * (w - 40)) / (cols - 1);
      const cy = y + ((r + 0.5) * h) / rows;
      if (rng() < 0.12) continue;
      if (plot.crop === 'leafy') drawCabbage(ctx, cx, cy, 9 + rng() * 3);
      else if (plot.crop === 'root') drawCarrotTop(ctx, cx, cy, rng);
      else drawFlower(ctx, cx, cy, rng);
    }
  }
}

function drawCabbage(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#3f7a35';
  ctx.strokeStyle = '#275122';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,230,160,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x, y, r * (0.3 + i * 0.25), 0, TAU);
    ctx.stroke();
  }
}

function drawCarrotTop(ctx: CanvasRenderingContext2D, x: number, y: number, rng: () => number): void {
  ctx.strokeStyle = '#46833a';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.32 + (rng() - 0.5) * 0.16;
    const l = 8 + rng() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x + Math.cos(a) * l, y + 3 + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.fillStyle = '#d8752c';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 3.2, 2.2, 0, 0, TAU);
  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, rng: () => number): void {
  const palette = ['#e2657f', '#e8b23c', '#c86bd0', '#e8e2f0'];
  const color = palette[Math.floor(rng() * palette.length)] as string;
  ctx.strokeStyle = '#3f7a35';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y + 7);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = color;
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + rng() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4, 2.7, 2, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#f6e58d';
  ctx.beginPath();
  ctx.arc(x, y, 1.9, 0, TAU);
  ctx.fill();
}

function drawFence(ctx: CanvasRenderingContext2D): void {
  const postGap = 46;
  const rail = (x1: number, y1: number, x2: number, y2: number): void => {
    ctx.strokeStyle = COLORS.fence;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + 2);
    ctx.lineTo(x2, y2 + 2);
    ctx.stroke();
  };

  for (const inset of [-6, 4]) {
    rail(FIELD.x, FIELD.y + inset, FIELD_RIGHT, FIELD.y + inset);
    rail(FIELD.x, FIELD_BOTTOM - inset, FIELD_RIGHT, FIELD_BOTTOM - inset);
  }
  for (const inset of [-6, 4]) {
    rail(FIELD.x + inset, FIELD.y, FIELD.x + inset, FIELD_BOTTOM);
    rail(FIELD_RIGHT - inset, FIELD.y, FIELD_RIGHT - inset, FIELD_BOTTOM);
  }

  const post = (x: number, y: number): void => {
    ctx.fillStyle = COLORS.fenceDark;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 11, 8, 22, 2);
    ctx.fill();
    ctx.fillStyle = COLORS.fence;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 10, 5, 20, 2);
    ctx.fill();
  };

  for (let x = FIELD.x; x <= FIELD_RIGHT; x += postGap) {
    post(x, FIELD.y);
    post(x, FIELD_BOTTOM);
  }
  for (let y = FIELD.y; y <= FIELD_BOTTOM; y += postGap) {
    post(FIELD.x, y);
    post(FIELD_RIGHT, y);
  }
}
