// Canvas renderer. Enemies, bullets and FX stay primitives; the player is the
// one sprite (art/player.png). Cost control: the static arena backdrop, the
// fallback player gradient and every glow sprite are baked once in initRender;
// per-frame work is batched into one path fill per (shape, color) group.

import { ARENA, TAU, clamp, compact } from "./core.js";

const DPR_CAP = 2;          // beyond 2x the extra fill rate buys nothing visible
const SUBSTEP = 1 / 60;     // `alpha` is a fraction of one fixed step
const MAX_PARTICLES = 1400;

let cv = null;
let ctx = null;
let dpr = 1;
let floorImg = null;
let playerBody = null;
let playerSprite = null;
let hurtGrad = null;
let vignette = null;
let time = 0;
let lastNow = 0;

/* ------------------------------------------------------------ color helpers */

const rgbCache = new Map();

function rgbOf(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  v = { r: 255, g: 255, b: 255 };
  if (typeof hex === "string" && hex.charCodeAt(0) === 35) {
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    if (!Number.isNaN(n)) v = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  rgbCache.set(hex, v);
  return v;
}

const rgbaCache = new Map();

// Alpha is quantized so repeated fades reuse one string instead of allocating.
function rgba(hex, a) {
  const q = Math.round(clamp(a, 0, 1) * 20) / 20;
  const key = hex + "|" + q;
  let s = rgbaCache.get(key);
  if (s === undefined) {
    const c = rgbOf(hex);
    s = "rgba(" + c.r + "," + c.g + "," + c.b + "," + q + ")";
    rgbaCache.set(key, s);
  }
  return s;
}

const mixCache = new Map();

// Blend toward white (t > 0) or black (t < 0); used for rims and shadows.
function shade(hex, t) {
  const key = hex + "|" + t;
  let s = mixCache.get(key);
  if (s === undefined) {
    const c = rgbOf(hex);
    const target = t > 0 ? 255 : 0;
    const k = Math.abs(t);
    const r = Math.round(c.r + (target - c.r) * k);
    const g = Math.round(c.g + (target - c.g) * k);
    const b = Math.round(c.b + (target - c.b) * k);
    s = "rgb(" + r + "," + g + "," + b + ")";
    mixCache.set(key, s);
  }
  return s;
}

const glowCache = new Map();

// A pre-baked radial falloff, drawn with "lighter" wherever something needs to
// bloom. Building these once beats createRadialGradient in the draw loop.
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const size = 64;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(color, 0.95));
  grad.addColorStop(0.35, rgba(color, 0.4));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(color, c);
  return c;
}

function drawGlow(color, x, y, r, alpha) {
  const img = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/* -------------------------------------------------------------- baked layers */

function bakeFloor() {
  const c = document.createElement("canvas");
  c.width = Math.round(ARENA.w * dpr);
  c.height = Math.round(ARENA.h * dpr);
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = "#0a0c15";
  g.fillRect(0, 0, ARENA.w, ARENA.h);

  // Warm pool of light at the center so the arena has a readable middle.
  const lit = g.createRadialGradient(ARENA.w / 2, ARENA.h / 2, 60, ARENA.w / 2, ARENA.h / 2, 760);
  lit.addColorStop(0, "#1b2036");
  lit.addColorStop(0.55, "#121625");
  lit.addColorStop(1, "#080a12");
  g.fillStyle = lit;
  g.fillRect(0, 0, ARENA.w, ARENA.h);

  g.lineWidth = 1;
  g.strokeStyle = "rgba(122,150,220,0.055)";
  g.beginPath();
  for (let x = 40; x < ARENA.w; x += 40) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, ARENA.h);
  }
  for (let y = 40; y < ARENA.h; y += 40) {
    g.moveTo(0, y + 0.5);
    g.lineTo(ARENA.w, y + 0.5);
  }
  g.stroke();

  g.strokeStyle = "rgba(122,150,220,0.11)";
  g.beginPath();
  for (let x = 160; x < ARENA.w; x += 160) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, ARENA.h);
  }
  for (let y = 160; y < ARENA.h; y += 160) {
    g.moveTo(0, y + 0.5);
    g.lineTo(ARENA.w, y + 0.5);
  }
  g.stroke();

  // Grit: deterministic speckle so the floor is not a flat wash.
  g.fillStyle = "rgba(255,255,255,0.028)";
  let seed = 1337;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const px = (seed % ARENA.w) | 0;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const py = (seed % ARENA.h) | 0;
    g.fillRect(px, py, 2, 2);
  }

  // Containment border plus corner brackets.
  g.strokeStyle = "rgba(90,120,190,0.5)";
  g.lineWidth = 2;
  g.strokeRect(3, 3, ARENA.w - 6, ARENA.h - 6);
  g.strokeStyle = "rgba(255,176,32,0.75)";
  g.lineWidth = 4;
  const arm = 46;
  const corners = [
    [6, 6, 1, 1],
    [ARENA.w - 6, 6, -1, 1],
    [6, ARENA.h - 6, 1, -1],
    [ARENA.w - 6, ARENA.h - 6, -1, -1],
  ];
  g.beginPath();
  for (const [cx, cy, sx, sy] of corners) {
    g.moveTo(cx + sx * arm, cy);
    g.lineTo(cx, cy);
    g.lineTo(cx, cy + sy * arm);
  }
  g.stroke();

  return c;
}

