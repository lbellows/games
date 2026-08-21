import { TILE, T, PLANTS, ENEMIES, SEED_ORDER } from "./content.js";
import { idx } from "./engine.js";

const SPRITE_KEYS = [
  "player",
  "slug",
  "aphid",
  "moth",
  "topiary",
  "heartroot",
  "seedling",
  "sunroot",
  "thornvine",
  "glowcap",
  "coinleaf",
  "nightshade",
  "chest",
  "stairs",
  "well",
  "can",
];
const TILE_KEYS = ["soil", "moss", "stone", "water", "hedge"];

export async function loadAssets() {
  const sprites = {};
  const tiles = {};
  const loadImg = (src) =>
    new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(src));
      im.src = src;
    });
  await Promise.all([
    ...SPRITE_KEYS.map(async (k) => {
      sprites[k] = await loadImg(`assets/sprites/${k}.png`);
    }),
    ...TILE_KEYS.map(async (k) => {
      tiles[k] = await loadImg(`assets/tiles/${k}.jpg`);
    }),
    (async () => {
      tiles.title = await loadImg("assets/ui/title.jpg");
    })(),
  ]);
  return { sprites, tiles };
}

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.camX = 0;
    this.camY = 0;
    this.time = 0;
    this.dpr = 1;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
  }

  worldToScreen(game, wx, wy) {
    const { ctx } = this;
    const scale = this.dpr;
    const vw = ctx.canvas.width / scale;
    const vh = ctx.canvas.height / scale;
    const sx = (wx + 0.5) * TILE - this.camX + vw / 2;
    const sy = (wy + 0.5) * TILE - this.camY + vh / 2;
    return { sx, sy, vw, vh };
  }

  screenToTile(game, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const vw = rect.width;
    const vh = rect.height;
    const wx = (x - vw / 2 + this.camX) / TILE;
    const wy = (y - vh / 2 + this.camY) / TILE;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  draw(game, dt) {
    this.time += dt;
    const { ctx, assets } = this;
    const scale = this.dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const vw = ctx.canvas.width / scale;
    const vh = ctx.canvas.height / scale;

    const tx = (game.player.x + 0.5) * TILE;
    const ty = (game.player.y + 0.5) * TILE;
    this.camX += (tx - this.camX) * Math.min(1, dt * 7);
    this.camY += (ty - this.camY) * Math.min(1, dt * 7);

    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt * 40);
    }
    const sh = game.shake;
    const ox = sh ? (Math.random() - 0.5) * sh : 0;
    const oy = sh ? (Math.random() - 0.5) * sh : 0;

    ctx.fillStyle = "#070c09";
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(vw / 2 - this.camX + ox, vh / 2 - this.camY + oy);

    const pad = 2;
    const x0 = Math.max(0, Math.floor((this.camX - vw / 2) / TILE) - pad);
    const y0 = Math.max(0, Math.floor((this.camY - vh / 2) / TILE) - pad);
    const x1 = Math.min(game.w - 1, Math.ceil((this.camX + vw / 2) / TILE) + pad);
    const y1 = Math.min(game.h - 1, Math.ceil((this.camY + vh / 2) / TILE) + pad);

    ctx.imageSmoothingEnabled = true;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!game.explored[idx(x, y, game.w)]) continue;
        const vis = game.visible.has(x + "," + y);
        this.drawTile(game, x, y, vis);
      }
    }

    for (const it of game.items) {
      if (!game.visible.has(it.x + "," + it.y)) continue;
      this.drawItem(it);
    }
    for (const c of game.chests) {
      if (!game.explored[idx(c.x, c.y, game.w)]) continue;
      ctx.globalAlpha = c.open && !c.shop ? 0.5 : 1;
      this.drawSprite("chest", c.x, c.y, 0.78);
      ctx.globalAlpha = 1;
      if (c.shop) this.badge(c.x, c.y, "stall");
    }
    for (const w of game.wells) {
      if (!game.explored[idx(w.x, w.y, game.w)]) continue;
      this.drawSprite("well", w.x, w.y, 1.05);
    }
    if (game.stairs && game.explored[idx(game.stairs.x, game.stairs.y, game.w)]) {
      this.drawSprite("stairs", game.stairs.x, game.stairs.y, 1.02);
    }

    for (const p of game.plants) {
      if (!game.visible.has(p.x + "," + p.y) && !game.explored[idx(p.x, p.y, game.w)]) continue;
      const vis = game.visible.has(p.x + "," + p.y);
      ctx.globalAlpha = vis ? 1 : 0.4;
      this.drawPlant(p);
      ctx.globalAlpha = 1;
    }

    const ents = [...game.enemies].sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (!game.visible.has(e.x + "," + e.y)) continue;
      this.drawEnemy(e);
    }

    this.drawPlayer(game);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!game.explored[idx(x, y, game.w)]) continue;
        if (game.visible.has(x + "," + y)) continue;
        ctx.fillStyle = "rgba(6, 12, 8, 0.55)";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    if (game.hover && game.explored[idx(game.hover.x, game.hover.y, game.w)]) {
      ctx.strokeStyle = "rgba(226, 182, 87, 0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(game.hover.x * TILE + 2, game.hover.y * TILE + 2, TILE - 4, TILE - 4);
    }

    const [fx, fy] = game.player.facing;
    ctx.strokeStyle = "rgba(180, 220, 150, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect((game.player.x + fx) * TILE + 6, (game.player.y + fy) * TILE + 6, TILE - 12, TILE - 12);

    this.drawFloaters(game, dt);
    this.drawParticles(game, dt);

    ctx.restore();

    if (game.hitFlash > 0) {
      ctx.fillStyle = `rgba(140, 20, 30, ${0.22 * game.hitFlash})`;
      ctx.fillRect(0, 0, vw, vh);
      game.hitFlash = Math.max(0, game.hitFlash - dt * 2.4);
    }

    if (vw >= 720) this.drawMinimap(game, vw, vh);
  }

  drawTile(game, x, y, vis) {
    const { ctx, assets } = this;
    const t = game.tile(x, y);
    let img = assets.tiles.soil;
    if (t === T.WALL) img = assets.tiles.hedge;
    else if (t === T.MOSS) img = assets.tiles.moss;
    else if (t === T.STONE) img = assets.tiles.stone;
    else if (t === T.WATER) img = assets.tiles.water;
    else if (t === T.STAIRS) img = assets.tiles.stone;
    else if (t === T.BLIGHT) img = assets.tiles.soil;
    else img = assets.tiles.soil;

    const ox = (x * 37 + y * 13) % 24;
    const oy = (y * 19 + x * 7) % 24;
    ctx.drawImage(img, ox, oy, 48, 48, x * TILE, y * TILE, TILE, TILE);

    if (t === T.BLIGHT) {
      ctx.fillStyle = vis ? "rgba(90, 40, 110, 0.4)" : "rgba(40, 16, 50, 0.35)";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    if (t === T.WATER) {
      ctx.globalAlpha = 0.18 + Math.sin(this.time * 1.6 + x + y) * 0.05;
      ctx.fillStyle = "#9fe8ff";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.globalAlpha = 1;
    }
    if (t === T.WALL) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x * TILE, y * TILE + TILE * 0.72, TILE, TILE * 0.28);
    }
  }

  drawSprite(key, tx, ty, scale = 1, bob = 0) {
    const img = this.assets.sprites[key];
    if (!img) return;
    const { ctx } = this;
    const h = TILE * scale;
    const w = h * (img.width / img.height);
    const px = tx * TILE + TILE / 2 - w / 2;
    const py = ty * TILE + TILE - h + 4 + bob;
    ctx.drawImage(img, px, py, w, h);
  }

  drawPlayer(game) {
    const bob = Math.sin(this.time * 3.2) * 1.6;
    const { ctx } = this;
    ctx.save();
    if (game.hitFlash > 0.4) ctx.globalAlpha = 0.7 + Math.sin(this.time * 40) * 0.3;
    this.drawSprite("player", game.player.x, game.player.y, 1.05, bob);
    ctx.restore();
  }

  drawEnemy(e) {
    const def = ENEMIES[e.kind];
    const bob = Math.sin(this.time * 2.4 + e.id) * (def.boss ? 2.2 : 1.2);
    const scale = def.boss ? 1.55 : e.kind === "slug" ? 0.92 : e.kind === "topiary" ? 1.12 : 0.88;
    this.drawSprite(def.sprite, e.x, e.y, scale, bob);
    const ratio = Math.max(0, e.hp / e.hpMax);
    if (ratio < 1) {
      const { ctx } = this;
      const bx = e.x * TILE + 8;
      const by = e.y * TILE + 4;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, by, TILE - 16, 4);
      ctx.fillStyle = ratio < 0.35 ? "#c45c4a" : "#7dba6a";
      ctx.fillRect(bx, by, (TILE - 16) * ratio, 4);
    }
  }

  drawPlant(p) {
    const def = PLANTS[p.kind];
    const sway = Math.sin(this.time * 1.8 + p.x * 0.7 + p.y) * 0.08;
    const { ctx } = this;
    ctx.save();
    ctx.translate(p.x * TILE + TILE / 2, p.y * TILE + TILE * 0.85);
    ctx.rotate(sway);
    const key = p.mature ? def.sprite : "seedling";
    const img = this.assets.sprites[key];
    const scale = p.mature ? (def.turret ? 0.95 : 1.0) : 0.45 + 0.15 * Math.min(1, p.age / def.grow);
    const h = TILE * scale;
    const w = h * (img.width / img.height);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    if (p.mature) {
      ctx.strokeStyle = def.color + "99";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, TILE * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawItem(it) {
    const { ctx } = this;
    const cx = it.x * TILE + TILE / 2;
    const cy = it.y * TILE + TILE / 2 + Math.sin(this.time * 3 + it.x) * 2;
    if (it.kind === "seed") {
      const img = this.assets.sprites[PLANTS[it.seed].sprite];
      ctx.drawImage(img, cx - 12, cy - 12, 24, 24);
    } else if (it.kind === "water") {
      this.drawSprite("can", it.x, it.y, 0.55);
    } else {
      ctx.beginPath();
      ctx.fillStyle =
        it.kind === "gold" ? "#e2b657" : it.kind === "beet" ? "#c45c4a" : it.kind === "shears" ? "#cfd8dc" : "#8fbc8f";
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.stroke();
    }
  }

  badge(x, y, text) {
    const { ctx } = this;
    ctx.font = "600 10px Nunito, sans-serif";
    ctx.fillStyle = "#e2b657";
    ctx.textAlign = "center";
    ctx.fillText(text, x * TILE + TILE / 2, y * TILE + 10);
  }

  drawFloaters(game, dt) {
    const { ctx } = this;
    ctx.font = "700 14px Nunito, sans-serif";
    ctx.textAlign = "center";
    for (const f of game.floaters) {
      f.life -= dt * 0.9;
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * TILE + TILE / 2, f.y * TILE - (1 - f.life) * 28);
    }
    ctx.globalAlpha = 1;
    game.floaters = game.floaters.filter((f) => f.life > 0);
  }

  drawParticles(game, dt) {
    const { ctx } = this;
    for (const p of game.particles) {
      p.life -= dt;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += dt * 0.4;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * TILE, p.y * TILE, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    game.particles = game.particles.filter((p) => p.life > 0);
  }

  drawMinimap(game, vw, vh) {
    const { ctx } = this;
    const s = 3;
    const mw = game.w * s;
    const mh = game.h * s;
    const x = vw - mw - 16;
    const y = 16;
    ctx.fillStyle = "rgba(8, 14, 10, 0.72)";
    ctx.fillRect(x - 4, y - 4, mw + 8, mh + 8);
    ctx.strokeStyle = "rgba(226, 182, 87, 0.35)";
    ctx.strokeRect(x - 4, y - 4, mw + 8, mh + 8);
    for (let ty = 0; ty < game.h; ty++) {
      for (let tx = 0; tx < game.w; tx++) {
        if (!game.explored[idx(tx, ty, game.w)]) continue;
        const t = game.tile(tx, ty);
        let col = "#3d6b4f";
        if (t === T.WALL) col = "#1a2a1c";
        else if (t === T.SOIL) col = "#6b4a2b";
        else if (t === T.STONE) col = "#6d7370";
        else if (t === T.WATER) col = "#2d5c68";
        else if (t === T.STAIRS) col = "#e2b657";
        else if (t === T.BLIGHT) col = "#5a3068";
        ctx.fillStyle = col;
        ctx.fillRect(x + tx * s, y + ty * s, s, s);
      }
    }
    ctx.fillStyle = "#f4e8c1";
    ctx.fillRect(x + game.player.x * s, y + game.player.y * s, s, s);
    for (const e of game.enemies) {
      if (!game.visible.has(e.x + "," + e.y)) continue;
      ctx.fillStyle = "#c45c4a";
      ctx.fillRect(x + e.x * s, y + e.y * s, s, s);
    }
  }
}

export function syncHud(game) {
  const hp = document.getElementById("hp-fill");
  const hg = document.getElementById("hunger-fill");
  const hpT = document.getElementById("hp-text");
  const hgT = document.getElementById("hunger-text");
  const gold = document.getElementById("stat-gold");
  const water = document.getElementById("stat-water");
  const compost = document.getElementById("stat-compost");
  const floor = document.getElementById("floor-tag");
  const turn = document.getElementById("turn-tag");
  const log = document.getElementById("log");
  const seeds = document.getElementById("seeds");
  const look = document.getElementById("look");
  if (!hp) return;

  const p = game.player;
  hp.style.width = `${(100 * p.hp) / p.hpMax}%`;
  hg.style.width = `${(100 * p.hunger) / p.hungerMax}%`;
  hpT.textContent = `${p.hp}/${p.hpMax}`;
  hgT.textContent = `${p.hunger}`;
  gold.textContent = p.gold;
  water.textContent = `${p.water}/${p.waterMax}`;
  compost.textContent = p.compost;
  const spec = game.spec();
  floor.textContent = `${spec.name}  ·  depth ${game.depth}`;
  turn.textContent = `turn ${game.turn}`;

  seeds.innerHTML = SEED_ORDER.map((id) => {
    const d = PLANTS[id];
    const n = p.seeds[id] || 0;
    const on = p.selected === id;
    return `<button class="seed ${on ? "on" : ""} ${n ? "" : "empty"}" data-seed="${id}" title="${d.name}: ${d.desc}">
      <img src="assets/sprites/${d.sprite}.png" alt="" />
      <kbd>${d.key}</kbd>
      <span class="nm">${d.name}</span>
      <span class="n">${n}</span>
    </button>`;
  }).join("");

  const lines = game.logLines.slice(-6);
  log.innerHTML = lines
    .map((l) => `<div class="lg ${l.kind}">${escapeHtml(l.msg)}</div>`)
    .join("");
  log.scrollTop = log.scrollHeight;

  if (game.hover) {
    const ex = game.examine(game.hover.x, game.hover.y);
    look.innerHTML = ex ? `<strong>${escapeHtml(ex.title)}</strong> ${escapeHtml(ex.body)}` : "";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
