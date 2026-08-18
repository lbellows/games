import { ENEMIES, WAVES, type EnemyKind } from '../config.ts';
import type { EnemyScaling } from '../entities/enemy.ts';
import { rand } from '../core/math.ts';

export type WavePhase = 'countdown' | 'active';

export interface WaveEvents {
  spawn: (kind: EnemyKind, scaling: EnemyScaling) => void;
  onWaveStart: (wave: number) => void;
  onWaveClear: (wave: number) => void;
  onWin: () => void;
}

/**
 * Builds each wave into a concrete spawn queue so the HUD can show an exact
 * "enemies remaining" count, then drips it onto the field respecting a live cap.
 */
export class WaveManager {
  wave = 0;
  phase: WavePhase = 'countdown';
  countdown: number = WAVES.firstCountdown;
  /** True once wave `WAVES.winWave` has been cleared: the run continues, endlessly. */
  endless = false;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;

  reset(): void {
    this.wave = 0;
    this.phase = 'countdown';
    this.countdown = WAVES.firstCountdown;
    this.endless = false;
    this.queue = [];
    this.spawnTimer = 0;
  }

  get pending(): number {
    return this.queue.length;
  }

  get nextWave(): number {
    return this.wave + 1;
  }

  scaling(wave = this.wave): EnemyScaling {
    return {
      health: WAVES.healthMul(wave),
      speed: WAVES.speedMul(wave),
      damage: WAVES.damageMul(wave),
    };
  }

  update(dt: number, aliveCount: number, events: WaveEvents): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave(events);
      return;
    }

    if (this.queue.length > 0) {
      this.spawnTimer -= dt;
      const cap = WAVES.maxAlive(this.wave);
      if (this.spawnTimer <= 0 && aliveCount < cap) {
        const kind = this.queue.pop() as EnemyKind;
        events.spawn(kind, this.scaling());
        this.spawnTimer = WAVES.spawnInterval(this.wave) * rand(0.75, 1.25);
      }
      return;
    }

    if (aliveCount === 0) this.completeWave(events);
  }

  private startWave(events: WaveEvents): void {
    this.wave += 1;
    this.phase = 'active';
    this.queue = buildWaveQueue(this.wave);
    this.spawnTimer = 0;
    events.onWaveStart(this.wave);
  }

  private completeWave(events: WaveEvents): void {
    this.phase = 'countdown';
    this.countdown = WAVES.countdown;
    events.onWaveClear(this.wave);
    if (this.wave === WAVES.winWave) {
      this.endless = true;
      events.onWin();
    }
  }
}

/** Composes the roster for a wave from a point budget, then shuffles the spawn order. */
export function buildWaveQueue(wave: number): EnemyKind[] {
  let budget = WAVES.budget(wave);
  const queue: EnemyKind[] = [];

  // Guarantee the new enemy types show up on the wave they unlock.
  const forced: EnemyKind[] = [];
  if (wave >= 2) forced.push('moth', 'moth');
  if (wave >= 3) forced.push('beetle');
  if (wave >= 6) forced.push('beetle');
  for (const kind of forced) {
    if (budget < ENEMIES[kind].cost) break;
    queue.push(kind);
    budget -= ENEMIES[kind].cost;
  }

  const weights: Array<[EnemyKind, number]> = [
    ['aphid', Math.max(1.2, 4 - wave * 0.16)],
    ['moth', wave >= 2 ? Math.min(2.8, 0.8 + wave * 0.22) : 0],
    ['beetle', wave >= 3 ? Math.min(2.4, 0.5 + (wave - 2) * 0.26) : 0],
  ];

  let guard = 400;
  while (budget >= ENEMIES.aphid.cost && guard-- > 0) {
    const affordable = weights.filter(([k, w]) => w > 0 && ENEMIES[k].cost <= budget);
    if (affordable.length === 0) break;
    const total = affordable.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    let chosen: EnemyKind = affordable[0]![0];
    for (const [kind, w] of affordable) {
      roll -= w;
      if (roll <= 0) {
        chosen = kind;
        break;
      }
    }
    queue.push(chosen);
    budget -= ENEMIES[chosen].cost;
  }

  // Fisher-Yates, but keep the queue popping from the end, so shuffle everything.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j] as EnemyKind, queue[i] as EnemyKind];
  }
  return queue;
}