function bakeGradients() {
  playerBody = ctx.createRadialGradient(-4, -5, 1, 0, 0, 15);
  playerBody.addColorStop(0, "#eaf3ff");
  playerBody.addColorStop(0.4, "#8fd0ff");
  playerBody.addColorStop(1, "#2f6fb8");

  hurtGrad = ctx.createRadialGradient(
    ARENA.w / 2, ARENA.h / 2, 260,
    ARENA.w / 2, ARENA.h / 2, 760
  );
  hurtGrad.addColorStop(0, "rgba(255,40,60,0)");
  hurtGrad.addColorStop(1, "rgba(255,30,50,0.45)");

  vignette = ctx.createRadialGradient(
    ARENA.w / 2, ARENA.h / 2, 340,
    ARENA.w / 2, ARENA.h / 2, 820
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
}

/** Size the canvas to the fixed arena, at device resolution, and bake layers. */
export function initRender(canvas) {
  cv = canvas;
  dpr = clamp(window.devicePixelRatio || 1, 1, DPR_CAP);
  cv.width = Math.round(ARENA.w * dpr);
  cv.height = Math.round(ARENA.h * dpr);
  cv.style.width = ARENA.w + "px";
  cv.style.height = ARENA.h + "px";
  // alpha:false lets the compositor skip blending the whole canvas each frame.
  ctx = cv.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  floorImg = bakeFloor();
  bakeGradients();
  loadPlayerSprite();
  lastNow = performance.now() / 1000;
  return ctx;
}

function loadPlayerSprite() {
  const img = new Image();
  img.onload = () => { playerSprite = img; };
  img.src = new URL("../art/player.png", import.meta.url).href;
}

/* ------------------------------------------------------------- fx bookkeeping */

// Effect records and particles hang off G so a restart drops them with the run.
function fxStore(G) {
  let s = G._fx;
  if (!s) {
    const N = MAX_PARTICLES;
    s = G._fx = {
      free: [],
      head: 0,
      px: new Float32Array(N),
      py: new Float32Array(N),
      pvx: new Float32Array(N),
      pvy: new Float32Array(N),
      plife: new Float32Array(N),
      pmax: new Float32Array(N),
      psize: new Float32Array(N),
      pdrag: new Float32Array(N),
      pcol: new Uint8Array(N),
      pal: [],
      palIndex: new Map(),
      groups: [],
    };
  }
  return s;
}

function palSlot(s, color) {
  let i = s.palIndex.get(color);
  if (i === undefined) {
    if (s.pal.length >= 255) return 0;
    i = s.pal.length;
    s.pal.push(color);
    s.palIndex.set(color, i);
    s.groups.push([]);
  }
  return i;
}

function emit(G, x, y, color, count, speed, size, ttl, drag) {
  const s = fxStore(G);
  const ci = palSlot(s, color);
  for (let i = 0; i < count; i++) {
    const k = s.head;
    s.head = (s.head + 1) % MAX_PARTICLES;
    const a = Math.random() * TAU;
    const sp = speed * (0.35 + Math.random() * 0.85);
    s.px[k] = x;
    s.py[k] = y;
    s.pvx[k] = Math.cos(a) * sp;
    s.pvy[k] = Math.sin(a) * sp;
    const life = ttl * (0.6 + Math.random() * 0.7);
    s.plife[k] = life;
    s.pmax[k] = life;
    s.psize[k] = size * (0.6 + Math.random() * 0.8);
    s.pdrag[k] = drag;
    s.pcol[k] = ci;
  }
}

function takeFx(G) {
  const s = fxStore(G);
  const f = s.free.pop();
  if (f) {
    f.dead = false;
    return f;
  }
  return {
    kind: "", x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, r: 0, r1: 0,
    a: 0, mag: 0, size: 14, width: 3, color: "#ffffff", text: "", crit: false,
    dead: false,
  };
}

function pushFx(G, f) {
  G.effects.push(f);
  return f;
}

/**
 * Spawn a visual-only effect. Unknown kinds degrade to a small puff so effects
 * requested by other modules never draw nothing.
 */
export function addFx(G, kind, x, y, opts) {
  const o = opts || {};
  const color = o.color || "#ffffff";
  switch (kind) {
    case "damage":
    case "dmg":
    case "num": {
      const f = takeFx(G);
      f.kind = "num";
      f.crit = !!o.crit;
      f.x = x + (Math.random() - 0.5) * 12;
      f.y = y - 6;
      f.vx = (Math.random() - 0.5) * (f.crit ? 46 : 26);
      f.vy = f.crit ? -110 : -74;
      f.life = f.maxLife = f.crit ? 0.95 : 0.65;
      f.text = o.text !== undefined ? String(o.text) : String(Math.round(o.value || 0));
      f.color = o.color || (f.crit ? "#ffd23f" : "#ffffff");
      f.size = o.size || (f.crit ? 27 : 17);
      if (f.crit) emit(G, x, y, f.color, 5, 150, 2.2, 0.3, 3.4);
      return pushFx(G, f);
    }
    case "text":
    case "heal": {
      const f = takeFx(G);
      f.kind = "num";
      f.crit = false;
      f.x = x;
      f.y = y - 10;
      f.vx = 0;
      f.vy = -52;
      f.life = f.maxLife = o.life || 0.9;
      f.text = o.text !== undefined ? String(o.text) : "+" + Math.round(o.value || 0);
      f.color = o.color || "#5fe08a";
      f.size = o.size || 18;
      return pushFx(G, f);
    }
    case "hit": {
      emit(G, x, y, color, o.count || 5, o.speed || 190, 2.4, 0.22, 4.5);
      return null;
    }
    case "burst":
    case "death":
    case "explode":
    case "explosion": {
      const r = o.r || 14;
      emit(G, x, y, color, o.count || Math.min(26, 8 + r), o.speed || 230, 2.2 + r * 0.06, 0.45, 3.2);
      emit(G, x, y, "#ffffff", 4, 300, 2, 0.2, 5);
      const f = takeFx(G);
      f.kind = "ring";
      f.x = x;
      f.y = y;
      f.r = r * 0.4;
      f.r1 = r * 2.4;
      f.life = f.maxLife = 0.3;
      f.color = color;
      f.width = 3;
      return pushFx(G, f);
    }
    case "muzzle":
    case "flash": {
      const f = takeFx(G);
      f.kind = "muzzle";
      f.x = x;
      f.y = y;
      f.a = o.angle !== undefined ? o.angle : o.a || 0;
      f.r = o.r || 20;
      f.life = f.maxLife = 0.09;
      f.color = color;
      return pushFx(G, f);
    }
    case "spark":
    case "sparkle":
    case "pickup": {
      emit(G, x, y, color, o.count || 6, o.speed || 110, 1.8, 0.36, 2.6);
      const f = takeFx(G);
      f.kind = "ring";
      f.x = x;
      f.y = y;
      f.r = 2;
      f.r1 = o.r || 20;
      f.life = f.maxLife = 0.26;
      f.color = color;
      f.width = 2;
      return pushFx(G, f);
    }
    case "levelup": {
      emit(G, x, y, "#ffd23f", 22, 210, 2.6, 0.7, 2.2);
      for (let i = 0; i < 2; i++) {
        const f = takeFx(G);
        f.kind = "ring";
        f.x = x;
        f.y = y;
        f.r = 8;
        f.r1 = 120 + i * 46;
        f.life = f.maxLife = 0.55 + i * 0.2;
        f.color = i ? "#ffffff" : "#ffd23f";
        f.width = 5 - i * 2;
        pushFx(G, f);
      }
      const t = takeFx(G);
      t.kind = "num";
      t.crit = false;
      t.x = x;
      t.y = y - 30;
      t.vx = 0;
      t.vy = -40;
      t.life = t.maxLife = 1.1;
      t.text = "LEVEL UP";
      t.color = "#ffd23f";
      t.size = 22;
      return pushFx(G, t);
    }
    case "telegraph":
    case "warn": {
      const f = takeFx(G);
      f.kind = "telegraph";
      f.x = x;
      f.y = y;
      f.r = o.r || 90;
      f.life = f.maxLife = o.life || 1;
      f.color = o.color || "#ff5747";
      f.width = o.width || 4;
      return pushFx(G, f);
    }
    case "ring": {
      const f = takeFx(G);
      f.kind = "ring";
      f.x = x;
      f.y = y;
      f.r = o.r || 6;
      f.r1 = o.r1 || 60;
      f.life = f.maxLife = o.life || 0.35;
      f.color = color;
      f.width = o.width || 3;
      return pushFx(G, f);
    }
    case "shake": {
      const f = takeFx(G);
      f.kind = "shake";
      f.x = x;
      f.y = y;
      f.mag = o.mag || 6;
      f.life = f.maxLife = o.life || 0.25;
      return pushFx(G, f);
    }
    case "hurt": {
      emit(G, x, y, "#ff4d5e", 14, 200, 2.6, 0.4, 3);
      const v = takeFx(G);
      v.kind = "hurt";
      v.life = v.maxLife = 0.4;
      pushFx(G, v);
      const f = takeFx(G);
      f.kind = "shake";
      f.mag = o.mag || 9;
      f.life = f.maxLife = 0.3;
      return pushFx(G, f);
    }
    default: {
      emit(G, x, y, color, o.count || 4, o.speed || 120, 2, 0.3, 3.4);
      return null;
    }
  }
}

/** Advance every effect and particle. Visual-only: never touches game state. */
export function updateFx(G, dt) {
  const list = G.effects;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    f.life -= dt;
    if (f.kind === "num") {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 210 * dt;   // arc up then settle, so stacked numbers stay legible
      f.vx *= 1 - 2 * dt;
    }
    if (f.life <= 0) f.dead = true;
  }

  const s = fxStore(G);
  if (list.length) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].dead && s.free.length < 256) s.free.push(list[i]);
    }
    compact(list);
  }

  const { px, py, pvx, pvy, plife, pdrag } = s;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const l = plife[i];
    if (l <= 0) continue;
    plife[i] = l - dt;
    const d = 1 - pdrag[i] * dt;
    pvx[i] *= d;
    pvy[i] *= d;
    px[i] += pvx[i] * dt;
    py[i] += pvy[i] * dt;
  }
}

