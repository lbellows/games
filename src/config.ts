/**
 * Central tuning file. Every balance number, colour and layout constant lives here so the
 * game can be re-tuned without hunting through gameplay code.
 */

/** Fixed logical resolution. The canvas is letterboxed/scaled to the window. */
export const VIEW = { w: 1280, h: 720 } as const;

/** Height of the HUD strip drawn over the top of the garden. */
export const HUD_HEIGHT = 84;

/** The fenced playfield the player is confined to. */
export const FIELD = {
  x: 30,
  y: HUD_HEIGHT + 14,
  w: VIEW.w - 60,
  h: VIEW.h - (HUD_HEIGHT + 14) - 26,
} as const;

export const FIELD_RIGHT = FIELD.x + FIELD.w;
export const FIELD_BOTTOM = FIELD.y + FIELD.h;

/** How far outside the fence enemies materialise. */
export const SPAWN_MARGIN = 16;

export const COLORS = {
  grass: '#4d8f3f',
  grassDark: '#3d7433',
  grassEdge: '#2f5b28',
  soil: '#6d4b2e',
  soilDark: '#563a22',
  path: '#c2a878',
  pathDark: '#a98f60',
  fence: '#b3814f',
  fenceDark: '#7d5732',

  playerBody: '#f4f6f2',
  playerOveralls: '#3d6fb5',
  playerHat: '#ffd15c',
  playerSkin: '#f0c092',

  spray: '#bff4ff',
  sprayDeep: '#59c7e8',

  aphid: '#ff7a45',
  aphidDark: '#a83a13',
  beetle: '#7b5cd6',
  beetleDark: '#2b2145',
  moth: '#efe4ff',
  mothDark: '#8f7fb8',

  seedScore: '#ffd93d',
  seedHeal: '#4ee5b1',
  seedPower: '#ff6ec7',

  ink: '#0d1a10',
  panel: 'rgba(10, 22, 13, 0.78)',
  panelEdge: 'rgba(190, 236, 180, 0.22)',
  text: '#eafbe7',
  textDim: '#9dbb99',
  danger: '#ff5f5f',
  health: '#5ddd6a',
  energy: '#59c7e8',
} as const;

export const PLAYER = {
  radius: 13,
  speed: 208,
  accel: 1900,
  friction: 1500,
  maxHealth: 100,
  invulnTime: 1.0,
  maxEnergy: 100,
  /** Energy drained per second while spraying. */
  energyDrain: 30,
  /** Energy recovered per second once the recharge delay has elapsed. */
  energyRegen: 33,
  /** Seconds after releasing spray before energy starts coming back. */
  energyDelay: 0.35,
  /** After running dry, spraying is locked out until energy reaches this value. */
  energyUnlock: 24,
} as const;

export const SPRAY = {
  range: 156,
  halfAngle: 0.42,
  /** Damage per second at point blank; falls off with distance. */
  dps: 72,
  falloff: 0.45,
  knockback: 560,
  /** Particles emitted per second. */
  particleRate: 150,
} as const;

export const POWERUP = {
  duration: 10,
  sprayDamageMul: 1.85,
  sprayRangeMul: 1.28,
  energyDrainMul: 0.5,
  speedMul: 1.22,
} as const;

export type EnemyKind = 'aphid' | 'beetle' | 'moth';

export interface EnemySpec {
  kind: EnemyKind;
  health: number;
  speed: number;
  radius: number;
  /** Contact damage per hit. */
  damage: number;
  score: number;
  /** 0 = shoved easily, 1 = immovable. */
  knockResist: number;
  /** Spawn "cost" used by the wave budget. */
  cost: number;
  seedDropChance: number;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  aphid: {
    kind: 'aphid',
    health: 15,
    speed: 108,
    radius: 9,
    damage: 7,
    score: 10,
    knockResist: 0,
    cost: 1,
    seedDropChance: 0.02,
  },
  beetle: {
    kind: 'beetle',
    health: 68,
    speed: 52,
    radius: 16,
    damage: 19,
    score: 35,
    knockResist: 0.72,
    cost: 3.5,
    seedDropChance: 0.16,
  },
  moth: {
    kind: 'moth',
    health: 26,
    speed: 86,
    radius: 12,
    damage: 12,
    score: 20,
    knockResist: 0.25,
    cost: 2,
    seedDropChance: 0.06,
  },
};

export const MOTH = {
  weaveAmplitude: 1.15,
  weaveSpeed: 3.4,
  dashCooldownMin: 2.1,
  dashCooldownMax: 3.4,
  dashTime: 0.32,
  dashSpeedMul: 3.6,
  dashWindup: 0.28,
} as const;

export const WAVES = {
  /** Waves 1..WIN_WAVE are the "campaign"; clearing WIN_WAVE triggers the win banner. */
  winWave: 10,
  countdown: 3.2,
  firstCountdown: 1.8,
  /** Spawn budget for wave n. */
  budget: (n: number) => 7 + (n - 1) * 4.6 + Math.max(0, n - 8) * 2.2,
  /** Max simultaneous live enemies. */
  maxAlive: (n: number) => Math.min(38, 8 + Math.floor(n * 1.7)),
  spawnInterval: (n: number) => Math.max(0.22, 0.95 - n * 0.055),
  healthMul: (n: number) => 1 + (n - 1) * 0.135,
  speedMul: (n: number) => Math.min(1.55, 1 + (n - 1) * 0.031),
  damageMul: (n: number) => Math.min(2.2, 1 + (n - 1) * 0.05),
  /** Score bonus for clearing a wave. */
  clearBonus: (n: number) => 60 + n * 25,
} as const;

export const PICKUPS = {
  interval: 7.5,
  intervalJitter: 3,
  maxOnField: 4,
  life: 15,
  radius: 12,
  scoreValue: 220,
  healValue: 28,
} as const;

export const SCORE = {
  /** Points per second survived while a wave is active. */
  survival: 4,
} as const;
