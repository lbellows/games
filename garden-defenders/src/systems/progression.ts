import type { Player } from '../entities/player.ts';
import type { StatBlock } from './stats.ts';
import { WEAPON_NAMES, type Loadout, type WeaponId, type WeaponSystem } from './weapons.ts';

export type UpgradeIcon =
  | 'damage' | 'range' | 'cone' | 'boots' | 'heart' | 'leaf' | 'tank'
  | 'magnet' | 'xp' | 'fist' | 'sprinkler' | 'seed' | 'thorn' | 'seedbag' | 'wind';

export interface UpgradeContext {
  stats: StatBlock;
  player: Player;
  weapons: WeaponSystem;
  /** Score awarded by filler upgrades. */
  addScore: (amount: number) => void;
}

export interface UpgradeDef {
  id: string;
  name: string;
  icon: UpgradeIcon;
  maxLevel: number;
  weight: number;
  /** `level` is the level being taken (1 = first pick). */
  describe: (level: number, ctx: { weapons: WeaponSystem }) => string;
  apply: (ctx: UpgradeContext, level: number) => void;
  weapon?: WeaponId;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'nozzle',
    name: 'NOZZLE PRESSURE',
    icon: 'damage',
    maxLevel: 6,
    weight: 3,
    describe: () => '+22% spray damage',
    apply: (c) => {
      c.stats.sprayDamage += 0.22;
    },
  },
  {
    id: 'hose',
    name: 'LONG HOSE',
    icon: 'range',
    maxLevel: 5,
    weight: 2.4,
    describe: () => '+14% spray range',
    apply: (c) => {
      c.stats.sprayRange += 0.14;
    },
  },
  {
    id: 'wide',
    name: 'WIDE NOZZLE',
    icon: 'cone',
    maxLevel: 4,
    weight: 2.2,
    describe: () => '+13% spray arc',
    apply: (c) => {
      c.stats.sprayAngle += 0.13;
    },
  },
  {
    id: 'boots',
    name: "GARDENER'S BOOTS",
    icon: 'boots',
    maxLevel: 5,
    weight: 2.6,
    describe: () => '+10% move speed',
    apply: (c) => {
      c.stats.speed += 0.1;
    },
  },
  {
    id: 'gloves',
    name: 'STURDY GLOVES',
    icon: 'heart',
    maxLevel: 5,
    weight: 2.6,
    describe: () => '+20 max health, heal 20',
    apply: (c) => {
      c.stats.maxHealth += 20;
      c.player.heal(20);
    },
  },
  {
    id: 'compost',
    name: 'COMPOST TEA',
    icon: 'leaf',
    maxLevel: 4,
    weight: 2,
    describe: (lvl) => `regenerate ${(lvl * 0.6).toFixed(1)} HP/s`,
    apply: (c) => {
      c.stats.regen += 0.6;
    },
  },
  {
    id: 'tank',
    name: 'BIGGER TANK',
    icon: 'tank',
    maxLevel: 4,
    weight: 2,
    describe: () => '+25% spray recharge, -8% drain',
    apply: (c) => {
      c.stats.energyRegen += 0.25;
      c.stats.energyDrain = Math.max(0.2, c.stats.energyDrain - 0.08);
    },
  },
  {
    id: 'magnet',
    name: 'MAGNET TROWEL',
    icon: 'magnet',
    maxLevel: 4,
    weight: 1.9,
    describe: () => '+38 XP pickup radius',
    apply: (c) => {
      c.stats.magnetRadius += 38;
    },
  },
  {
    id: 'fertilizer',
    name: 'FERTILIZER',
    icon: 'xp',
    maxLevel: 4,
    weight: 1.9,
    describe: () => '+16% XP gained',
    apply: (c) => {
      c.stats.xpGain += 0.16;
    },
  },
  {
    id: 'firm',
    name: 'FIRM HAND',
    icon: 'fist',
    maxLevel: 3,
    weight: 1.4,
    describe: () => '+35% spray knockback',
    apply: (c) => {
      c.stats.knockback += 0.35;
    },
  },
  {
    id: 'sprinkler',
    name: 'SPRINKLER',
    icon: 'sprinkler',
    maxLevel: 5,
    weight: 2.8,
    weapon: 'sprinkler',
    describe: (lvl, c) => c.weapons.describe('sprinkler', lvl),
    apply: (c) => {
      c.weapons.loadout.levelUp('sprinkler');
    },
  },
  {
    id: 'seedshot',
    name: 'SEED SHOT',
    icon: 'seed',
    maxLevel: 5,
    weight: 2.8,
    weapon: 'seedshot',
    describe: (lvl, c) => c.weapons.describe('seedshot', lvl),
    apply: (c) => {
      c.weapons.loadout.levelUp('seedshot');
    },
  },
  {
    id: 'thorn',
    name: 'THORN AURA',
    icon: 'thorn',
    maxLevel: 5,
    weight: 2.8,
    weapon: 'thorn',
    describe: (lvl, c) => c.weapons.describe('thorn', lvl),
    apply: (c) => {
      c.weapons.loadout.levelUp('thorn');
    },
  },
  {
    id: 'greenthumb',
    name: 'GREEN THUMB',
    icon: 'seedbag',
    maxLevel: 3,
    weight: 1.5,
    describe: () => '+50% value from seed pickups',
    apply: (c) => {
      c.stats.seedBonus += 0.5;
    },
  },
  {
    id: 'secondwind',
    name: 'SECOND WIND',
    icon: 'wind',
    maxLevel: 2,
    weight: 1.8,
    describe: () => 'survive one fatal hit at 40% health',
    apply: (c) => {
      c.stats.revives += 1;
    },
  },
  {
    id: 'cache',
    name: 'SEED CACHE',
    icon: 'seedbag',
    // Always available so a draft can never come up empty late in a run.
    maxLevel: 99,
    weight: 0.45,
    describe: () => '+250 score, heal 15',
    apply: (c) => {
      c.addScore(250);
      c.player.heal(15);
    },
  },
];

