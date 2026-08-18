/** Tiny localStorage wrapper that degrades to in-memory when storage is unavailable. */

const KEY_HIGHSCORE = 'garden-defenders.highscore';
const KEY_MUTED = 'garden-defenders.muted';

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (v !== null && v !== undefined) return v;
  } catch {
    /* storage blocked (private mode, file://, sandbox) */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* ignore: the in-memory copy keeps the session consistent */
  }
}

export function loadHighScore(): number {
  const raw = read(KEY_HIGHSCORE);
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function saveHighScore(score: number): void {
  write(KEY_HIGHSCORE, String(Math.max(0, Math.floor(score))));
}

export function loadMuted(): boolean {
  return read(KEY_MUTED) === '1';
}

export function saveMuted(muted: boolean): void {
  write(KEY_MUTED, muted ? '1' : '0');
}
