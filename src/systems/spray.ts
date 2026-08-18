import { COLORS, POWERUP, SPRAY } from '../config.ts';
import { angleDelta, rand, TAU } from '../core/math.ts';
import type { Camera } from '../core/camera.ts';
import type { GameAudio } from '../core/audio.ts';
import type { Enemy } from '../entities/enemy.ts';
import type { Particles } from '../entities/particles.ts';
import type { Player } from '../entities/player.ts';

export interface SprayTick {
  /** Enemies killed by this frame of spray. */
  kills: Enemy[];
  /** Enemies touched by the cone this frame. */
  hits: number;
}

/**
 * Short-range cone weapon. Damage is continuous (damage-per-second scaled by dt) with a
 * distance falloff, and every hit also shoves the target away from the player.
 */
export class SprayWeapon {
  private mistBudget = 0;
  private soundOn = false;
  /** 0..1 visual ramp so the cone fades in/out instead of popping. */
  private intensity = 0;

  reset(): void {
    this.mistBudget = 0;
    this.intensity = 0;
    this.soundOn = false;
  }

  get range(): number {
    return SPRAY.range;
  }

  update(
    dt: number,
    player: Player,
    enemies: readonly Enemy[],
    particles: Particles,
    audio: GameAudio,
    camera: Camera,
  ): SprayTick {
    const result: SprayTick = { kills: [], hits: 0 };
    const active = player.spraying;
    this.intensity = Math.max(0, Math.min(1, this.intensity + (active ? dt * 9 : -dt * 7)));

    if (active !== this.soundOn) {
      this.soundOn = active;
      if (active) audio.startSpray();
      else audio.stopSpray();
    }
    if (!active) return result;

    const powered = player.powered;
    const range = SPRAY.range * (powered ? POWERUP.sprayRangeMul : 1);
    const dps = SPRAY.dps * (powered ? POWERUP.sprayDamageMul : 1);
    const aim = player.aim;
    const nozzle = player.nozzle();
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);

    // Mist particles at a fixed rate, independent of frame rate.
    this.mistBudget += SPRAY.particleRate * (powered ? 1.35 : 1) * dt;
    while (this.mistBudget >= 1) {
      this.mistBudget -= 1;
      particles.sprayMist(
        nozzle.x,
        nozzle.y,
        dirX,
        dirY,
        rand(range * 1.6, range * 2.6),
        powered ? COLORS.seedPower : COLORS.spray,
      );
    }

    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.radius) continue;
      const toEnemy = Math.atan2(dy, dx);
      // Widen the cone by the enemy's angular size so grazes register fairly.
      const allowance = SPRAY.halfAngle + Math.atan2(e.radius, Math.max(8, d));
      if (Math.abs(angleDelta(aim, toEnemy)) > allowance) continue;

      const falloff = 1 - SPRAY.falloff * Math.min(1, d / range);
      const killed = e.takeDamage(dps * falloff * dt);
      e.applyKnockback(dx, dy, SPRAY.knockback * falloff * dt);
      result.hits++;
      if (Math.random() < 14 * dt) particles.hitSplat(e.x, e.y, COLORS.spray);
      if (killed) {
        result.kills.push(e);
        camera.shake(e.spec.cost >= 3 ? 6 : 2.5);
      }
    }

    if (result.hits > 0) audio.hit();
    return result;
  }

  draw(ctx: CanvasRenderingContext2D, player: Player): void {
    if (this.intensity <= 0.01) return;
    const powered = player.powered;
    const range = SPRAY.range * (powered ? POWERUP.sprayRangeMul : 1) * this.intensity;
    const nozzle = player.nozzle();
    const half = SPRAY.halfAngle;

    ctx.save();
    ctx.translate(nozzle.x, nozzle.y);
    ctx.rotate(player.aim);
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, range);
    const inner = powered ? 'rgba(255,180,235,0.55)' : 'rgba(210,248,255,0.55)';
    const outer = powered ? 'rgba(255,110,199,0)' : 'rgba(89,199,232,0)';
    grad.addColorStop(0, inner);
    grad.addColorStop(0.55, powered ? 'rgba(255,140,215,0.22)' : 'rgba(150,230,250,0.22)');
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 40);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Faint arc showing where the spray will land — helps keyboard-only aiming. */
  drawAimGuide(ctx: CanvasRenderingContext2D, player: Player): void {
    const r = 30;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.aim);
    ctx.strokeStyle = player.energyLocked ? 'rgba(255,95,95,0.7)' : 'rgba(230,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, -SPRAY.halfAngle, SPRAY.halfAngle);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r + 8, 0, 2.4, 0, TAU);
    ctx.fillStyle = 'rgba(230,255,255,0.6)';
    ctx.fill();
    ctx.restore();
  }
}
