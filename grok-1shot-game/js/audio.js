export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem("bloomrot-mute") === "1";
    this.ambNodes = [];
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.38;
    this.master.connect(this.ctx.destination);
    this.startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem("bloomrot-mute", m ? "1" : "0");
    if (this.master) this.master.gain.value = m ? 0 : 0.38;
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  env(gain, a, d, peak = 0.2) {
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur, type, peak, detune = 0) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(g);
    g.connect(this.master);
    this.env(g, 0.012, dur, peak);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.05);
  }

  noise(dur, peak, hp = 400) {
    if (!this.ctx || this.muted) return;
    const n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    this.env(g, 0.005, dur, peak);
    src.start();
  }

  plant() {
    this.tone(196, 0.09, "sine", 0.12);
    this.tone(294, 0.14, "triangle", 0.07);
  }
  harvest() {
    this.tone(392, 0.08, "sine", 0.1);
    this.tone(523, 0.16, "triangle", 0.08);
  }
  step() {
    this.noise(0.04, 0.04, 700);
  }
  hit() {
    this.tone(140, 0.07, "square", 0.08);
    this.noise(0.06, 0.06, 200);
  }
  hurt() {
    this.tone(110, 0.14, "sawtooth", 0.1);
    this.tone(90, 0.18, "sine", 0.08);
  }
  pickup() {
    this.tone(660, 0.07, "sine", 0.08);
    this.tone(880, 0.12, "triangle", 0.06);
  }
  water() {
    this.tone(523, 0.05, "sine", 0.06);
    this.tone(392, 0.12, "sine", 0.05);
    this.noise(0.08, 0.03, 1200);
  }
  descend() {
    this.tone(330, 0.1, "sine", 0.1);
    this.tone(247, 0.16, "triangle", 0.08);
    this.tone(196, 0.22, "sine", 0.07);
  }
  death() {
    this.tone(196, 0.3, "sine", 0.1);
    this.tone(147, 0.45, "triangle", 0.08);
    this.tone(98, 0.7, "sine", 0.08);
  }
  win() {
    this.tone(392, 0.16, "sine", 0.1);
    setTimeout(() => this.tone(523, 0.18, "sine", 0.1), 140);
    setTimeout(() => this.tone(659, 0.28, "triangle", 0.1), 280);
  }
  ui() {
    this.tone(520, 0.05, "sine", 0.05);
  }
  boom() {
    this.tone(70, 0.22, "sine", 0.14);
    this.noise(0.18, 0.1, 120);
  }

  startAmbience() {
    if (!this.ctx || this.ambNodes.length) return;
    const makeDrone = (freq, type, gainVal, detune) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.value = gainVal;
      o.connect(g);
      g.connect(this.master);
      o.start();
      this.ambNodes.push(o, g);
    };
    makeDrone(55, "sine", 0.03, 0);
    makeDrone(82.5, "sine", 0.018, 6);
    makeDrone(110, "triangle", 0.008, -4);

    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.015;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    this.ambNodes.push(src, f, g);
  }
}