/* --------------------------------------------------------------- shape paths */

function pathBlob(x, y, r, ph) {
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const sa = Math.sin(a);
    const rr = r * (1 + Math.sin(a * 3 + ph) * 0.07 + Math.sin(a * 5 - ph * 1.4) * 0.035);
    const px = x + Math.cos(a) * rr * 1.06;
    // Squash the lower half so it sits like a slime instead of floating.
    const py = y + sa * rr * (sa > 0 ? 0.8 : 1.0);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function pathSpike(x, y, r, ang) {
  const points = 7;
  for (let i = 0; i < points * 2; i++) {
    const a = ang + (i / (points * 2)) * TAU;
    const rr = i & 1 ? r * 0.42 : r * 1.28;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function pathSquare(x, y, r, ang) {
  const c = Math.cos(ang) * r * 0.8;
  const s = Math.sin(ang) * r * 0.8;
  ctx.moveTo(x - c + s, y - s - c);
  ctx.lineTo(x + c + s, y + s - c);
  ctx.lineTo(x + c - s, y + s + c);
  ctx.lineTo(x - c - s, y - s + c);
  ctx.closePath();
}

function pathTriangle(x, y, r, ang) {
  const a2 = ang + 2.3;
  const a3 = ang - 2.3;
  ctx.moveTo(x + Math.cos(ang) * r * 1.32, y + Math.sin(ang) * r * 1.32);
  ctx.lineTo(x + Math.cos(a2) * r, y + Math.sin(a2) * r);
  ctx.lineTo(x + Math.cos(a3) * r, y + Math.sin(a3) * r);
  ctx.closePath();
}

function pathRing(x, y, r, ang) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU, false);
  // Opposite winding punches the hole under the default nonzero fill rule.
  const ri = r * 0.52;
  ctx.moveTo(x + ri, y);
  ctx.arc(x, y, ri, TAU, 0, true);
}

function pathEnemy(e, x, y, ang, ph) {
  switch (e.shape) {
    case "spike": pathSpike(x, y, e.r, ang); break;
    case "square": pathSquare(x, y, e.r, ang); break;
    case "triangle": pathTriangle(x, y, e.r, ang); break;
    case "ring": pathRing(x, y, e.r, ang); break;
    default: pathBlob(x, y, e.r, ph); break;
  }
}

/* ---------------------------------------------------------------- draw passes */

// Reused bucket maps: cleared, never reallocated.
const eBuckets = new Map();
const pBuckets = new Map();
const bucketKeys = [];

function resetBuckets(map) {
  for (const arr of map.values()) arr.length = 0;
}

function bucketOf(map, key) {
  let a = map.get(key);
  if (a === undefined) map.set(key, (a = []));
  return a;
}

function drawPickups(G, a) {
  const list = G.pickups;
  if (!list.length) return;
  const bob = Math.sin(time * 5) * 2;
  let mats = 0, xps = 0, heals = 0, crates = 0;

  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type !== "material") continue;
    mats++;
    const x = p.x + p.vx * a;
    const y = p.y + p.vy * a + bob;
    const r = p.r + 1;
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.72, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.72, y);
    ctx.closePath();
  }
  if (mats) {
    ctx.fillStyle = "#ffb020";
    ctx.fill();
    ctx.strokeStyle = "#5a3600";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type !== "xp") continue;
    xps++;
    const x = p.x + p.vx * a;
    const y = p.y + p.vy * a + bob * 0.6;
    ctx.moveTo(x + p.r, y);
    ctx.arc(x, y, p.r, 0, TAU);
  }
  if (xps) {
    ctx.fillStyle = "#35e0d0";
    ctx.fill();
    ctx.strokeStyle = "rgba(10,60,60,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type !== "heal") continue;
    heals++;
    const x = p.x + p.vx * a;
    const y = p.y + p.vy * a + bob;
    const r = p.r + 2;
    const t = r * 0.34;
    ctx.rect(x - t, y - r, t * 2, r * 2);
    ctx.rect(x - r, y - t, r * 2, t * 2);
  }
  if (heals) {
    ctx.fillStyle = "#ff4d5e";
    ctx.fill();
  }

  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type !== "crate") continue;
    crates++;
    const x = p.x + p.vx * a;
    const y = p.y + p.vy * a + bob * 0.4;
    const r = p.r + 2;
    ctx.rect(x - r, y - r, r * 2, r * 2);
  }
  if (crates) {
    ctx.fillStyle = "#b3793d";
    ctx.fill();
    ctx.strokeStyle = "#3a230d";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Bloom pass on the shiny drops only — few enough to afford drawImage each.
  if (mats || heals) {
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.35 + Math.sin(time * 6) * 0.12;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.type === "material") drawGlow("#ffb020", p.x, p.y + bob, p.r * 3.2, pulse);
      else if (p.type === "heal") drawGlow("#ff4d5e", p.x, p.y + bob, p.r * 3.4, pulse);
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

function drawPlayer(G, a) {
  const p = G.player;
  if (!p || p.dead) return;
  const x = p.x + p.vx * a;
  const y = p.y + p.vy * a;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + p.r * 0.95, p.r * 1.05, p.r * 0.42, 0, 0, TAU);
  ctx.fill();

  const flick = p.iframes > 0 && ((p.iframes * 26) | 0) % 2 === 0;
  const bob = Math.sin(time * 7) * 1.4;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = flick ? 0.4 : 1;
  if (playerSprite && playerSprite.naturalWidth) {
    // Billboard: the face stays readable. Facing is the aim pip below.
    const s = p.r * 2.55;
    ctx.drawImage(playerSprite, -s, -s * 1.02, s * 2, s * 2);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, TAU);
    ctx.fillStyle = playerBody;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#dff1ff";
    ctx.stroke();
  }
  ctx.restore();

  const f = p.facing || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(f);
  ctx.fillStyle = "rgba(13,18,32,0.9)";
  ctx.beginPath();
  ctx.moveTo(p.r * 1.35, -3.6);
  ctx.lineTo(p.r * 1.78, 0);
  ctx.lineTo(p.r * 1.35, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  const hpFrac = G.stats && G.stats.maxHp ? p.hp / G.stats.maxHp : 1;
  if (hpFrac <= 0.34) {
    const pulse = 0.35 + Math.sin(time * 9) * 0.25;
    ctx.globalCompositeOperation = "lighter";
    drawGlow("#ff4d5e", x, y, p.r * 4.5, pulse);
    ctx.globalCompositeOperation = "source-over";
  }
}

