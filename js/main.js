import { Game, loadScores } from "./game.js";
import { Sfx } from "./audio.js";
import { loadAssets, Renderer, syncHud } from "./render.js";
import { PLANTS, SHOP_GOODS, SEED_ORDER } from "./content.js";

const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");
const canvas = document.getElementById("view");

const sfx = new Sfx();
let assets = null;
let renderer = null;
let game = null;
let screen = "boot";
let last = performance.now();
let helpFrom = "title";

const KEY_DIR = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  W: [0, -1],
  A: [-1, 0],
  S: [0, 1],
  D: [1, 0],
  k: [0, -1],
  j: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  K: [0, -1],
  J: [0, 1],
  H: [-1, 0],
  L: [1, 0],
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
};

function show(name) {
  screen = name;
  overlay.classList.toggle("hidden", name === "play");
  hud.hidden = name !== "play";
  for (const el of overlay.querySelectorAll(".screen")) {
    el.classList.toggle("hidden", el.id !== "screen-" + name);
  }
}

function fillScores() {
  const box = document.getElementById("score-list");
  const rows = loadScores();
  if (!rows.length) {
    box.innerHTML = "<p class='empty'>No pressings yet. Go get composted.</p>";
    return;
  }
  box.innerHTML = rows
    .map(
      (r, i) =>
        `<div class="score-row"><span>${i + 1}.</span><span>${r.score}</span><span>${r.won ? "cleared" : "depth " + r.depth}</span><span>seed ${r.seed}</span></div>`
    )
    .join("");
}

function startRun() {
  sfx.ensure();
  sfx.ui();
  game = new Game(undefined, sfx);
  renderer.camX = (game.player.x + 0.5) * 48;
  renderer.camY = (game.player.y + 0.5) * 48;
  show("play");
  syncHud(game);
  bindSeeds();
}

function endOverlay() {
  const g = game;
  if (!g) return;
  const dead = document.getElementById("end-copy");
  const stats = document.getElementById("end-stats");
  document.getElementById("end-title").textContent = g.won ? "The garden sleeps" : "Composted";
  dead.textContent = g.won
    ? "You split the Heartroot. Rain on glass. For a little while, nothing hungers."
    : "The beds close over you. Next season, a sunflower might remember your hat.";
  stats.innerHTML = `
    <div><b>${g.score()}</b><span>score</span></div>
    <div><b>${g.depth}</b><span>depth</span></div>
    <div><b>${g.kills}</b><span>pests</span></div>
    <div><b>${g.harvested}</b><span>harvests</span></div>
    <div><b>${g.seed}</b><span>seed</span></div>`;
  show("end");
}

function bindSeeds() {
  document.getElementById("seeds").onclick = (ev) => {
    const btn = ev.target.closest("[data-seed]");
    if (!btn || !game) return;
    game.player.selected = btn.dataset.seed;
    sfx.ui();
    syncHud(game);
  };
}

function fillShop() {
  const box = document.getElementById("shop-list");
  box.innerHTML = SHOP_GOODS.map((g) => {
    const can = game.player.gold >= g.price;
    return `<button class="shop-item ${can ? "" : "off"}" data-buy="${g.id}">
      <span>${g.name}</span><span class="price">${g.price}g</span>
    </button>`;
  }).join("");
  document.getElementById("shop-gold").textContent = game.player.gold + " coins";
}

document.getElementById("btn-new").onclick = () => startRun();
document.getElementById("btn-help").onclick = () => {
  helpFrom = "title";
  show("help");
};
document.getElementById("btn-scores").onclick = () => {
  fillScores();
  show("scores");
};
document.getElementById("btn-help-back").onclick = () => show(helpFrom === "play" ? "play" : "title");
document.getElementById("btn-scores-back").onclick = () => show("title");
document.getElementById("btn-again").onclick = () => startRun();
document.getElementById("btn-title").onclick = () => show("title");
document.getElementById("btn-resume").onclick = () => show("play");
document.getElementById("btn-abandon").onclick = () => {
  if (game && !game.over && !game.won) {
    game.over = true;
    game.log("You set the trowel down.", "bad");
    game.saveScore();
  }
  show("title");
};
document.getElementById("btn-mute").onclick = () => {
  const m = sfx.toggle();
  document.getElementById("btn-mute").textContent = m ? "Sound off" : "Sound on";
};
document.getElementById("btn-shop-close").onclick = () => {
  if (game) game.shopOpen = false;
  show("play");
};
document.getElementById("shop-list").onclick = (ev) => {
  const b = ev.target.closest("[data-buy]");
  if (!b || !game) return;
  game.buy(b.dataset.buy);
  fillShop();
  syncHud(game);
};

