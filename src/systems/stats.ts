import { PLAYER, SPRAY } from '../config.ts';

/**
 * Mutable per-run stat block. Campaign runs keep every multiplier at 1.0 so the base game is
 * unchanged; Arena upgrades edit this block, and the player/spray/weapon code reads from it.
 */
export interface StatBlock {
  maxHealth: number;
  /** Movement speed multiplier. */
  speed: number;
  /** Passive health regeneration, HP per second. */
  regen: number;
  sprayDamage: number;
  sprayRange: number;
  sprayAngle: number;
  knockback: number;
  energyDrain: number;
  energyRegen: number;
  /** Radius within which XP motes are pulled toward the player. */
  magnetRadius: number;
  xpGain: number;
  /** Multiplier on seed pickup value (score and healing). */
  seedBonus: number;
  /** Free revives remaining (Second Wind). */
  revives: number;
}

export function baseStats(): StatBlock {
  return {
    maxHealth: PLAYER.maxHealth,
    speed: 1,
    regen: 0,
    sprayDamage: 1,
    sprayRange: 1,
    sprayAngle: 1,
    knockback: 1,
    energyDrain: 1,
    energyRegen: 1,
    magnetRadius: 78,
    xpGain: 1,
    seedBonus: 1,
    revives: 0,
  };
}

/** Arena starts with a roomier spray economy because fire is continuous and automatic. */
export function arenaStats(): StatBlock {
  return {
    ...baseStats(),
    energyDrain: 0.62,
    energyRegen: 1.15,
    magnetRadius: 92,
  };
}

export const sprayRange = (s: StatBlock): number => SPRAY.range * s.sprayRange;
export const sprayHalfAngle = (s: StatBlock): number => SPRAY.halfAngle * s.sprayAngle;