function drawEnemies(G, a) {
  const list = G.enemies;
  if (!list.length) return;
  resetBuckets(eBuckets);
  bucketKeys.length = 0;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const key = e.hitFlash > 0 ? "!" + e.shape : e.shape + "|" + e.color;
    const b = bucketOf(eBuckets, key);
    if (b.length === 0) bucketKeys.push(key);
    b.push(e);
  }

  for (let k = 0; k < bucketKeys.length; k++) {
    const key = bucketKeys[k];
    const b = eBuckets.get(key);
    const flash = key.charCodeAt(0) === 33;
    ctx.beginPath();
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      const x = e.x + e.vx * a;
      const y = e.y + e.vy * a;
      const ang = e.vx || e.vy ? Math.atan2(e.vy, e.vx) : time * 0.9;
      pathEnemy(e, x, y, ang, time * 4 + e.r);
    }
    ctx.fillStyle = flash ? "#ffffff" : b[0].color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = flash ? "#ffd9dd" : shade(b[0].color, -0.55);
    ctx.stroke();
  }

  // Elites: gold rim + orbiting pips, so they never blend into their tier color.
  let elites = 0;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.elite || e.dead) continue;
    elites++;
    const r = e.r + 6;
    ctx.moveTo(e.x + r, e.y);
    ctx.arc(e.x, e.y, r, 0, TAU);
  }
  if (elites) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffd23f";
    ctx.stroke();
    // Orbiting pips go in their own path: filling the rim path would paint
    // the whole enemy gold.
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.elite || e.dead) continue;
      const r = e.r + 6;
      for (let j = 0; j < 3; j++) {
        const ang = time * 2.2 + (j * TAU) / 3;
        const px = e.x + Math.cos(ang) * r;
        const py = e.y + Math.sin(ang) * r;
        ctx.moveTo(px + 3.4, py);
        ctx.arc(px, py, 3.4, 0, TAU);
      }
    }
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
  }

  // Health bars, only once an enemy has actually been hurt.
  let bars = 0;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.hp >= e.maxHp) continue;
    bars++;
    const w = Math.max(18, e.r * 2.2);
    ctx.rect(e.x - w / 2 - 1, e.y - e.r - 10, w + 2, 6);
  }
  if (bars) {
    ctx.fillStyle = "rgba(6,8,16,0.85)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(200,215,245,0.28)";
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.hp >= e.maxHp || e.elite) continue;
      const w = Math.max(18, e.r * 2.2);
      const f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.rect(e.x - w / 2, e.y - e.r - 9, w * f, 4);
    }
    ctx.fillStyle = "#ff5747";
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.hp >= e.maxHp || !e.elite) continue;
      const w = Math.max(18, e.r * 2.2);
      const f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.rect(e.x - w / 2, e.y - e.r - 9, w * f, 4);
    }
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
  }
}