window.addEventListener("keydown", (ev) => {
  sfx.ensure();
  if (screen === "title" && (ev.key === "Enter" || ev.key === " ")) {
    startRun();
    ev.preventDefault();
    return;
  }
  if (screen === "end" && (ev.key === "Enter" || ev.key === " ")) {
    startRun();
    ev.preventDefault();
    return;
  }
  if (screen === "pause" && ev.key === "Escape") {
    show("play");
    return;
  }
  if (screen !== "play" || !game) return;

  if (game.shopOpen) {
    if (ev.key === "Escape" || ev.key === " ") {
      game.shopOpen = false;
      show("play");
    }
    return;
  }

  if (ev.key === "Escape") {
    show("pause");
    ev.preventDefault();
    return;
  }
  if (ev.key === "?" || ev.key === "F1") {
    helpFrom = "play";
    show("help");
    ev.preventDefault();
    return;
  }
  if (ev.key === "m" || ev.key === "M") {
    const muted = sfx.toggle();
    game.log(muted ? "The glasshouse goes quiet." : "Glass and drip return.", "info");
    document.getElementById("btn-mute").textContent = muted ? "Sound off" : "Sound on";
    syncHud(game);
    return;
  }

  if (game.over || game.won) {
    endOverlay();
    return;
  }

  if (SEED_ORDER.some((id) => PLANTS[id].key === ev.key)) {
    const id = SEED_ORDER.find((k) => PLANTS[k].key === ev.key);
    game.player.selected = id;
    sfx.ui();
    syncHud(game);
    ev.preventDefault();
    return;
  }

  const dir = KEY_DIR[ev.key];
  if (dir) {
    game.tryMove(dir[0], dir[1]);
    afterAct();
    ev.preventDefault();
    return;
  }

  if (ev.key === "." || ev.key === " " || ev.key === "Numpad5") {
    game.tryMove(0, 0);
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === "f" || ev.key === "F" || ev.key === "p" || ev.key === "P") {
    game.plantFacing();
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === "g" || ev.key === "G") {
    game.harvestFacing();
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === "t" || ev.key === "T" || ev.key === "c" || ev.key === "C") {
    game.waterAdj();
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === "r" || ev.key === "R") {
    game.fertilize();
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === "e" || ev.key === "E") {
    game.eatSeed();
    afterAct();
    ev.preventDefault();
    return;
  }
  if (ev.key === ">" || ev.key === "," || ev.key === "Enter") {
    if (game.stairs && game.player.x === game.stairs.x && game.player.y === game.stairs.y) {
      game.descend();
      afterAct();
    }
    ev.preventDefault();
    return;
  }
});

function afterAct() {
  if (!game) return;
  if (game.shopOpen) {
    fillShop();
    show("shop");
    return;
  }
  syncHud(game);
  if (game.over || game.won) {
    setTimeout(endOverlay, game.won ? 700 : 450);
  }
}

canvas.addEventListener("mousemove", (ev) => {
  if (!game || !renderer || screen !== "play") return;
  game.hover = renderer.screenToTile(game, ev.clientX, ev.clientY);
  const look = document.getElementById("look");
  const ex = game.examine(game.hover.x, game.hover.y);
  if (ex) look.innerHTML = `<strong>${ex.title}</strong> ${ex.body}`;
});

canvas.addEventListener("mouseleave", () => {
  if (game) game.hover = null;
});

canvas.addEventListener("click", (ev) => {
  if (!game || !renderer || screen !== "play" || game.blocked()) return;
  sfx.ensure();
  const t = renderer.screenToTile(game, ev.clientX, ev.clientY);
  game.clickTile(t.x, t.y);
  afterAct();
});

window.addEventListener("resize", () => renderer?.resize());

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (renderer && game && (screen === "play" || screen === "pause" || screen === "shop" || screen === "help")) {
    renderer.draw(game, dt);
  }
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    assets = await loadAssets();
    renderer = new Renderer(canvas, assets);
    renderer.resize();
    document.getElementById("btn-mute").textContent = sfx.muted ? "Sound off" : "Sound on";
    show("title");
    requestAnimationFrame(frame);
  } catch (err) {
    document.getElementById("boot-msg").textContent = "The seedlings failed: " + err.message;
  }
}

boot();
