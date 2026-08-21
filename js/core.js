// Core primitives: RNG, math, collision, input, timing, events, spatial hashing.
// Owned by the integrator. Agents import from here; nobody edits it during fan-out.

export const ARENA = { w: 1280, h: 720 };

/* ---------------------------------------------------------------- random */

export class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 1;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a, b) {
    return a + this.next() * (b - a);
  }
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
  chance(p) {
    return this.next() < p;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // Weighted pick: entries are [value, weight] pairs.
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = this.next() * total;
    for (const [v, w] of pairs) {
      roll -= w;
      if (roll <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }
}

/* ------------------------------------------------------------------ math */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const TAU = Math.PI * 2;

// Normalize a vector in place-ish; returns {x,y} of unit length (0,0 stays 0,0).
export function norm(x, y) {
  const m = Math.hypot(x, y);
  return m > 1e-6 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
}

// Circle overlap test on entities carrying {x,y,r}.
export function hits(a, b) {
  const rr = a.r + b.r;
  return dist2(a.x, a.y, b.x, b.y) <= rr * rr;
}

// Keep an entity inside the arena, accounting for its radius.
export function confine(e) {
  e.x = clamp(e.x, e.r, ARENA.w - e.r);
  e.y = clamp(e.y, e.r, ARENA.h - e.r);
}

/* ---------------------------------------------------------------- events */

export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const list = this.map.get(name);
    if (list) {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
  }
  emit(name, payload) {
    const list = this.map.get(name);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }
}

/* ----------------------------------------------------------------- input */

export class Input {
  constructor(target) {
    this.keys = new Set();
    this.pressed = new Set(); // cleared each frame by endFrame()
    // Headless (test) runs have no window; the key sets still work by hand.
    if (target === undefined) target = typeof window !== "undefined" ? window : null;
    if (!target) return;
    target.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    });
    target.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    target.addEventListener("blur", () => this.keys.clear());
  }
  down(k) {
    return this.keys.has(k);
  }
  hit(k) {
    return this.pressed.has(k);
  }
  // Movement axis from WASD + arrows, normalized so diagonals aren't faster.
  axis() {
    let x = 0,
      y = 0;
    if (this.down("a") || this.down("arrowleft")) x -= 1;
    if (this.down("d") || this.down("arrowright")) x += 1;
    if (this.down("w") || this.down("arrowup")) y -= 1;
    if (this.down("s") || this.down("arrowdown")) y += 1;
    return norm(x, y);
  }
  endFrame() {
    this.pressed.clear();
  }
}

/* ------------------------------------------------------------ spatial hash */

// Uniform grid used to keep projectile/enemy collision off the O(n^2) path.
export class Grid {
  constructor(cell = 64) {
    this.cell = cell;
    this.buckets = new Map();
  }
  key(cx, cy) {
    return cx * 73856093 ^ (cy * 19349663);
  }
  clear() {
    this.buckets.clear();
  }
  insert(e) {
    const c = this.cell;
    const k = this.key((e.x / c) | 0, (e.y / c) | 0);
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = []));
    b.push(e);
  }
  rebuild(list) {
    this.clear();
    for (const e of list) if (!e.dead) this.insert(e);
  }
  // Every entity within `radius` of (x,y), as a flat array.
  query(x, y, radius) {
    const c = this.cell;
    const out = [];
    const x0 = ((x - radius) / c) | 0,
      x1 = ((x + radius) / c) | 0;
    const y0 = ((y - radius) / c) | 0,
      y1 = ((y + radius) / c) | 0;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}

/* ----------------------------------------------------------------- misc */

// Remove dead entities in place without allocating a new array.
export function compact(list) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].dead) list[w++] = list[i];
  }
  list.length = w;
}

export const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