// Reused across frames so merging the two projectile arrays costs no garbage.
const drawList = [];

function drawProjectiles(G, a) {
  // Enemy fire lives in its own array; drawing only G.projectiles left hazards
  // invisible, which made them impossible to dodge.
  drawList.length = 0;
  for (let i = 0; i < G.projectiles.length; i++) drawList.push(G.projectiles[i]);
  for (let i = 0; i < G.hazards.length; i++) drawList.push(G.hazards[i]);
  const list = drawList;
  if (!list.length) return;
  resetBuckets(pBuckets);
  bucketKeys.length = 0;

  let slashes = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.dead) continue;
    if (p.shape === "slash") {
      slashes++;
      continue;
    }
    const key = (p.shape || "bullet") + "|" + p.color + (p.hostile ? "|h" : "");
    const b = bucketOf(pBuckets, key);
    if (b.length === 0) bucketKeys.push(key);
    b.push(p);
  }

  // Motion streaks first, under the bodies.
  for (let k = 0; k < bucketKeys.length; k++) {
    const b = pBuckets.get(bucketKeys[k]);
    if (!b || !b.length) continue;
    const p0 = b[0];
    if (p0.shape === "orb") continue;
    ctx.beginPath();
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      const x = p.x + p.vx * a;
      const y = p.y + p.vy * a;
      ctx.moveTo(x - p.vx * 0.035, y - p.vy * 0.035);
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = Math.max(1.5, p0.r * 1.1);
    ctx.strokeStyle = rgba(p0.color, 0.28);
    ctx.stroke();
  }

  for (let k = 0; k < bucketKeys.length; k++) {
    const key = bucketKeys[k];
    const b = pBuckets.get(key);
    if (!b || !b.length) continue;
    const shape = b[0].shape || "bullet";
    const color = b[0].color;
    ctx.beginPath();
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      const x = p.x + p.vx * a;
      const y = p.y + p.vy * a;
      const ang = p.rot !== undefined && p.rot !== 0 ? p.rot : Math.atan2(p.vy, p.vx);
      if (shape === "orb") {
        ctx.moveTo(x + p.r, y);
        ctx.arc(x, y, p.r, 0, TAU);
      } else if (shape === "shard") {
        const spin = ang + time * 9;
        const c = Math.cos(spin);
        const s = Math.sin(spin);
        const lr = p.r * 1.7;
        const wr = p.r * 0.62;
        ctx.moveTo(x + c * lr, y + s * lr);
        ctx.lineTo(x - s * wr, y + c * wr);
        ctx.lineTo(x - c * lr * 0.55, y - s * lr * 0.55);
        ctx.lineTo(x + s * wr, y - c * wr);
        ctx.closePath();
      } else {
        // bullet: a tapered dart pointing along its heading
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const lr = p.r * 2.1;
        const wr = p.r * 0.78;
        ctx.moveTo(x + c * lr, y + s * lr);
        ctx.lineTo(x - s * wr - c * lr * 0.6, y + c * wr - s * lr * 0.6);
        ctx.lineTo(x - c * lr * 0.35, y - s * lr * 0.35);
        ctx.lineTo(x + s * wr - c * lr * 0.6, y - c * wr - s * lr * 0.6);
        ctx.closePath();
      }
    }
    ctx.fillStyle = color;
    ctx.fill();
    if (b[0].hostile) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,120,120,0.85)";
      ctx.stroke();
    }

    // Hot core: one extra fill keeps shots reading against bright enemies.
    ctx.beginPath();
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      const x = p.x + p.vx * a;
      const y = p.y + p.vy * a;
      ctx.moveTo(x + p.r * 0.45, y);
      ctx.arc(x, y, p.r * 0.45, 0, TAU);
    }
    ctx.fillStyle = shade(color, 0.72);
    ctx.fill();

    if (shape === "orb") {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < b.length; i++) {
        const p = b[i];
        drawGlow(color, p.x, p.y, p.r * 3.6, 0.5);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // Melee sweeps: an arc wedge that widens and fades over its short life.
  if (slashes) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead || p.shape !== "slash") continue;
      const t = p.maxLife > 0 ? clamp(p.life / p.maxLife, 0, 1) : 1;
      const spread = (p.data && p.data.arc) || 1.15;
      const ang = p.rot !== undefined ? p.rot : Math.atan2(p.vy, p.vx);
      // Sweep leads with the swing: the wedge starts wide and trails away.
      const half = spread * 0.5;
      const lead = ang - half + spread * (1 - t);
      const a0 = lead - half * t;
      const a1 = lead + half * t;
      const rOut = p.r;
      const rIn = p.r * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rOut, a0, a1, false);
      ctx.arc(p.x, p.y, rIn, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = rgba(p.color, 0.28 + t * 0.4);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(shade(p.color, 0.5), 0.35 + t * 0.55);
      ctx.stroke();
      // Bright leading edge sells the direction of the swing.
      ctx.beginPath();
      ctx.lineCap = "butt";
      ctx.arc(p.x, p.y, (rOut + rIn) * 0.5, a1 - 0.2 * t, a1, false);
      ctx.lineWidth = (rOut - rIn) * 0.9;
      ctx.strokeStyle = rgba("#ffffff", 0.5 * t);
      ctx.stroke();
      ctx.lineCap = "round";
    }
    ctx.lineWidth = 2;
  }
}

