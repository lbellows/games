import { VIEW } from './config.ts';
import { GameAudio } from './core/audio.ts';
import { Input } from './core/input.ts';
import { Game } from './game/game.ts';

function requireCanvas(): HTMLCanvasElement {
  const el = document.getElementById('game');
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error('Garden Defenders: #game canvas is missing from the page');
  }
  return el;
}

function requireContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = target.getContext('2d', { alpha: false });
  if (!c) throw new Error('Garden Defenders: this browser does not support 2D canvas');
  return c;
}

const canvas = requireCanvas();
const ctx = requireContext(canvas);

const input = new Input();
input.attach(canvas);
const audio = new GameAudio();
const game = new Game(input, audio);

/** Sizes the backing store for the device pixel ratio and letterboxes to the window. */
function resize(): void {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const scale = Math.min(window.innerWidth / VIEW.w, (window.innerHeight - 18) / VIEW.h);
  const cssW = Math.max(320, Math.floor(VIEW.w * scale));
  const cssH = Math.max(180, Math.floor(VIEW.h * scale));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const bw = Math.floor(VIEW.w * dpr);
  const bh = Math.floor(VIEW.h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

window.addEventListener('resize', resize);
resize();

// Web Audio needs a user gesture before it will make a sound.
const unlock = (): void => audio.unlock();
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

// Losing focus mid-wave should not cost the player health.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') {
    game.state = 'paused';
    audio.stopSpray();
  }
});

const STEP = 1 / 60;
const MAX_STEPS = 5;
let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    game.update(STEP);
    input.endFrame();
    accumulator -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0; // dropped frames: do not build up debt

  game.draw(ctx);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
