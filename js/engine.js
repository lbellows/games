import { T, walkable, FLOORS, ENEMIES } from "./content.js";

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
}

export function idx(x, y, w) {
  return y * w + x;
}

export function inBounds(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function overlap(a, b, pad) {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

function center(r) {
  return [r.x + (r.w >> 1), r.y + (r.h >> 1)];
}

function carveRoom(tiles, w, room, floorTile) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[idx(x, y, w)] = floorTile;
    }
  }
}

function carveHall(tiles, w, x0, y0, x1, y1, floorTile, rng) {
  let x = x0;
  let y = y0;
  const horizFirst = rng.chance(0.5);
  const plot = (cx, cy) => {
    tiles[idx(cx, cy, w)] = floorTile;
    if (inBounds(cx + 1, cy, w, 9999)) {
      if (tiles[idx(cx + 1, cy, w)] === T.WALL && rng.chance(0.08)) {
        tiles[idx(cx + 1, cy, w)] = floorTile;
      }
    }
  };
  if (horizFirst) {
    while (x !== x1) {
      x += Math.sign(x1 - x);
      plot(x, y);
    }
    while (y !== y1) {
      y += Math.sign(y1 - y);
      plot(x, y);
    }
  } else {
    while (y !== y1) {
      y += Math.sign(y1 - y);
      plot(x, y);
    }
    while (x !== x1) {
      x += Math.sign(x1 - x);
      plot(x, y);
    }
  }
}

function floorForTheme(theme, rng) {
  if (theme === "glass" || theme === "cellar") return rng.chance(0.65) ? T.STONE : T.SOIL;
  if (theme === "moon") return rng.chance(0.7) ? T.MOSS : T.SOIL;
  if (theme === "thorn") return rng.chance(0.5) ? T.SOIL : T.MOSS;
  return rng.chance(0.55) ? T.MOSS : T.SOIL;
}

function placePool(tiles, w, h, room, rng) {
  const pw = rng.int(2, 3);
  const ph = rng.int(2, 3);
  const px = rng.int(room.x + 1, room.x + room.w - pw - 1);
  const py = rng.int(room.y + 1, room.y + room.h - ph - 1);
  for (let y = py; y < py + ph; y++) {
    for (let x = px; x < px + pw; x++) {
      tiles[idx(x, y, w)] = T.WATER;
    }
  }
}

function floodReachable(tiles, w, h, sx, sy) {
  const seen = new Uint8Array(w * h);
  const q = [sx, sy];
  seen[idx(sx, sy, w)] = 1;
  let qi = 0;
  while (qi < q.length) {
    const x = q[qi++];
    const y = q[qi++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const i = idx(nx, ny, w);
      if (seen[i]) continue;
      if (!walkable(tiles[i])) continue;
      seen[i] = 1;
      q.push(nx, ny);
    }
  }
  return seen;
}

