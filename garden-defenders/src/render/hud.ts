import { COLORS, HUD_HEIGHT, PLAYER, POWERUP, VIEW } from '../config.ts';
import { bar, panel, text } from './ui.ts';
import { drawUpgradeIcon } from './levelup.ts';
import type { UpgradeIcon } from '../systems/progression.ts';
import type { WavePhase } from '../systems/waves.ts';

export interface ArenaHud {
  /** Seconds left in the 10-minute run. */
  timeLeft: number;
  level: number;
  xp: number;
  xpToNext: number;
  upgrades: ReadonlyArray<{ name: string; level: number; icon: UpgradeIcon; weapon: boolean }>;
  boss: { name: string; hp: number; maxHp: number } | null;
  revives: number;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface HudState {
  health: number;
  maxHealth: number;
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
  /** Present in Arena mode only. */
  arena: ArenaHud | null;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState, time = 0): void {
  panel(ctx, 12, 10, VIEW.w - 24, HUD_HEIGHT - 20, 12);

  /* ---- health + energy ------------------------------------------------- */
  const barX = 34;
  text(ctx, 'HEALTH', barX, 36, { size: 12, color: COLORS.textDim, letterSpacing: 2 });
  bar(ctx, barX, 42, 236, 14, {
    value: s.health,
    max: s.maxHealth,
    color: COLORS.health,
    warnColor: COLORS.danger,
    warnBelow: 0.3,
    segments: 4,
  });
  text(ctx, `${Math.ceil(s.health)}/${Math.round(s.maxHealth)}`, barX + 246, 55, {
    size: 13,
    color: COLORS.text,
  });

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

  /* ---- wave / run timer ------------------------------------------------ */
  const rx = VIEW.w - 34;
  if (s.arena) {
    const urgent = s.arena.timeLeft <= 30;
    text(ctx, formatTime(s.arena.timeLeft), rx, 46, {
      size: 30,
      align: 'right',
      letterSpacing: 2,
      color: urgent ? COLORS.danger : COLORS.text,
    });
    text(ctx, `BUGS ON FIELD ${s.enemiesRemaining}`, rx, 66, {
      size: 13,
      align: 'right',
      color: COLORS.textDim,
      letterSpacing: 1,
    });
  } else {
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
  }

  if (s.arena) drawArenaExtras(ctx, s.arena, time);

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

/** XP bar, level badge, acquired-upgrade chips and the boss bar. */
function drawArenaExtras(ctx: CanvasRenderingContext2D, a: ArenaHud, time: number): void {
  // --- XP bar just under the HUD panel ---------------------------------
  const xpX = 74;
  const xpW = VIEW.w - xpX - 24;
  const xpY = HUD_HEIGHT - 6;
  bar(ctx, xpX, xpY, xpW, 9, { value: a.xp, max: a.xpToNext, color: COLORS.energy });

  panel(ctx, 12, xpY - 7, 56, 23, 8, 'rgba(8,18,10,0.9)');
  text(ctx, `LV ${a.level}`, 40, xpY + 9, {
    size: 13,
    align: 'center',
    color: COLORS.seedScore,
    letterSpacing: 1,
  });

  // --- acquired upgrades, bottom-left ----------------------------------
  const chips = a.upgrades.slice(0, 12);
  chips.forEach((u, i) => {
    const cx = 30 + i * 40;
    const cy = VIEW.h - 30;
    const accent = u.weapon ? COLORS.energy : COLORS.textDim;
    ctx.save();
    ctx.globalAlpha = 0.85;
    panel(ctx, cx - 17, cy - 17, 34, 34, 9, 'rgba(8,18,10,0.8)');
    ctx.restore();
    drawUpgradeIcon(ctx, u.icon, cx, cy - 2, 19, accent, time);
    text(ctx, String(u.level), cx + 11, cy + 15, {
      size: 11,
      align: 'center',
      color: u.weapon ? COLORS.energy : COLORS.text,
    });
  });

  if (a.revives > 0) {
    const rxx = 30 + chips.length * 40;
    panel(ctx, rxx - 17, VIEW.h - 47, 34, 34, 9, 'rgba(40,14,24,0.85)');
    drawUpgradeIcon(ctx, 'wind', rxx, VIEW.h - 32, 19, COLORS.seedPower, time);
    text(ctx, String(a.revives), rxx + 11, VIEW.h - 15, {
      size: 11,
      align: 'center',
      color: COLORS.seedPower,
    });
  }

  // --- boss bar ---------------------------------------------------------
  if (a.boss) {
    const w = 620;
    const x = (VIEW.w - w) / 2;
    const y = HUD_HEIGHT + 14;
    panel(ctx, x - 8, y - 6, w + 16, 40, 10, 'rgba(28,6,14,0.82)');
    text(ctx, a.boss.name, VIEW.w / 2, y + 10, {
      size: 14,
      align: 'center',
      letterSpacing: 5,
      color: '#ff8fae',
    });
    bar(ctx, x, y + 16, w, 12, {
      value: a.boss.hp,
      max: a.boss.maxHp,
      color: '#ff4f7a',
      warnColor: '#ffb03a',
      warnBelow: 0.25,
      segments: 10,
    });
  }
}

/** Red edge glow that intensifies as health drops. */
export function drawLowHealthVignette(
  ctx: CanvasRenderingContext2D,
  health: number,
  maxHealth: number = PLAYER.maxHealth,
): void {
  const t = 1 - Math.min(1, health / (maxHealth * 0.4));
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
