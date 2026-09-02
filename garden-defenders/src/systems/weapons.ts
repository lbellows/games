import { COLORS } from '../config.ts';
import type { SpatialGrid } from '../core/grid.ts';
import { rand, TAU } from '../core/math.ts';
import type { GameAudio } from '../core/audio.ts';
import type { Enemy } from '../entities/enemy.ts';
import type { Particles } from '../entities/particles.ts';
import type { Player } from '../entities/player.ts';
import { Projectile } from '../entities/projectile.ts';

export type WeaponId = 'sprinkler' | 'seedshot' | 'thorn';

export const WEAPON_NAMES: Record<WeaponId, string> = {
  sprinkler: 'SPRINKLER',
  seedshot: 'SEED SHOT',
  thorn: 'THORN AURA',
};

/** Which sub-weapons the run has picked up, and at what level. */
export class Loadout {
  readonly levels: Record<WeaponId, number> = { sprinkler: 0, seedshot: 0, thorn: 0 };

  reset(): void {
    this.levels.sprinkler = 0;
    this.levels.seedshot = 0;
    this.levels.thorn = 0;
  }

  has(id: WeaponId): boolean {
    return this.levels[id] > 0;
  }

  levelUp(id: WeaponId): number {
    this.levels[id] += 1;
    return this.levels[id];
  }

  get owned(): WeaponId[] {
    return (Object.keys(this.levels) as WeaponId[]).filter((id) => this.levels[id] > 0);
  }
}

export interface CombatHooks {
  enemies: readonly Enemy[];
  grid: SpatialGrid;
  particles: Particles;
  audio: GameAudio;
  /** Called once per enemy killed by a sub-weapon. */
  onKill: (enemy: Enemy) => void;
}

/* Per-level tuning for each sub-weapon. */
const sprinklerCount = (lvl: number): number => 1 + lvl;
const sprinklerDps = (lvl: number): number => 20 + lvl * 7;
const sprinklerRadius = (lvl: number): number => 62 + lvl * 5;
const seedInterval = (lvl: number): number => Math.max(0.5, 1.15 - lvl * 0.12);
const seedCount = (lvl: number): number => 1 + Math.floor(lvl / 2);
const seedDamage = (lvl: number): number => 20 + lvl * 8;
const seedPierce = (lvl: number): number => 1 + Math.floor(lvl / 3);
const thornRadius = (lvl: number): number => 58 + lvl * 13;
const thornDps = (lvl: number): number => 13 + lvl * 7;

/**
 * Arena sub-weapons. All three fire on their own: an orbiting sprinkler, homing seed shots,
 * and a damaging thorn aura. Damage is routed through one helper so kills report consistently.
 */
export class WeaponSystem {
  readonly loadout = new Loadout();
  readonly projectiles: Projectile[] = [];
  private orbitPhase = 0;
  private shotTimer = 0;
  private auraPhase = 0;
  private auraTick = 0;

  reset(): void {
    this.loadout.reset();
    this.projectiles.length = 0;
    this.orbitPhase = 0;
    this.shotTimer = 0;
    this.auraPhase = 0;
    this.auraTick = 0;
  }

  describe(id: WeaponId, level: number): string {
    switch (id) {
      case 'sprinkler':
        return `${sprinklerCount(level)} orbiting droplets, ${sprinklerDps(level)} dmg/s`;
      case 'seedshot':
        return `${seedCount(level)}x homing seed, ${seedDamage(level)} dmg every ${seedInterval(level).toFixed(2)}s`;
      case 'thorn':
        return `${thornDps(level)} dmg/s within ${Math.round(thornRadius(level))}px`;
    }
  }

  update(dt: number, player: Player, hooks: CombatHooks): void {
    this.orbitPhase += dt * 2.1;
    this.auraPhase += dt * 3;
    if (this.loadout.has('sprinkler')) this.updateSprinkler(dt, player, hooks);
    if (this.loadout.has('thorn')) this.updateThorn(dt, player, hooks);
    if (this.loadout.has('seedshot')) this.updateSeedShot(dt, player, hooks);
    this.updateProjectiles(dt, hooks);
  }

  /** Applies damage and reports a kill exactly once. */
  private hit(enemy: Enemy, amount: number, hooks: CombatHooks, knock?: { x: number; y: number; power: number }): void {
    if (enemy.dead) return;
    const killed = enemy.takeDamage(amount);
    if (knock) enemy.applyKnockback(knock.x, knock.y, knock.power);
    if (killed) hooks.onKill(enemy);
  }

  private updateSprinkler(dt: number, player: Player, hooks: CombatHooks): void {
    const lvl = this.loadout.levels.sprinkler;
    const count = sprinklerCount(lvl);
    const dps = sprinklerDps(lvl) * player.stats.sprayDamage;
    const orbit = sprinklerRadius(lvl);
    for (let i = 0; i < count; i++) {
      const a = this.orbitPhase + (i / count) * TAU;
      const dx = Math.cos(a) * orbit;
      const dy = Math.sin(a) * orbit;
      const x = player.x + dx;
      const y = player.y + dy;
      const dropletR = 10;
      hooks.grid.query(x, y, dropletR + 20, (index) => {
        const e = hooks.enemies[index] as Enemy;
        if (e.dead) return;
        if (Math.hypot(e.x - x, e.y - y) > dropletR + e.radius) return;
        this.hit(e, dps * dt, hooks, { x: e.x - player.x, y: e.y - player.y, power: 220 * dt });
        if (Math.random() < 8 * dt) hooks.particles.hitSplat(e.x, e.y, COLORS.spray);
      });
      if (Math.random() < 6 * dt) {
        hooks.particles.spawn({
          x,
          y,
          vx: rand(-20, 20),
          vy: rand(-20, 20),
          life: 0.3,
          size: 2.2,
          grow: 3,
          drag: 3,
          color: COLORS.spray,
          alpha: 0.7,
        });
      }
    }
  }

