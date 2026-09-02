import { loadMuted, saveMuted } from './storage.ts';
import { rand } from './math.ts';

type Osc = OscillatorType;

interface ToneOptions {
  type?: Osc;
  from: number;
  to?: number;
  duration: number;
  gain?: number;
  delay?: number;
  attack?: number;
}

/**
 * All sound is synthesized at runtime with the Web Audio API — no audio files.
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy)
 * and every method is a no-op when Web Audio is unavailable (e.g. the headless smoke test).
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sprayNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastHitAt = -1;
  muted: boolean = loadMuted();

  /** Must be called from a user-gesture handler to satisfy autoplay policies. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.75, this.ctx.currentTime, 0.02);
    }
    if (muted) this.stopSpray();
  }

  private get live(): { ctx: AudioContext; master: GainNode } | null {
    if (this.muted || !this.ctx || !this.master) return null;
    return { ctx: this.ctx, master: this.master };
  }

  private tone(o: ToneOptions): void {
    const live = this.live;
    if (!live) return;
    const { ctx, master } = live;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to !== undefined && o.to !== o.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.duration);
    }
    const peak = o.gain ?? 0.12;
    const attack = o.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + o.duration + 0.02);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  private hiss(opts: {
    duration: number;
    gain?: number;
    freqFrom: number;
    freqTo?: number;
    q?: number;
    delay?: number;
  }): void {
    const live = this.live;
    if (!live) return;
    const { ctx, master } = live;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.playbackRate.value = rand(0.9, 1.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = opts.q ?? 1.1;
    filter.frequency.setValueAtTime(opts.freqFrom, t0);
    if (opts.freqTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.freqTo), t0 + opts.duration);
    }
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + opts.duration + 0.03);
  }

  /** Continuous spray hiss, gated on/off so it does not stack up. */
  startSpray(): void {
    const live = this.live;
    if (!live || this.sprayNodes) return;
    const { ctx, master } = live;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2100;
    filter.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.05);
    src.connect(filter).connect(hp).connect(g).connect(master);
    src.start();
    this.sprayNodes = { src, gain: g };
  }

  stopSpray(): void {
    const nodes = this.sprayNodes;
    if (!nodes) return;
    this.sprayNodes = null;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    nodes.gain.gain.cancelScheduledValues(t);
    nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), t);
    nodes.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    try {
      nodes.src.stop(t + 0.12);
    } catch {
      /* already stopped */
    }
  }

  hit(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Spray hits land many times per second: throttle so it stays a texture, not a buzzsaw.
    if (ctx.currentTime - this.lastHitAt < 0.055) return;
    this.lastHitAt = ctx.currentTime;
    this.hiss({ duration: 0.06, gain: 0.05, freqFrom: 3200, freqTo: 1600, q: 2 });
  }

  kill(big: boolean): void {
    this.hiss({ duration: big ? 0.3 : 0.16, gain: big ? 0.14 : 0.09, freqFrom: 1400, freqTo: 180, q: 1.4 });
    this.tone({
      type: 'sawtooth',
      from: big ? 220 : 380,
      to: big ? 60 : 120,
      duration: big ? 0.28 : 0.14,
      gain: big ? 0.11 : 0.06,
    });
  }

  hurt(): void {
    this.tone({ type: 'sawtooth', from: 190, to: 70, duration: 0.3, gain: 0.16 });
    this.hiss({ duration: 0.18, gain: 0.08, freqFrom: 700, freqTo: 200, q: 0.8 });
  }

  pickup(kind: 'score' | 'heal' | 'power'): void {
    const roots = { score: [660, 880, 1180], heal: [520, 780, 1040], power: [740, 990, 1320, 1660] };
    const notes = roots[kind];
    notes.forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, duration: 0.12, gain: 0.09, delay: i * 0.055 });
    });
  }

  waveStart(): void {
    this.tone({ type: 'square', from: 440, duration: 0.12, gain: 0.08 });
    this.tone({ type: 'square', from: 660, duration: 0.16, gain: 0.08, delay: 0.12 });
  }

  waveClear(): void {
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, duration: 0.18, gain: 0.09, delay: i * 0.08 });
    });
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone({ type: 'square', from: f, duration: 0.26, gain: 0.08, delay: i * 0.11 });
    });
  }

  gameOver(): void {
    this.stopSpray();
    [392, 330, 262, 196].forEach((f, i) => {
      this.tone({ type: 'sawtooth', from: f, to: f * 0.94, duration: 0.42, gain: 0.11, delay: i * 0.19 });
    });
  }

  dash(): void {
    this.hiss({ duration: 0.22, gain: 0.06, freqFrom: 500, freqTo: 2600, q: 2.2 });
  }

  ui(): void {
    this.tone({ type: 'square', from: 880, to: 1180, duration: 0.07, gain: 0.06 });
  }

  /* ---- Arena mode ------------------------------------------------------- */

  private lastSeedAt = -1;

  seedShot(): void {
    const ctx = this.ctx;
    if (ctx) {
      if (ctx.currentTime - this.lastSeedAt < 0.05) return;
      this.lastSeedAt = ctx.currentTime;
    }
    this.tone({ type: 'triangle', from: 940, to: 1500, duration: 0.09, gain: 0.05 });
  }

  /** Soft tick when XP motes are absorbed; deliberately quiet, it fires constantly. */
  xp(): void {
    this.tone({ type: 'sine', from: 1320, to: 1760, duration: 0.05, gain: 0.022 });
  }

  levelUp(): void {
    [660, 880, 1100, 1320].forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, duration: 0.16, gain: 0.085, delay: i * 0.06 });
    });
  }

  upgradePicked(): void {
    this.tone({ type: 'square', from: 520, to: 1040, duration: 0.14, gain: 0.07 });
  }

  swarmWarning(): void {
    this.tone({ type: 'sawtooth', from: 300, to: 190, duration: 0.5, gain: 0.09 });
    this.hiss({ duration: 0.6, gain: 0.07, freqFrom: 900, freqTo: 340, q: 0.7 });
  }

  bossWarning(): void {
    [110, 110, 146].forEach((f, i) => {
      this.tone({ type: 'sawtooth', from: f, to: f * 0.92, duration: 0.5, gain: 0.15, delay: i * 0.34 });
    });
    this.hiss({ duration: 1.1, gain: 0.08, freqFrom: 420, freqTo: 120, q: 0.6 });
  }

  revive(): void {
    [392, 523, 659, 880].forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, duration: 0.3, gain: 0.1, delay: i * 0.09 });
    });
  }

  victory(): void {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      this.tone({ type: 'square', from: f, duration: 0.3, gain: 0.085, delay: i * 0.14 });
    });
  }
}