// Enemies are drawn over the player (contract draw order), so a thin beacon
// ring in the effects pass keeps the player findable inside a swarm.
function drawPlayerMarker(G) {
  const p = G.player;
  if (!p || p.dead) return;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 7 + Math.sin(time * 4) * 1.5, 0, TAU);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(190,230,255,0.4)";
  ctx.stroke();
}

function drawEffects(G) {
  drawPlayerMarker(G);
  const s = fxStore(G);
  const { px, py, plife, pmax, psize, pcol, pal, groups } = s;

  for (let i = 0; i < groups.length; i++) groups[i].length = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (plife[i] <= 0) continue;
    const g = groups[pcol[i]];
    if (g) g.push(i);
  }
  ctx.globalCompositeOperation = "lighter";
  for (let c = 0; c < groups.length; c++) {
    const g = groups[c];
    if (!g.length) continue;
    ctx.fillStyle = pal[c];
    ctx.beginPath();
    for (let j = 0; j < g.length; j++) {
      const i = g[j];
      const f = plife[i] / pmax[i];
      const sz = psize[i] * (0.3 + f * 0.7);
      ctx.rect(px[i] - sz, py[i] - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 0.9;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const list = G.effects;
  let hurt = 0;
  ctx.lineCap = "round";
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const t = clamp(f.life / f.maxLife, 0, 1);
    if (f.kind === "ring") {
      const r = f.r + (f.r1 - f.r) * (1 - t) * (2 - (1 - t));
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(1, r), 0, TAU);
      ctx.lineWidth = f.width * t + 0.5;
      ctx.strokeStyle = rgba(f.color, t * 0.85);
      ctx.stroke();
    } else if (f.kind === "muzzle") {
      const k = t * f.r;
      const c = Math.cos(f.a);
      const s2 = Math.sin(f.a);
      ctx.beginPath();
      ctx.moveTo(f.x + c * k * 1.5, f.y + s2 * k * 1.5);
      ctx.lineTo(f.x - s2 * k * 0.5, f.y + c * k * 0.5);
      ctx.lineTo(f.x + s2 * k * 0.5, f.y - c * k * 0.5);
      ctx.closePath();
      ctx.fillStyle = rgba(f.color, 0.85 * t + 0.15);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      drawGlow(f.color, f.x, f.y, f.r * 1.6, t * 0.7);
      ctx.globalCompositeOperation = "source-over";
    } else if (f.kind === "telegraph") {
      const grow = 1 - t;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.lineWidth = f.width;
      ctx.strokeStyle = rgba(f.color, 0.25 + 0.35 * Math.abs(Math.sin(time * 12)));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(1, f.r * grow), 0, TAU);
      ctx.fillStyle = rgba(f.color, 0.16);
      ctx.fill();
    } else if (f.kind === "hurt") {
      hurt = Math.max(hurt, t);
    }
  }

  // Damage numbers last and in two passes so ctx.font is set twice, not N times.
  drawNumbers(list, false);
  drawNumbers(list, true);

  if (hurt > 0) {
    ctx.globalAlpha = hurt;
    ctx.fillStyle = hurtGrad;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.globalAlpha = 1;
  }
}