  private updateThorn(dt: number, player: Player, hooks: CombatHooks): void {
    const lvl = this.loadout.levels.thorn;
    const radius = thornRadius(lvl);
    const dps = thornDps(lvl) * player.stats.sprayDamage;
    this.auraTick -= dt;
    const tickParticles = this.auraTick <= 0;
    if (tickParticles) this.auraTick = 0.12;
    hooks.grid.query(player.x, player.y, radius + 24, (index) => {
      const e = hooks.enemies[index] as Enemy;
      if (e.dead) return;
      if (Math.hypot(e.x - player.x, e.y - player.y) > radius + e.radius) return;
      this.hit(e, dps * dt, hooks);
      if (tickParticles && Math.random() < 0.4) {
        hooks.particles.spawn({
          x: e.x,
          y: e.y,
          vx: rand(-30, 30),
          vy: rand(-30, 30),
          life: 0.24,
          size: 2,
          drag: 3,
          color: '#8ef5a0',
        });
      }
    });
  }

  private updateSeedShot(dt: number, player: Player, hooks: CombatHooks): void {
    const lvl = this.loadout.levels.seedshot;
    this.shotTimer -= dt;
    if (this.shotTimer > 0) return;
    this.shotTimer = seedInterval(lvl);

    const targets = this.nearestEnemies(player, hooks, seedCount(lvl), 620);
    const damage = seedDamage(lvl) * player.stats.sprayDamage;
    const pierce = seedPierce(lvl);
    if (targets.length === 0) return;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] as Enemy;
      const a = Math.atan2(t.y - player.y, t.x - player.x) + rand(-0.05, 0.05);
      const speed = 430;
      this.projectiles.push(
        new Projectile(player.x, player.y, Math.cos(a) * speed, Math.sin(a) * speed, damage, pierce),
      );
    }
    hooks.audio.seedShot();
  }

  private updateProjectiles(dt: number, hooks: CombatHooks): void {
    for (const p of this.projectiles) {
      let nearest: Enemy | null = null;
      let nd = 150;
      hooks.grid.query(p.x, p.y, nd, (index) => {
        const e = hooks.enemies[index] as Enemy;
        if (e.dead || p.alreadyHit(e)) return;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < nd) {
          nd = d;
          nearest = e;
        }
      });
      p.update(dt, nearest);

      hooks.grid.query(p.x, p.y, 26, (index) => {
        const e = hooks.enemies[index] as Enemy;
        if (p.dead || e.dead || p.alreadyHit(e)) return;
        if (Math.hypot(e.x - p.x, e.y - p.y) > e.radius + 6) return;
        p.registerHit(e);
        this.hit(e, p.damage, hooks, { x: p.vx, y: p.vy, power: 90 });
        hooks.particles.hitSplat(e.x, e.y, COLORS.seedScore);
      });
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if ((this.projectiles[i] as Projectile).dead) this.projectiles.splice(i, 1);
    }
  }

  private nearestEnemies(player: Player, hooks: CombatHooks, count: number, range: number): Enemy[] {
    const found: Array<{ e: Enemy; d: number }> = [];
    for (const e of hooks.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= range) found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, count).map((f) => f.e);
  }

  /** Drawn under the player and enemies so the gardener stays readable. */
  drawUnder(ctx: CanvasRenderingContext2D, player: Player): void {
    if (this.loadout.has('thorn')) {
      const lvl = this.loadout.levels.thorn;
      const radius = thornRadius(lvl);
      const pulse = 0.5 + 0.5 * Math.sin(this.auraPhase);
      ctx.save();
      ctx.globalAlpha = 0.1 + pulse * 0.07;
      ctx.fillStyle = '#7cf29a';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.42 + pulse * 0.2;
      ctx.strokeStyle = '#8ef5a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, TAU);
      ctx.stroke();
      // thorn ticks around the ring
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + this.auraPhase * 0.3;
        const inner = radius - 6;
        const outer = radius + 4 + pulse * 3;
        ctx.beginPath();
        ctx.moveTo(player.x + Math.cos(a) * inner, player.y + Math.sin(a) * inner);
        ctx.lineTo(player.x + Math.cos(a) * outer, player.y + Math.sin(a) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Drawn over the world: droplets and projectiles. */
  drawOver(ctx: CanvasRenderingContext2D, player: Player): void {
    for (const p of this.projectiles) p.draw(ctx);

    if (this.loadout.has('sprinkler')) {
      const lvl = this.loadout.levels.sprinkler;
      const count = sprinklerCount(lvl);
      const orbit = sprinklerRadius(lvl);
      ctx.save();
      for (let i = 0; i < count; i++) {
        const a = this.orbitPhase + (i / count) * TAU;
        const x = player.x + Math.cos(a) * orbit;
        const y = player.y + Math.sin(a) * orbit;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = COLORS.sprayDeep;
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLORS.spray;
        ctx.strokeStyle = '#2b7f96';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x - 2, y - 2.4, 2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }
}
