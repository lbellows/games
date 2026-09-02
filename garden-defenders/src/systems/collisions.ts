import { COLORS, PICKUPS, PLAYER } from '../config.ts';
import type { Camera } from '../core/camera.ts';
import type { SpatialGrid } from '../core/grid.ts';
import type { GameAudio } from '../core/audio.ts';
import type { Enemy } from '../entities/enemy.ts';
import type { Particles } from '../entities/particles.ts';
import type { Pickup } from '../entities/pickup.ts';
import type { Player } from '../entities/player.ts';

/**
 * Gentle mutual push so swarms spread out instead of stacking into one sprite.
 * Pairs come from the spatial grid, which keeps Arena swarms of 200+ bugs affordable.
 */
export function separateEnemies(enemies: readonly Enemy[], grid: SpatialGrid): void {
  grid.pairs((i, j) => {
    const a = enemies[i] as Enemy;
    const b = enemies[j] as Enemy;
    if (!a || !b || a.dead || b.dead) return;
    {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-4) return;
      const d = Math.sqrt(d2);
      const overlap = (min - d) * 0.5;
      const nx = dx / d;
      const ny = dy / d;
      // Heavier bugs (higher knock resistance) give up less ground.
      const aShare = 1 - a.spec.knockResist * 0.6;
      const bShare = 1 - b.spec.knockResist * 0.6;
      const sum = aShare + bShare || 1;
      a.x -= nx * overlap * ((aShare / sum) * 2);
      a.y -= ny * overlap * ((aShare / sum) * 2);
      b.x += nx * overlap * ((bShare / sum) * 2);
      b.y += ny * overlap * ((bShare / sum) * 2);
    }
  });
}

export interface ContactResult {
  /** Damage actually taken by the player this frame (0 while invulnerable). */
  damage: number;
}

export function resolvePlayerContacts(
  player: Player,
  enemies: readonly Enemy[],
  particles: Particles,
  audio: GameAudio,
  camera: Camera,
): ContactResult {
  let damage = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const min = PLAYER.radius + e.radius;
    const d = Math.hypot(dx, dy);
    if (d > min) continue;

    // Always bounce apart, even during invulnerability, so bugs cannot ride the player.
    e.applyKnockback(-dx, -dy, 210);
    player.knock(dx, dy, 90 + e.damage * 2.2);

    if (e.contactCooldown > 0) continue;
    e.contactCooldown = 0.55;
    if (player.takeDamage(e.damage)) {
      damage += e.damage;
      audio.hurt();
      camera.shake(7 + e.damage * 0.32);
      particles.sparkle(player.x, player.y, COLORS.danger, 12, 190);
      particles.ring(player.x, player.y, COLORS.danger, 14, 130, 0.3);
    }
  }
  return { damage };
}

/** Returns the pickups touched this frame; the caller applies their effects. */
export function collectPickups(player: Player, pickups: readonly Pickup[]): Pickup[] {
  const taken: Pickup[] = [];
  for (const p of pickups) {
    if (p.taken) continue;
    const reach = PLAYER.radius + PICKUPS.radius + 4;
    if (Math.hypot(p.x - player.x, p.y - player.y) <= reach) {
      p.taken = true;
      taken.push(p);
    }
  }
  return taken;
}
