// Bootstrap: build the game, wire UI actions, run a fixed-timestep loop.

import { createGame, update, startRun, nextWave, pickUpgrade, restart } from "./game.js";
import { initRender, render } from "./render.js";
import { initUI, syncUI } from "./ui.js";
import { rerollShop, buyOffer, sellWeapon } from "./shop.js";
import { initAudio, bindAudio, tickAudio, audioState } from "./audio.js";

const STEP = 1 / 60;
const MAX_FRAME = 0.25; // never simulate more than this after a tab stall

const canvas = document.getElementById("view");
const G = createGame();
const audio = initAudio();
bindAudio(G);

initRender(canvas);
initUI(G, {
  start: () => {
    audio.unlock();
    startRun(G);
  },
  reroll: () => {
    const r = rerollShop(G);
    audio.play(r && r.ok ? "reroll" : "deny");
    return r;
  },
  buy: (i) => {
    const r = buyOffer(G, i);
    audio.play(r && r.ok ? "buy" : "deny");
    return r;
  },
  sell: (i) => {
    const r = sellWeapon(G, i);
    audio.play(r && r.ok ? "sell" : "deny");
    return r;
  },
  next: () => nextWave(G),
  pickUpgrade: (i) => pickUpgrade(G, i),
  restart: () => {
    restart(G);
    bindAudio(G);
    audio.unlock();
    startRun(G);
  },
  pause: () => {
    if (G.phase === "wave") G.paused = !G.paused;
  },
});

let last = performance.now() / 1000;
let acc = 0;

function frame(now) {
  const t = now / 1000;
  acc += Math.min(MAX_FRAME, t - last);
  last = t;

  while (acc >= STEP) {
    update(G, STEP);
    G.input.endFrame();
    acc -= STEP;
  }

  render(G, acc / STEP);
  tickAudio(G);
  syncUI(G);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Handy for tuning from the console; harmless in a browser game.
window.G = G;
window.audioState = audioState;