export function generateFloor(depth, rng) {
  const spec = FLOORS[depth];
  const w = 42;
  const h = 30;
  if (spec.boss) return generateBoss(w, h, rng);

  const tiles = new Uint8Array(w * h).fill(T.WALL);
  const rooms = [];
  const roomTarget = rng.int(6, 9);
  const theme = spec.theme;

  for (let n = 0; n < 50 && rooms.length < roomTarget; n++) {
    const tight = theme === "thorn";
    const rw = rng.int(tight ? 5 : 6, tight ? 8 : 11);
    const rh = rng.int(tight ? 4 : 5, tight ? 7 : 9);
    const rx = rng.int(1, w - rw - 2);
    const ry = rng.int(1, h - rh - 2);
    const room = { x: rx, y: ry, w: rw, h: rh };
    if (rooms.some((o) => overlap(room, o, 1))) continue;
    rooms.push(room);
    carveRoom(tiles, w, room, floorForTheme(theme, rng));
  }

  if (rooms.length < 4) {
    return generateFloor(depth, rng);
  }

  const hallFloor = theme === "glass" || theme === "cellar" ? T.STONE : T.SOIL;
  for (let i = 1; i < rooms.length; i++) {
    const [x0, y0] = center(rooms[i - 1]);
    const [x1, y1] = center(rooms[i]);
    carveHall(tiles, w, x0, y0, x1, y1, hallFloor, rng);
  }
  if (rooms.length > 3) {
    const [x0, y0] = center(rooms[0]);
    const [x1, y1] = center(rooms[rooms.length - 1]);
    carveHall(tiles, w, x0, y0, x1, y1, hallFloor, rng);
  }

  for (const room of rooms) {
    const cx = room.x + 1;
    const cy = room.y + 1;
    const cw = Math.max(1, room.w - 2);
    const ch = Math.max(1, room.h - 2);
    if (rng.chance(0.7)) {
      for (let y = cy; y < cy + ch; y++) {
        for (let x = cx; x < cx + cw; x++) {
          if (walkable(tiles[idx(x, y, w)]) && rng.chance(0.55)) {
            tiles[idx(x, y, w)] = T.SOIL;
          }
        }
      }
    }
  }

  const poolCount = theme === "moon" ? rng.int(2, 3) : theme === "kitchen" ? 1 : rng.chance(0.4) ? 1 : 0;
  const poolRooms = rng.shuffle(rooms.slice(1)).slice(0, poolCount);
  for (const room of poolRooms) {
    if (room.w >= 6 && room.h >= 6) placePool(tiles, w, h, room, rng);
  }

  const start = rooms[0];
  const end = rooms[rooms.length - 1];
  let [px, py] = center(start);
  let [sx, sy] = center(end);
  if (!walkable(tiles[idx(px, py, w)])) {
    outer: for (let y = start.y; y < start.y + start.h; y++) {
      for (let x = start.x; x < start.x + start.w; x++) {
        if (walkable(tiles[idx(x, y, w)])) {
          px = x;
          py = y;
          break outer;
        }
      }
    }
  }
  if (!walkable(tiles[idx(sx, sy, w)]) || (sx === px && sy === py)) {
    outer: for (let y = end.y + end.h - 1; y >= end.y; y--) {
      for (let x = end.x + end.w - 1; x >= end.x; x--) {
        if (walkable(tiles[idx(x, y, w)]) && !(x === px && y === py)) {
          sx = x;
          sy = y;
          break outer;
        }
      }
    }
  }

  tiles[idx(sx, sy, w)] = T.STAIRS;

  const reach = floodReachable(tiles, w, h, px, py);
  if (!reach[idx(sx, sy, w)]) {
    carveHall(tiles, w, px, py, sx, sy, T.SOIL, rng);
    tiles[idx(sx, sy, w)] = T.STAIRS;
  }

  const empties = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!walkable(tiles[idx(x, y, w)])) continue;
      if (x === px && y === py) continue;
      if (x === sx && y === sy) continue;
      const dist = Math.abs(x - px) + Math.abs(y - py);
      empties.push({ x, y, dist });
    }
  }
  rng.shuffle(empties);

  const wells = [];
  if (depth >= 2 && rng.chance(0.75)) {
    const spot = empties.find((c) => c.dist > 6);
    if (spot) {
      wells.push({ x: spot.x, y: spot.y, used: false });
      empties.splice(empties.indexOf(spot), 1);
    }
  }

  const chests = [];
  const chestN = rng.int(1, 2);
  for (let i = 0; i < chestN; i++) {
    const spot = empties.find((c) => c.dist > 5);
    if (!spot) break;
    chests.push({ x: spot.x, y: spot.y, open: false, shop: false });
    empties.splice(empties.indexOf(spot), 1);
  }
  if (spec.shop) {
    const spot = empties.find((c) => c.dist > 4);
    if (spot) {
      chests.push({ x: spot.x, y: spot.y, open: false, shop: true });
      empties.splice(empties.indexOf(spot), 1);
    }
  }

  const [cMin, cMax] = spec.count;
  const nEnemies = rng.int(cMin, cMax);
  const enemies = [];
  const far = empties.filter((c) => c.dist > 8);
  for (let i = 0; i < nEnemies && far.length; i++) {
    const spot = far.pop();
    const kind = pickWeighted(spec.enemies, rng);
    const def = ENEMIES[kind];
    const hpScale = 1 + (depth - 1) * 0.08;
    enemies.push({
      id: i + 1,
      kind,
      x: spot.x,
      y: spot.y,
      hp: Math.round(def.hp * hpScale),
      hpMax: Math.round(def.hp * hpScale),
      skip: false,
      stun: 0,
    });
    empties.splice(empties.indexOf(spot), 1);
  }

  const items = [];
  const nItems = rng.int(2, 4);
  const nearFar = empties.filter((c) => c.dist > 3);
  for (let i = 0; i < nItems && nearFar.length; i++) {
    const spot = nearFar.pop();
    items.push(randomItem(depth, rng, spot.x, spot.y));
  }

  return {
    w,
    h,
    tiles,
    rooms,
    player: { x: px, y: py },
    stairs: { x: sx, y: sy },
    wells,
    chests,
    enemies,
    items,
    plants: [],
  };
}

function pickWeighted(pairs, rng) {
  const t = rng.next();
  let acc = 0;
  for (const [k, w] of pairs) {
    acc += w;
    if (t <= acc) return k;
  }
  return pairs[pairs.length - 1][0];
}

function randomItem(depth, rng, x, y) {
  const roll = rng.next();
  if (roll < 0.35) {
    const seeds = ["sunroot", "thornvine", "glowcap", "coinleaf", "nightshade"];
    const unlocked = depth < 3 ? seeds.slice(0, 3) : seeds;
    const kind = rng.pick(unlocked);
    return { x, y, kind: "seed", seed: kind, qty: rng.int(1, 2) };
  }
  if (roll < 0.55) return { x, y, kind: "gold", qty: rng.int(4, 8 + depth) };
  if (roll < 0.72) return { x, y, kind: "beet", qty: 1 };
  if (roll < 0.86) return { x, y, kind: "water", qty: rng.int(1, 2) };
  if (roll < 0.94) return { x, y, kind: "shears", qty: 1 };
  return { x, y, kind: "flask", qty: 1 };
}

