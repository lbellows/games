// Projectiles and hazards: movement, collision, and the derived behaviours the
// weapons need — pierce, homing, blasts, lightning chains, lingering areas, the
// anchored melee slash arc, orbiting blades and turret beacons.
// Player shots test against G.grid; hazards test against the player. This is a
// hot path: at most one grid query per projectile per frame, no other garbage.

import { ARENA, TAU, clamp, confine, dist2 } from "./core.js";

const OFF_MARGIN = 80;   // px past the arena edge before a shot is culled
const RIM_DAMAGE = 0.45; // fraction of blast damage still dealt at the rim

/* ---------------------------------------------------------------- spawning */

function makeProj(s, hostile) {
  const life = s.life === undefined ? 1.4 : s.life;
  return {
    kind: "proj",
    x: s.x || 0,
    y: s.y || 0,
    vx: s.vx || 0,
    vy: s.vy || 0,
    r: s.r === undefined ? 4 : s.r,
    damage: s.damage === undefined ? 1 : s.damage,
    crit: !!s.crit,
    pierce: s.pierce === undefined ? 0 : s.pierce,
    life,
    maxLife: life,
    color: s.color || "#ffd166",
    shape: s.shape || "bullet",
    rot: s.rot === undefined ? Math.atan2(s.vy || 0, s.vx || 0) : s.rot,
    hostile,
    hitSet: new Set(),
    dead: false,
    // Copied so weapons may hand us a shared template without it being mutated.
    data: s.data ? { ...s.data } : {},
  };
}

export function spawnProjectile(G, spec) {
  const p = makeProj(spec, false);
  G.projectiles.push(p);
  return p;
}

export function spawnHazard(G, spec) {
  const p = makeProj(spec, true);
  G.hazards.push(p);
  return p;
}

/* ------------------------------------------------------------------ update */

export function updateProjectiles(G, dt) {
  const ps = G.projectiles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.dead) stepProj(G, p, dt);
  }
  const hs = G.hazards;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (!h.dead) stepProj(G, h, dt);
  }
}

function stepProj(G, p, dt) {
  switch (p.data.behavior) {
    case "slash":
      stepSlash(G, p, dt);
      return;
    case "area":
      stepArea(G, p, dt);
      return;
    case "orbit":
      stepOrbit(G, p, dt);
      return;
    case "beacon":
      // A turret's body: inert, and kept alive only while its weapon refreshes it.
      p.life -= dt;
      p.rot += dt * 1.4;
      if (p.life <= 0) p.dead = true;
      return;
    default:
      stepFlying(G, p, dt);
  }
}

/* ------------------------------------------------------------ flying shots */

function stepFlying(G, p, dt) {
  const d = p.data;
  if (d.boomerang) steerBoomerang(p, dt);
  else if (d.homing) steerHoming(G, p, dt);
  if (d.accel) {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 1) {
      const ns = Math.min(sp + d.accel * dt, d.maxSpeed || 900);
      p.vx = (p.vx / sp) * ns;
      p.vy = (p.vy / sp) * ns;
    }
  }
  if (d.drag) {
    const f = Math.exp(-d.drag * dt);
    p.vx *= f;
    p.vy *= f;
  }

  const px = p.x;
  const py = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rot = d.spin ? p.rot + d.spin * dt : Math.atan2(p.vy, p.vx);
  p.life -= dt;

  if (p.hostile) collideWithPlayer(G, p, px, py);
  else collideWithEnemies(G, p, px, py);
  if (p.dead) return;

  if (p.life <= 0) {
    if (d.explode && d.explodeOnExpire) blast(G, p);
    p.dead = true;
    return;
  }
  if (d.boomerang) return; // a returning blade may legitimately clip the edge
  if (p.x < -OFF_MARGIN || p.x > ARENA.w + OFF_MARGIN) p.dead = true;
  else if (p.y < -OFF_MARGIN || p.y > ARENA.h + OFF_MARGIN) p.dead = true;
}

function steerHoming(G, p, dt) {
  const h = p.data.homing;
  let t = p.data.target;
  if (!t || t.dead) t = p.data.target = nearestEnemy(G, p.x, p.y, h.range || 300, null);
  if (!t) return;
  const cur = Math.atan2(p.vy, p.vx);
  const diff = wrapAngle(Math.atan2(t.y - p.y, t.x - p.x) - cur);
  const na = cur + clamp(diff, -h.turn * dt, h.turn * dt);
  const sp = Math.hypot(p.vx, p.vy);
  p.vx = Math.cos(na) * sp;
  p.vy = Math.sin(na) * sp;
}

// Out on a drag-braked arc, then home back to the thrower, re-arming on the way.
function steerBoomerang(p, dt) {
  const d = p.data;
  const a = d.anchor;
  if (!d.returning) {
    const f = Math.exp(-2.6 * dt);
    p.vx *= f;
    p.vy *= f;
    if (p.vx * p.vx + p.vy * p.vy < 6400 || p.life <= p.maxLife * 0.45) {
      d.returning = true;
      p.hitSet.clear();
    }
    return;
  }
  const ang = Math.atan2(a.y - p.y, a.x - p.x);
  p.vx += Math.cos(ang) * 2400 * dt;
  p.vy += Math.sin(ang) * 2400 * dt;
  const sp = Math.hypot(p.vx, p.vy);
  const cap = d.returnSpeed || 560;
  if (sp > cap) {
    p.vx = (p.vx / sp) * cap;
    p.vy = (p.vy / sp) * cap;
  }
  if (dist2(p.x, p.y, a.x, a.y) < 26 * 26) p.dead = true;
}