function drawNumbers(list, crit) {
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.kind !== "num" || f.crit !== crit) continue;
    if (!any) {
      any = true;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = crit ? 5 : 3.5;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
    }
    const t = clamp(f.life / f.maxLife, 0, 1);
    // Crits punch in before they fade; normal hits just drift and dim.
    const pop = crit ? 1 + (1 - t) * (1 - t) * 0.9 - (1 - t) * 0.35 : 1;
    const size = Math.max(8, f.size * (crit ? clamp(pop, 0.6, 1.6) : 0.75 + t * 0.25));
    ctx.font = (crit ? "800 " : "700 ") + size.toFixed(1) + "px 'Chakra Petch', 'Segoe UI', sans-serif";
    ctx.globalAlpha = t > 0.35 ? 1 : t / 0.35;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  if (any) ctx.globalAlpha = 1;
}

/* ----------------------------------------------------------------- main draw */

function shakeAmount(G) {
  const list = G.effects;
  let m = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.kind === "shake") {
      const t = clamp(f.life / f.maxLife, 0, 1);
      const v = f.mag * t * t;
      if (v > m) m = v;
    }
  }
  return m > 14 ? 14 : m;
}

/** Draw one frame. `alpha` is the leftover fraction of a fixed step. */
export function render(G, alpha) {
  if (!ctx) return;
  const now = performance.now() / 1000;
  time += Math.min(0.05, now - lastNow);
  lastNow = now;

  const a = Number.isFinite(alpha) ? clamp(alpha, 0, 1) * SUBSTEP : 0;
  const m = shakeAmount(G);
  // Sinusoidal shake instead of random: no per-frame RNG, and it reads smoother.
  const ox = m ? Math.sin(time * 97) * m : 0;
  const oy = m ? Math.cos(time * 71) * m * 0.8 : 0;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (m) {
    ctx.fillStyle = "#05060b";
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  }

  ctx.drawImage(floorImg, 0, 0, ARENA.w, ARENA.h);

  drawPickups(G, a);
  drawPlayer(G, a);
  drawEnemies(G, a);
  drawProjectiles(G, a);
  drawEffects(G);

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
}