/** XP required to go from `level` to `level + 1`. */
export const xpForLevel = (level: number): number => 5 + level * 3;

/**
 * Arena XP and the level-up draft. Levels can stack up (a boss kill may grant several at once),
 * so they are queued and drafted one at a time.
 */
export class Progression {
  level = 1;
  xp = 0;
  xpToNext: number = xpForLevel(1);
  /** Level-ups waiting for the player to pick an upgrade. */
  pending = 0;
  totalXp = 0;
  readonly taken = new Map<string, number>();
  choices: UpgradeDef[] = [];

  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpForLevel(1);
    this.pending = 0;
    this.totalXp = 0;
    this.taken.clear();
    this.choices = [];
  }

  levelOf(id: string): number {
    return this.taken.get(id) ?? 0;
  }

  /** Returns how many levels were gained. */
  addXp(amount: number): number {
    if (amount <= 0) return 0;
    this.xp += amount;
    this.totalXp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = xpForLevel(this.level);
      this.pending += 1;
      gained += 1;
    }
    return gained;
  }

  private available(): UpgradeDef[] {
    return UPGRADES.filter((u) => this.levelOf(u.id) < u.maxLevel);
  }

  /** Weighted draft of `count` distinct upgrades, biased toward unowned sub-weapons. */
  rollChoices(loadout: Loadout, count = 3): UpgradeDef[] {
    const pool = this.available();
    const picks: UpgradeDef[] = [];
    const weightOf = (u: UpgradeDef): number => {
      if (u.weapon && !loadout.has(u.weapon)) return u.weight * 2.4;
      return u.weight;
    };

    // Guarantee an unowned weapon shows up while the run still has no sub-weapon.
    if (loadout.owned.length === 0) {
      const weapons = pool.filter((u) => u.weapon);
      if (weapons.length > 0) {
        picks.push(weightedPick(weapons, weightOf) as UpgradeDef);
      }
    }

    while (picks.length < count) {
      const remaining = pool.filter((u) => !picks.includes(u));
      if (remaining.length === 0) break;
      picks.push(weightedPick(remaining, weightOf) as UpgradeDef);
    }
    this.choices = picks;
    return picks;
  }

  take(def: UpgradeDef, ctx: UpgradeContext): number {
    const next = this.levelOf(def.id) + 1;
    this.taken.set(def.id, next);
    def.apply(ctx, next);
    this.pending = Math.max(0, this.pending - 1);
    this.choices = [];
    return next;
  }

  /** Compact HUD summary: acquired upgrades with their level, strongest first. */
  summary(): Array<{ name: string; level: number; icon: UpgradeIcon; weapon: boolean }> {
    const rows: Array<{ name: string; level: number; icon: UpgradeIcon; weapon: boolean }> = [];
    for (const u of UPGRADES) {
      const lvl = this.levelOf(u.id);
      if (lvl > 0 && u.id !== 'cache') {
        rows.push({
          name: u.weapon ? WEAPON_NAMES[u.weapon] : u.name,
          level: lvl,
          icon: u.icon,
          weapon: Boolean(u.weapon),
        });
      }
    }
    return rows.sort((a, b) => Number(b.weapon) - Number(a.weapon) || b.level - a.level);
  }
}

function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