/* --------------------------------------------------------------- collision */

// Swept test: query once around the movement segment, then do point-to-segment
// distance so fast shots cannot tunnel through a small enemy in one frame.
function collideWithEnemies(G, p, px, py) {
  if (!G.grid) return;
  const mx = (px + p.x) * 0.5;
  const my = (py + p.y) * 0.5;
  const half = Math.hypot(p.x - px, p.y - py) * 0.5;
  const list = G.grid.query(mx, my, half + p.r + 30);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || p.hitSet.has(e)) continue;
    const rr = p.r + e.r;
    if (segDist2(e.x, e.y, px, py, p.x, p.y) > rr * rr) continue;
    p.hitSet.add(e);
    G.hurtEnemy(e, p.damage, p.crit, p);
    knockback(e, px, py, p.data.knockback);
    G.addFx("hit", e.x, e.y, { color: p.color, crit: p.crit, angle: p.rot });
    if (onImpact(G, p, e.x, e.y) || p.pierce <= 0) {
      p.dead = true;
      return;
    }
    p.pierce--;
  }
}

function collideWithPlayer(G, p, px, py) {
  const pl = G.player;
  if (pl.dead || p.hitSet.has(pl)) return;
  const rr = p.r + pl.r;
  if (segDist2(pl.x, pl.y, px, py, p.x, p.y) > rr * rr) return;
  p.hitSet.add(pl);
  G.hurtPlayer(p.damage);
  G.addFx("hit", pl.x, pl.y, { color: p.color });
  if (p.data.explode) {
    blast(G, p);
    p.dead = true;
    return;
  }
  if (p.data.area) dropArea(G, p, p.x, p.y);
  if (p.pierce <= 0) p.dead = true;
  else p.pierce--;
}

