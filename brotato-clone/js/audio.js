// Generated SFX + a light looping battle theme, all Web Audio. No files, no
// autoplay: the context stays silent until a click or key unlocks it.

const TAU = Math.PI * 2;
const MUTE_KEY = "spudlord-muted";
const BPM = 118;
const STEP = 60 / BPM / 4; // 16th note
const LOOP = 64;           // 4 bars

const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let musicFilter = null;
let baked = null;
let muted = false;
let unlocked = false;
let voices = 0;
const lastPlay = new Map();
let step = 0;
let nextT = 0;
let noiseBuf = null;

if (typeof window !== "undefined") {
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

/* -------------------------------------------------------------- utilities */

function freqOf(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function canPlay(name, wait) {
  if (!ctx || muted || !unlocked) return false;
  const t = performance.now();
  if (t - (lastPlay.get(name) || 0) < wait) return false;
  lastPlay.set(name, t);
  return voices < 20;
}

function envAt(t, a, d) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  const x = 1 - (t - a) / d;
  return x > 0 ? x * x : 0;
}

function fillNoise(n) {
  const d = new Float32Array(n);
  let s = 20260330;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return d;
}

function makeBuf(seconds, fn) {
  const rate = ctx.sampleRate;
  const n = Math.max(1, Math.ceil(seconds * rate));
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  fn(d, rate, n);
  for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i]);
  return buf;
}

function playBuf(name, buf, gain, wait, detune) {
  if (!buf || !canPlay(name, wait || 40)) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = detune === false ? 1 : 0.94 + Math.random() * 0.12;
  const g = ctx.createGain();
  g.gain.value = (gain || 0.6) * (0.86 + Math.random() * 0.28);
  src.connect(g);
  g.connect(sfxGain);
  voices++;
  src.onended = () => { voices--; };
  src.start();
}

/* ----------------------------------------------------------- sfx recipes */

function bakeSfx() {
  const n1 = fillNoise(Math.ceil(ctx.sampleRate * 0.4));

  function noiseAt(d, rate, i, amp) {
    d[i] += n1[i % n1.length] * amp;
  }

  const shoot = makeBuf(0.08, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.004, 0.07);
      const f = 780 * Math.pow(2, -t * 14);
      d[i] += (Math.sin(TAU * f * t) > 0 ? 0.22 : -0.22) * e;
      noiseAt(d, rate, i, 0.12 * envAt(t, 0.001, 0.03));
    }
  });

  const swing = makeBuf(0.16, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.01, 0.14);
      noiseAt(d, rate, i, 0.45 * e);
      d[i] += Math.sin(TAU * (220 - t * 700) * t) * 0.18 * e;
    }
  });

  const hit = makeBuf(0.09, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.002, 0.08);
      noiseAt(d, rate, i, 0.4 * e);
      d[i] += Math.sin(TAU * (240 * Math.pow(2, -t * 18)) * t) * 0.35 * e;
    }
  });

  const crit = makeBuf(0.14, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.003, 0.12);
      noiseAt(d, rate, i, 0.28 * e);
      d[i] += Math.sin(TAU * (180 * Math.pow(2, -t * 10)) * t) * 0.3 * e;
      d[i] += Math.sin(TAU * 1320 * t) * 0.2 * envAt(t, 0.002, 0.07);
    }
  });

  const boom = makeBuf(0.32, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.008, 0.3);
      noiseAt(d, rate, i, 0.55 * e);
      d[i] += Math.sin(TAU * (90 * Math.pow(2, -t * 6)) * t) * 0.55 * e;
    }
  });

  const kill = makeBuf(0.18, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.004, 0.16);
      noiseAt(d, rate, i, 0.22 * e);
      const f = 420 * Math.pow(2, -t * 9);
      d[i] += (Math.sin(TAU * f * t) > 0 ? 0.28 : -0.28) * e;
    }
  });

  const hurt = makeBuf(0.22, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.005, 0.2);
      noiseAt(d, rate, i, 0.35 * e);
      d[i] += Math.sin(TAU * (140 * Math.pow(2, -t * 8)) * t) * 0.5 * e;
    }
  });

  const dodge = makeBuf(0.1, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.004, 0.08);
      d[i] += Math.sin(TAU * (1480 + t * 900) * t) * 0.28 * e;
    }
  });

  function chime(notes, dur, decay) {
    return makeBuf(dur, (d, rate, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        for (let k = 0; k < notes.length; k++) {
          const tt = t - k * 0.055;
          if (tt < 0) continue;
          d[i] += Math.sin(TAU * freqOf(notes[k]) * tt) * 0.28 * envAt(tt, 0.004, decay);
        }
      }
    });
  }

  const coin = chime([76, 81], 0.2, 0.16);
  const xp = chime([79, 84, 88], 0.24, 0.18);
  const heal = chime([72, 76, 79], 0.28, 0.22);
  const buy = chime([69, 76, 81], 0.26, 0.2);
  const sell = chime([81, 74, 69], 0.24, 0.18);
  const level = chime([72, 76, 79, 84], 0.45, 0.28);
  const wave = chime([64, 71, 76], 0.4, 0.32);
  const win = chime([72, 76, 79, 84, 88], 0.7, 0.4);

  const deny = makeBuf(0.16, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.004, 0.14);
      d[i] += (Math.sin(TAU * 110 * t) > 0 ? 0.28 : -0.28) * e;
      d[i] += Math.sin(TAU * 164 * t) * 0.12 * e;
    }
  });

  const reroll = makeBuf(0.18, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      noiseAt(d, rate, i, 0.28 * envAt(t, 0.002, 0.1));
      d[i] += Math.sin(TAU * (540 + t * 800) * t) * 0.22 * envAt(t, 0.01, 0.14);
    }
  });

  const warn = makeBuf(0.16, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const e = envAt(t, 0.004, 0.12) * (0.6 + 0.4 * Math.sin(TAU * 9 * t));
      d[i] += Math.sin(TAU * 620 * t) * 0.22 * e;
    }
  });

  const over = makeBuf(0.7, (d, rate, n) => {
    const notes = [64, 60, 57, 52];
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      for (let k = 0; k < notes.length; k++) {
        const tt = t - k * 0.14;
        if (tt < 0) continue;
        d[i] += Math.sin(TAU * freqOf(notes[k]) * tt) * 0.28 * envAt(tt, 0.01, 0.4);
      }
    }
  });

  const ui = makeBuf(0.04, (d, rate, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      d[i] += Math.sin(TAU * 1900 * t) * 0.2 * envAt(t, 0.001, 0.03);
    }
  });

  baked = {
    shoot, swing, hit, crit, boom, kill, hurt, dodge,
    coin, xp, heal, buy, sell, deny, reroll, level, wave, warn, over, win, ui,
  };
}

