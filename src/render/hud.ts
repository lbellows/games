import { COLORS, HUD_HEIGHT, PLAYER, POWERUP, VIEW } from '../config.ts';
import { bar, panel, text } from './ui.ts';
import type { WavePhase } from '../systems/waves.ts';

export interface HudState {
  health: number;
  energy: number;
  energyLocked: boolean;
  powerTimer: number;
  score: number;
  highScore: number;
  wave: number;
  nextWave: number;
  phase: WavePhase;
  countdown: number;
  enemiesRemaining: number;
  endless: boolean;
  muted: boolean;
  paused: boolean;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState): void {
  panel(ctx, 12, 10, VIEW.w - 24, HUD_HEIGHT - 20, 12);

  /* ---- health + energy ------------------------------------------------- */
  const barX = 34;
  text(ctx, 'HEALTH', barX, 36, { size: 12, color: COLORS.textDim, letterSpacing: 2 });
  bar(ctx, barX, 42, 236, 14, {
    value: s.health,
    max: PLAYER.maxHealth,
    color: COLORS.health,
    warnColor: COLORS.danger,
    warnBelow: 0.3,
    segments: 4,
  });
  text(ctx, `${Math.ceil(s.health)}`, barX + 246, 55, { size: 14, color: COLORS.text });

  text(ctx, 'SPRAY', barX + 300, 36, { size: 12, color: COLORS.textDim, letterSpacing: 2 });
  bar(ctx, barX + 300, 42, 200, 14, {
    value: s.energy,
    max: PLAYER.maxEnergy,
    color: s.energyLocked ? '#f0a35e' : COLORS.energy,
    striped: s.energyLocked,
  });
  if (s.energyLocked) {
    text(ctx, 'RECHARGING', barX + 300 + 210, 55, { size: 12, color: '#f0a35e' });
  } else if (s.powerTimer > 0) {
    text(ctx, `BLOOM ${s.powerTimer.toFixed(1)}s`, barX + 300 + 210, 55, {
      size: 12,
      color: COLORS.seedPower,
    });
    bar(ctx, barX + 300, 60, 200, 4, {
      value: s.powerTimer,
      max: POWERUP.duration,
      color: COLORS.seedPower,
    });
  }

  /* ---- score ----------------------------------------------------------- */
  const cx = VIEW.w / 2 + 40;
  text(ctx, `${s.score.toLocaleString('en-US')}`, cx, 50, {
    size: 30,
    align: 'center',
    letterSpacing: 2,
  });
  text(ctx, `BEST ${s.highScore.toLocaleString('en-US')}`, cx, 66, {
    size: 12,
    align: 'center',
    color: COLORS.textDim,
    letterSpacing: 1,
  });

  /* ---- wave + bugs ----------------------------------------------------- */
  const rx = VIEW.w - 34;
  const waveLabel = s.wave === 0 ? 'WAVE —' : `WAVE ${s.wave}${s.endless ? '  ∞' : ''}`;
  text(ctx, waveLabel, rx, 44, { size: 22, align: 'right', letterSpacing: 2 });
  const sub =
    s.phase === 'countdown'
      ? `NEXT WAVE IN ${Math.max(0, s.countdown).toFixed(1)}s`
      : `BUGS LEFT ${s.enemiesRemaining}`;
  text(ctx, sub, rx, 64, {
    size: 13,
    align: 'right',
    color: s.phase === 'countdown' ? COLORS.seedScore : COLORS.textDim,
    letterSpacing: 1,
  });

  /* ---- status chips ---------------------------------------------------- */
  const chips: Array<{ label: string; color: string }> = [];
  chips.push(s.muted ? { label: 'M · MUTED', color: '#f0a35e' } : { label: 'M · SOUND', color: COLORS.textDim });
  if (s.paused) chips.push({ label: 'P · PAUSED', color: COLORS.seedScore });
  let chipX = VIEW.w - 24;
  for (const chip of chips) {
    const w = chip.label.length * 7.6 + 16;
    chipX -= w + 8;
    panel(ctx, chipX, VIEW.h - 34, w, 22, 8, 'rgba(8,18,10,0.7)');
    text(ctx, chip.label, chipX + w / 2, VIEW.h - 19, {
      size: 11,
      align: 'center',
      color: chip.color,
      letterSpacing: 1,
    });
  }
}

/** Red edge glow that intensifies as health drops. */
export function drawLowHealthVignette(ctx: CanvasRenderingContext2D, health: number): void {
  const t = 1 - Math.min(1, health / (PLAYER.maxHealth * 0.4));
  if (t <= 0.01) return;
  const grad = ctx.createRadialGradient(
    VIEW.w / 2,
    VIEW.h / 2,
    VIEW.h * 0.3,
    VIEW.w / 2,
    VIEW.h / 2,
    VIEW.h * 0.78,
  );
  grad.addColorStop(0, 'rgba(255,40,40,0)');
  grad.addColorStop(1, `rgba(255,30,30,${(0.42 * t).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}