// Returns true when the impact consumes the projectile outright.
function onImpact(G, p, hx, hy) {
  const d = p.data;
  if (d.chain) chain(G, p, hx, hy);
  if (d.area) dropArea(G, p, hx, hy);
  if (d.explode) {
    blast(G, p);
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------- payloads */

function blast(G, p) {
  const ex = p.data.explode;
  const rad = ex.radius;
  const base = Math.max(1, Math.round(p.damage * (ex.mul === undefined ? 0.8 : ex.mul)));
  G.addFx("explosion", p.x, p.y, { r: rad, color: ex.color || p.color });
  if (p.hostile) {
    const pl = G.player;
    if (!pl.dead) {
      const dd = Math.sqrt(dist2(p.x, p.y, pl.x, pl.y)) - pl.r;
      if (dd <= rad) G.hurtPlayer(Math.max(1, Math.round(base * falloff(dd, rad))));
    }
    return;
  }
  if (!G.grid) return;
  const list = G.grid.query(p.x, p.y, rad);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const dd = Math.sqrt(dist2(p.x, p.y, e.x, e.y)) - e.r;
    if (dd > rad) continue;
    G.hurtEnemy(e, Math.max(1, Math.round(base * falloff(dd, rad))), p.crit, p);
    knockback(e, p.x, p.y, ex.knockback === undefined ? 240 : ex.knockback);
  }
}

function falloff(d, rad) {
  return 1 - (1 - RIM_DAMAGE) * clamp(d / rad, 0, 1);
}

// Arc to the nearest untouched enemies, losing a slice of damage per jump.
function chain(G, p, fromX, fromY) {
  if (!G.grid) return;
  const c = p.data.chain;
  const mul = c.mul === undefined ? 0.72 : c.mul;
  let x = fromX;
  let y = fromY;
  let dmg = p.damage;
  for (let n = 0; n < c.count; n++) {
    const next = nearestEnemy(G, x, y, c.range, p.hitSet);
    if (!next) return;
    dmg = Math.max(1, Math.round(dmg * mul));
    p.hitSet.add(next);
    G.hurtEnemy(next, dmg, false, p);
    knockback(next, x, y, p.data.knockback ? p.data.knockback * 0.4 : 0);
    G.addFx("chain", x, y, { x2: next.x, y2: next.y, color: p.color });
    x = next.x;
    y = next.y;
  }
}

function dropArea(G, p, x, y) {
  const a = p.data.area;
  const r = a.r;
  const spec = {
    x: clamp(x, r * 0.4, ARENA.w - r * 0.4),
    y: clamp(y, r * 0.4, ARENA.h - r * 0.4),
    r,
    damage: Math.max(1, Math.round(p.damage * (a.mul === undefined ? 0.5 : a.mul))),
    crit: p.crit,
    life: a.life,
    color: a.color || p.color,
    shape: a.shape || "orb",
    data: { behavior: "area", tick: a.tick || 0.4, tickT: 0, slow: a.slow, knockback: 0 },
  };
  if (p.hostile) spawnHazard(G, spec);
  else spawnProjectile(G, spec);
}

/* ------------------------------------------------------- lingering areas */

function stepArea(G, p, dt) {
  const d = p.data;
  p.life -= dt;
  d.tickT -= dt;
  const ticking = d.tickT <= 0;
  if (ticking) {
    d.tickT = d.tick;
    p.hitSet.clear(); // a pool re-hits whatever is still standing in it
  }
  if (p.hostile) {
    const pl = G.player;
    const rr = p.r + pl.r;
    if (!pl.dead && ticking && dist2(p.x, p.y, pl.x, pl.y) <= rr * rr) G.hurtPlayer(p.damage);
  } else if (G.grid) {
    const list = G.grid.query(p.x, p.y, p.r + 24);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const rr = p.r + e.r;
      if (dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
      if (d.slow) {
        // Damp directly so the chill bites even if enemy AI ignores slowMul.
        e.vx *= d.slow;
        e.vy *= d.slow;
        e.slowMul = d.slow;
        e.slowT = 0.4;
      }
      if (ticking && !p.hitSet.has(e)) {
        p.hitSet.add(e);
        G.hurtEnemy(e, p.damage, p.crit, p);
      }
    }
  }
  if (p.life <= 0) p.dead = true;
}

/* ------------------------------------------------------------- melee slash */

// Anchored to whoever swung it; sweeps `sweep` radians over its short life and
// bites every body inside the blade wedge exactly once per swing.
function stepSlash(G, p, dt) {
  const d = p.data;
  const a = d.anchor;
  p.life -= dt;
  const t = clamp(1 - p.life / p.maxLife, 0, 1);
  const cur = d.start + d.sweep * t;
  const reach = d.reach;
  // The renderer draws the wedge outward from the projectile itself, so the
  // slash rides the swinger rather than sitting out at the blade tip.
  p.x = a.x;
  p.y = a.y;

  if (p.hostile) {
    const pl = G.player;
    const rr = reach + pl.r;
    if (!pl.dead && !p.hitSet.has(pl) && dist2(a.x, a.y, pl.x, pl.y) <= rr * rr) {
      if (Math.abs(wrapAngle(Math.atan2(pl.y - a.y, pl.x - a.x) - cur)) <= d.blade) {
        p.hitSet.add(pl);
        G.hurtPlayer(p.damage);
      }
    }
  } else if (G.grid) {
    const list = G.grid.query(a.x, a.y, reach + 32);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || p.hitSet.has(e)) continue;
      const rr = reach + e.r;
      if (dist2(a.x, a.y, e.x, e.y) > rr * rr) continue;
      if (Math.abs(wrapAngle(Math.atan2(e.y - a.y, e.x - a.x) - cur)) > d.blade) continue;
      p.hitSet.add(e);
      G.hurtEnemy(e, p.damage, p.crit, p);
      knockback(e, a.x, a.y, d.knockback);
      G.addFx("hit", e.x, e.y, { color: p.color, crit: p.crit, angle: cur });
    }
  }
  if (p.life <= 0) p.dead = true;
}

/* ------------------------------------------------------------ orbiting blade */

function stepOrbit(G, p, dt) {
  const d = p.data;
  const a = d.anchor;
  p.life -= dt;
  d.angle += d.speed * dt;
  if (d.angle > TAU) d.angle -= TAU;
  p.x = a.x + Math.cos(d.angle) * d.radius;
  p.y = a.y + Math.sin(d.angle) * d.radius;
  p.rot += dt * 12;
  if (G.grid) {
    const list = G.grid.query(p.x, p.y, p.r + 24);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || p.hitSet.has(e)) continue;
      const rr = p.r + e.r;
      if (dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
      p.hitSet.add(e); // cleared by the weapon each cooldown, which re-arms the blade
      G.hurtEnemy(e, p.damage, p.crit, p);
      knockback(e, a.x, a.y, d.knockback);
      G.addFx("hit", e.x, e.y, { color: p.color, crit: p.crit, angle: d.angle });
    }
  }
  if (p.life <= 0) p.dead = true;
}

/* ------------------------------------------------------------------ helpers */

function knockback(e, fromX, fromY, amount) {
  if (!amount) return;
  const dx = e.x - fromX;
  const dy = e.y - fromY;
  const m = Math.hypot(dx, dy) || 1;
  const kx = dx / m;
  const ky = dy / m;
  e.vx += kx * amount;
  e.vy += ky * amount;
  // Also shove the body: most enemy AI rewrites velocity outright each frame,
  // so velocity alone would make knockback invisible.
  e.x += kx * amount * 0.045;
  e.y += ky * amount * 0.045;
  confine(e);
}

function nearestEnemy(G, x, y, radius, exclude) {
  if (!G.grid) return null;
  const list = G.grid.query(x, y, radius);
  let best = null;
  let bestD = radius * radius;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (exclude && exclude.has(e)) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Squared distance from a point to the segment a->b.
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}