function generateBoss(w, h, rng) {
  const tiles = new Uint8Array(w * h).fill(T.WALL);
  const rw = 18;
  const rh = 12;
  const rx = ((w - rw) / 2) | 0;
  const ry = ((h - rh) / 2) | 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
      tiles[idx(x, y, w)] = edge ? T.MOSS : T.SOIL;
    }
  }
  const beds = [
    [rx + 2, ry + 2],
    [rx + rw - 5, ry + 2],
    [rx + 2, ry + rh - 5],
    [rx + rw - 5, ry + rh - 5],
  ];
  for (const [bx, by] of beds) {
    for (let y = by; y < by + 3; y++) {
      for (let x = bx; x < bx + 3; x++) tiles[idx(x, y, w)] = T.SOIL;
    }
  }
  const px = rx + ((rw / 2) | 0);
  const py = ry + rh - 2;
  const bx = rx + ((rw / 2) | 0);
  const by = ry + 3;
  const enemies = [
    {
      id: 1,
      kind: "heartroot",
      x: bx,
      y: by,
      hp: ENEMIES.heartroot.hp,
      hpMax: ENEMIES.heartroot.hp,
      skip: false,
      stun: 0,
      clock: 0,
    },
    {
      id: 2,
      kind: "slug",
      x: bx - 4,
      y: by + 2,
      hp: 10,
      hpMax: 10,
      skip: false,
      stun: 0,
    },
    {
      id: 3,
      kind: "aphid",
      x: bx + 4,
      y: by + 2,
      hp: 4,
      hpMax: 4,
      skip: false,
      stun: 0,
    },
    {
      id: 4,
      kind: "aphid",
      x: bx - 2,
      y: by + 4,
      hp: 4,
      hpMax: 4,
      skip: false,
      stun: 0,
    },
  ];
  return {
    w,
    h,
    tiles,
    rooms: [{ x: rx, y: ry, w: rw, h: rh }],
    player: { x: px, y: py },
    stairs: null,
    wells: [],
    chests: [],
    enemies,
    items: [
      { x: rx + 3, y: py, kind: "seed", seed: "thornvine", qty: 3 },
      { x: rx + rw - 4, y: py, kind: "seed", seed: "sunroot", qty: 2 },
    ],
    plants: [],
    rngHint: rng.next(),
  };
}

export function computeFov(tiles, w, h, ox, oy, radius) {
  const vis = new Set();
  vis.add(ox + "," + oy);
  const steps = Math.max(64, radius * 24);
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let x = ox + 0.5;
    let y = oy + 0.5;
    for (let r = 0; r < radius + 0.5; r += 0.45) {
      x += dx * 0.45;
      y += dy * 0.45;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!inBounds(tx, ty, w, h)) break;
      vis.add(tx + "," + ty);
      if (tiles[idx(tx, ty, w)] === T.WALL) break;
    }
  }
  return vis;
}

export function firstStep(passable, w, h, x0, y0, x1, y1) {
  if (x0 === x1 && y0 === y1) return null;
  const key = (x, y) => y * w + x;
  const prev = new Map();
  const q = [x0, y0];
  const seen = new Uint8Array(w * h);
  seen[key(x0, y0)] = 1;
  let qi = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (qi < q.length) {
    const x = q[qi++];
    const y = q[qi++];
    if (x === x1 && y === y1) break;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      if (dx && dy) {
        if (!passable(x + dx, y) || !passable(x, y + dy)) continue;
      }
      const k = key(nx, ny);
      if (seen[k]) continue;
      const dest = nx === x1 && ny === y1;
      if (!passable(nx, ny) && !dest) continue;
      seen[k] = 1;
      prev.set(k, [x, y]);
      q.push(nx, ny);
    }
  }
  const endK = key(x1, y1);
  if (!prev.has(endK)) return null;
  let cx = x1;
  let cy = y1;
  while (prev.has(key(cx, cy))) {
    const [px, py] = prev.get(key(cx, cy));
    if (px === x0 && py === y0) return [cx - x0, cy - y0];
    cx = px;
    cy = py;
  }
  return null;
}

export function stepToward(passable, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  const opts = [];
  if (dx && dy) {
    opts.push([dx, dy], [dx, 0], [0, dy]);
  } else if (dx) {
    opts.push([dx, 0], [dx, 1], [dx, -1]);
  } else {
    opts.push([0, dy], [1, dy], [-1, dy]);
  }
  for (const [ox, oy] of opts) {
    if (passable(x0 + ox, y0 + oy)) return [ox, oy];
  }
  return null;
}