/* --------------------------------------------------------------- music */

// A minor → F → C → Em. Light arcade battle loop, 4 bars.
const BASS = [
  45, 45, 45, 0, 45, 40, 45, 40,
  41, 41, 41, 0, 41, 36, 41, 36,
  48, 48, 48, 0, 48, 43, 48, 43,
  40, 40, 40, 0, 40, 35, 40, 43,
];
const LEAD = [
  69, 72, 76, 74, 72, 69, 67, 64,
  65, 69, 72, 74, 76, 74, 72, 69,
  67, 72, 76, 79, 76, 74, 72, 67,
  71, 76, 79, 77, 76, 74, 71, 72,
];
const ARP = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [48, 52, 55, 60],
  [52, 55, 59, 64],
];
const PAD = [45, 41, 48, 40];

function osc(type, midi, t, dur, gain, dest, attack) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freqOf(midi), t);
  const g = ctx.createGain();
  const a = attack || 0.012;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function kick(t, mul) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
  const g = ctx.createGain();
  const v = 0.22 * (mul || 1);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + 0.16);
}

function snare(t) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  src.connect(bp);
  bp.connect(g);
  g.connect(musicGain);
  src.start(t);
  src.stop(t + 0.12);
  osc("triangle", 62, t, 0.08, 0.05, musicGain, 0.004);
}

function hat(t, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(hp);
  hp.connect(g);
  g.connect(musicGain);
  src.start(t);
  src.stop(t + 0.05);
}

function scheduleStep(i, t) {
  const bar = Math.floor(i / 16) % 4;
  const inBar = i % 16;
  const eighth = i >> 1;

  if (inBar === 0 || inBar === 8) kick(t);
  if (inBar === 10) kick(t, 0.45);
  if (inBar === 4 || inBar === 12) snare(t);
  if (inBar % 2 === 0) hat(t, inBar % 4 === 0 ? 0.045 : 0.028);

  const b = BASS[eighth % BASS.length];
  if (b && i % 2 === 0) osc("square", b, t, 0.22, 0.07, musicGain, 0.01);

  const l = LEAD[eighth % LEAD.length];
  if (l && i % 2 === 0) osc("triangle", l, t, 0.28, 0.065, musicGain, 0.016);

  const a = ARP[bar][i % 4];
  osc("triangle", a, t, 0.12, 0.028, musicGain, 0.008);

  if (inBar === 0) osc("triangle", PAD[bar], t, 1.7, 0.03, musicGain, 0.08);
}

function musicDuck(G) {
  if (!musicGain || !musicFilter || !ctx) return;
  const t = now();
  let g = 0;
  let cut = 1800;
  if (!muted && unlocked) {
    if (G.paused) {
      g = 0;
    } else if (G.phase === "wave") {
      g = 0.55;
      cut = 14000;
    } else if (G.phase === "shop" || G.phase === "levelup") {
      g = 0.22;
      cut = 1100;
    } else if (G.phase === "menu") {
      g = 0.28;
      cut = 1600;
    }
  }
  musicGain.gain.setTargetAtTime(g, t, 0.08);
  musicFilter.frequency.setTargetAtTime(cut, t, 0.1);
}

