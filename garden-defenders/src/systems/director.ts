import { ENEMIES, FIELD, FIELD_BOTTOM, FIELD_RIGHT, SPAWN_MARGIN, type EnemyKind } from '../config.ts';
import { clamp, rand, randInt, type Vec } from '../core/math.ts';
import type { EnemyScaling, EnemyVariant } from '../entities/enemy.ts';

export const ARENA = {
  /** Run length in seconds. Surviving to zero wins. */
  duration: 600,
  /** Live-enemy caps: the trickle stops at `softCap`, scripted swarms may exceed it to `hardCap`. */
  softCap: 155,
  hardCap: 300,
  firstSwarm: 50,
  swarmInterval: 48,
  firstElite: 75,
  eliteInterval: 68,
  /** Boss timeline: [time, kind, name]. */
  bosses: [
    [300, 'beetle', 'BROOD MOTHER'],
    [540, 'moth', 'SWARM QUEEN'],
  ] as Array<[number, EnemyKind, string]>,
} as const;

export type EdgeName = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

export interface DirectorEvents {
  spawn: (kind: EnemyKind, scaling: EnemyScaling, variant: EnemyVariant, at: Vec, bossName?: string) => void;
  onSwarm: (edge: EdgeName, kind: EnemyKind, count: number) => void;
  onElite: (kind: EnemyKind) => void;
  onBoss: (name: string) => void;
}

/**
 * Arena spawn director: a 10-minute timeline of a continuous trickle, periodic edge swarms,
 * elites, and two scripted bosses. Everything scales with elapsed time rather than wave number.
 */
export class ArenaDirector {
  time = 0;
  private trickleTimer = 1.2;
  private swarmTimer: number = ARENA.firstSwarm;
  private eliteTimer: number = ARENA.firstElite;
  private bossIndex = 0;
  /** Bosses currently alive, tracked by the game so the HUD can show their bar. */
  bossesSpawned = 0;

  reset(): void {
    this.time = 0;
    this.trickleTimer = 1.2;
    this.swarmTimer = ARENA.firstSwarm;
    this.eliteTimer = ARENA.firstElite;
    this.bossIndex = 0;
    this.bossesSpawned = 0;
  }

  get remaining(): number {
    return Math.max(0, ARENA.duration - this.time);
  }

  get finished(): boolean {
    return this.time >= ARENA.duration;
  }

  /** 0..1 progress through the run, used for difficulty ramps. */
  get progress(): number {
    return clamp(this.time / ARENA.duration, 0, 1);
  }

  scaling(): EnemyScaling {
    const minutes = this.time / 60;
    return {
      health: 1 + minutes * 0.3,
      speed: Math.min(1.5, 1 + minutes * 0.045),
      damage: Math.min(2.4, 1 + minutes * 0.07),
    };
  }

  /** Seconds between trickle spawns: ~0.7s at the start, ~0.16s by minute nine. */
  private trickleInterval(): number {
    const base = Math.max(0.16, 0.72 - this.progress * 0.58);
    // Grace period: the first 45s stay gentle so the run has room to find its first upgrades.
    return this.time < 45 ? base * 1.4 : base;
  }

  private kindWeights(): Array<[EnemyKind, number]> {
    const t = this.time;
    return [
      ['aphid', 3],
      ['moth', t >= 45 ? Math.min(3, 0.8 + (t - 45) / 110) : 0],
      ['beetle', t >= 100 ? Math.min(2.5, 0.6 + (t - 100) / 140) : 0],
    ];
  }

  private rollKind(): EnemyKind {
    const weights = this.kindWeights().filter(([, w]) => w > 0);
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    for (const [kind, w] of weights) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return 'aphid';
  }

  update(dt: number, aliveCount: number, events: DirectorEvents): void {
    if (this.finished) return;
    this.time += dt;

    // --- scripted bosses -------------------------------------------------
    const nextBoss = ARENA.bosses[this.bossIndex];
    if (nextBoss && this.time >= nextBoss[0]) {
      this.bossIndex += 1;
      this.bossesSpawned += 1;
      const [, kind, name] = nextBoss;
      events.spawn(kind, this.scaling(), 'boss', edgePoint(randInt(0, 3), Math.random()), name);
      events.onBoss(name);
    }

    // --- swarm bursts ----------------------------------------------------
    this.swarmTimer -= dt;
    if (this.swarmTimer <= 0 && aliveCount < ARENA.hardCap) {
      this.swarmTimer = ARENA.swarmInterval * rand(0.85, 1.15);
      const side = randInt(0, 3);
      const kind = this.rollKind();
      const count = Math.min(
        ARENA.hardCap - aliveCount,
        Math.round(11 + this.time / 60 * 4.6),
      );
      const scaling = this.scaling();
      for (let i = 0; i < count; i++) {
        // Spread the swarm along one edge so it reads as a wall coming in.
        const along = clamp(0.5 + (i / Math.max(1, count - 1) - 0.5) * 0.8 + rand(-0.03, 0.03), 0.02, 0.98);
        const at = edgePoint(side, along);
        at.x += rand(-14, 14);
        at.y += rand(-14, 14);
        events.spawn(kind, scaling, 'normal', at);
      }
      events.onSwarm(EDGE_NAMES[side] as EdgeName, kind, count);
    }

    // --- elites ----------------------------------------------------------
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) {
      this.eliteTimer = ARENA.eliteInterval * rand(0.85, 1.15);
      const kind = this.time > 200 ? (Math.random() < 0.5 ? 'beetle' : 'moth') : this.rollKind();
      events.spawn(kind, this.scaling(), 'elite', edgePoint(randInt(0, 3), Math.random()));
      events.onElite(kind);
    }

    // --- steady trickle --------------------------------------------------
    this.trickleTimer -= dt;
    if (this.trickleTimer <= 0) {
      this.trickleTimer = this.trickleInterval() * rand(0.8, 1.2);
      if (aliveCount < ARENA.softCap) {
        // Later in the run each tick brings a small clutch rather than a single bug.
        const clutch = 1 + Math.floor(this.progress * 2);
        const scaling = this.scaling();
        for (let i = 0; i < clutch; i++) {
          const at = edgePoint(randInt(0, 3), Math.random());
          events.spawn(this.rollKind(), scaling, 'normal', at);
        }
      }
    }
  }

  /** Expected total spawn "pressure" for the HUD threat meter (0..1). */
  get intensity(): number {
    return clamp(0.15 + this.progress * 0.85, 0, 1);
  }
}

const EDGE_NAMES: EdgeName[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export function edgePoint(side: number, along: number): Vec {
  switch (side) {
    case 0:
      return { x: FIELD.x + along * FIELD.w, y: FIELD.y - SPAWN_MARGIN };
    case 1:
      return { x: FIELD_RIGHT + SPAWN_MARGIN, y: FIELD.y + along * FIELD.h };
    case 2:
      return { x: FIELD.x + along * FIELD.w, y: FIELD_BOTTOM + SPAWN_MARGIN };
    default:
      return { x: FIELD.x - SPAWN_MARGIN, y: FIELD.y + along * FIELD.h };
  }
}

/** Score value used for arena survival ticks, ramps with the timeline. */
export const arenaSurvivalScore = (progress: number): number => 6 + progress * 10;

/** Sanity helper for tests: the cheapest enemy cost, used to bound expectations. */
export const cheapestCost = Math.min(...Object.values(ENEMIES).map((e) => e.cost));