function tickMusic(G) {
  if (!ctx || !unlocked || muted) return;
  if (G.paused || G.phase === "gameover" || G.phase === "win") return;
  const t = now();
  if (nextT === 0) nextT = t + 0.06;
  if (nextT < t - 0.3) nextT = t + 0.04;
  while (nextT < t + 0.14) {
    scheduleStep(step, nextT);
    step = (step + 1) % LOOP;
    nextT += STEP;
  }
}

/* ---------------------------------------------------------------- graph */

function ensureGraph() {
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);

    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 1600;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(musicFilter);
    musicFilter.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    noiseBuf.getChannelData(0).set(fillNoise(ctx.sampleRate));
  }
  if (!baked) bakeSfx();
}

function applyMute() {
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.04);
  syncMuteButtons();
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch { /* private mode */ }
}

function syncMuteButtons() {
  if (typeof document === "undefined") return;
  const nodes = document.querySelectorAll(".mute-btn");
  for (let i = 0; i < nodes.length; i++) {
    const b = nodes[i];
    b.classList.toggle("is-muted", muted);
    b.setAttribute("aria-pressed", muted ? "true" : "false");
    b.title = muted ? "Unmute (M)" : "Mute (M)";
  }
}

const SFX = {
  shoot: ["shoot", 0.55, 48],
  swing: ["swing", 0.5, 90],
  hit: ["hit", 0.42, 42],
  crit: ["crit", 0.55, 50],
  boom: ["boom", 0.7, 120],
  kill: ["kill", 0.5, 70],
  hurt: ["hurt", 0.75, 80],
  dodge: ["dodge", 0.5, 80],
  coin: ["coin", 0.5, 50],
  xp: ["xp", 0.48, 50],
  heal: ["heal", 0.55, 80],
  buy: ["buy", 0.55, 40],
  sell: ["sell", 0.5, 40],
  deny: ["deny", 0.55, 120],
  reroll: ["reroll", 0.5, 40],
  level: ["level", 0.62, 40],
  wave: ["wave", 0.55, 40],
  warn: ["warn", 0.4, 220],
  over: ["over", 0.7, 40],
  win: ["win", 0.7, 40],
  ui: ["ui", 0.35, 40],
};

export function play(name) {
  if (!baked) return;
  const spec = SFX[name];
  if (!spec) return;
  playBuf(name, baked[spec[0]], spec[1], spec[2], name !== "over" && name !== "win" && name !== "level");
}

export function unlock() {
  if (!AC) return;
  try {
    ensureGraph();
    if (ctx && ctx.state === "suspended") ctx.resume();
    unlocked = true;
    applyMute();
  } catch {
    unlocked = false;
  }
}

export function setMuted(on) {
  muted = !!on;
  if (muted) nextT = 0;
  applyMute();
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

export function isMuted() {
  return muted;
}

function sfxFromFx(kind, opts) {
  const o = opts || {};
  switch (kind) {
    case "muzzle":
    case "flash": play("shoot"); break;
    case "swing": play("swing"); break;
    case "hit": play(o.crit ? "crit" : "hit"); break;
    case "explosion":
    case "explode":
    case "burst": play("boom"); break;
    case "pickup":
    case "sparkle":
    case "spark":
      play(o.type === "xp" ? "xp" : o.type === "heal" ? "heal" : "coin");
      break;
    case "heal": play("heal"); break;
    case "playerHit":
    case "hurt": play("hurt"); break;
    case "dodge": play("dodge"); break;
    case "telegraph":
    case "warn": play("warn"); break;
    default: break;
  }
}

/** Hook the live game object. Safe to call again after restart(). */
export function bindAudio(G) {
  const rawFx = G.addFx;
  G.addFx = (kind, x, y, opts) => {
    sfxFromFx(kind, opts);
    return rawFx(kind, x, y, opts);
  };
  G.bus.on("waveStart", () => {
    step = 0;
    nextT = 0;
    play("wave");
  });
  G.bus.on("enemyKilled", () => play("kill"));
  G.bus.on("levelUp", () => play("level"));
  G.bus.on("upgradePicked", () => play("buy"));
  G.bus.on("win", () => play("win"));
  G.bus.on("gameover", () => play("over"));
}

export function tickAudio(G) {
  if (!G) return;
  musicDuck(G);
  tickMusic(G);
}

export function audioState() {
  return {
    muted,
    unlocked,
    ready: !!(ctx && baked),
    ctx: ctx ? ctx.state : "none",
  };
}

export function initAudio() {
  if (typeof window === "undefined" || !AC) {
    return {
      play() {},
      unlock() {},
      toggleMute() { return true; },
      isMuted() { return true; },
      setMuted() {},
    };
  }
  const arm = () => unlock();
  window.addEventListener("pointerdown", arm, { capture: true });
  window.addEventListener("keydown", arm, { capture: true });
  return { play, unlock, toggleMute, isMuted, setMuted };
}
