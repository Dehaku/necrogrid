// HUD drawn in screen space after the world. GAME_DESIGN.md section 8.4.
// M2: the day ring. M4: health and mana crescents, the spell bar (Bolt).

import { BOLT } from '../data/spells';
import { DAY_CYCLE, DAY_RING } from '../data/time';
import { TILE_SIZE, VIEW_WIDTH } from '../data/tuning';
import { CRESCENT, SPELL_BAR } from '../data/ui';
import type { Player } from '../entities/player';
import type { CycleState } from '../time/dayCycle';

const DEG = Math.PI / 180;

export interface Arc {
  start: number;
  end: number;
  /** Draw counter-clockwise (decreasing angle). */
  ccw: boolean;
}

/**
 * The background and fill arcs of a crescent. Health sits on the west side and mana on the
 * east; both span CRESCENT.span degrees with gaps at top and bottom. The fill starts at the
 * bottom end and reaches up in proportion to `fraction`, so a dropping value drains downward.
 * Canvas angles: 0 = east, +90° = south (screen down).
 */
export function crescentArcs(side: 'health' | 'mana', fraction: number): { background: Arc; fill: Arc } {
  const half = (CRESCENT.span / 2) * DEG;
  const f = Math.min(Math.max(fraction, 0), 1);
  const sweep = CRESCENT.span * DEG * f;
  if (side === 'health') {
    // West: bottom end at 180° − half (lower left), increasing angle goes up the left side.
    const bottom = Math.PI - half;
    return {
      background: { start: bottom, end: Math.PI + half, ccw: false },
      fill: { start: bottom, end: bottom + sweep, ccw: false },
    };
  }
  // East: bottom end at +half (lower right), decreasing angle goes up the right side.
  return {
    background: { start: half, end: -half, ccw: true },
    fill: { start: half, end: half - sweep, ccw: true },
  };
}

function strokeArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, arc: Arc, color: string): void {
  if (arc.start === arc.end) return;
  ctx.beginPath();
  ctx.arc(x, y, r, arc.start, arc.end, arc.ccw);
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Health (left, red) and mana (right, blue) crescents around the necromancer's screen position. */
export function drawCrescents(ctx: CanvasRenderingContext2D, x: number, y: number, player: Player): void {
  const r = CRESCENT.radius * TILE_SIZE;
  ctx.lineWidth = CRESCENT.thickness;
  ctx.lineCap = 'butt';
  const health = crescentArcs('health', player.hp / player.maxHp);
  const mana = crescentArcs('mana', player.mana / player.maxMana);
  strokeArc(ctx, x, y, r, health.background, CRESCENT.background);
  strokeArc(ctx, x, y, r, mana.background, CRESCENT.background);
  strokeArc(ctx, x, y, r, health.fill, CRESCENT.healthColor);
  strokeArc(ctx, x, y, r, mana.fill, CRESCENT.manaColor);
}

export interface SpellIcon {
  label: string;
  /** 0 = ready, 1 = just cast. */
  cooldownFraction: number;
  usable: boolean;
  draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void;
}

/** The spell icons for the current state. Chain joins in M5 and Mend in M6. */
export function spellIcons(player: Player): SpellIcon[] {
  return [
    {
      label: 'LMB',
      cooldownFraction: player.boltCooldown / BOLT.cooldown,
      usable: player.mana >= BOLT.manaCost,
      draw: (ctx, cx, cy, size) => {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = BOLT.color;
        ctx.fill();
      },
    },
  ];
}

/** The spell bar: icons in a row, centered below the necromancer. */
export function drawSpellBar(ctx: CanvasRenderingContext2D, x: number, y: number, icons: readonly SpellIcon[]): void {
  const { iconSize: size, gap } = SPELL_BAR;
  const total = icons.length * size + (icons.length - 1) * gap;
  let left = x - total / 2;
  const top = y + SPELL_BAR.offsetY - size / 2;
  for (const icon of icons) {
    ctx.globalAlpha = icon.usable ? 1 : 0.4;
    ctx.fillStyle = SPELL_BAR.background;
    ctx.fillRect(left, top, size, size);
    icon.draw(ctx, left + size / 2, top + size / 2, size);
    if (icon.cooldownFraction > 0) {
      // A dark wedge that sweeps away clockwise as the cooldown ends.
      const cx = left + size / 2;
      const cy = top + size / 2;
      const start = -Math.PI / 2 + (1 - icon.cooldownFraction) * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, size, size);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, size, start, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fillStyle = SPELL_BAR.cooldownShade;
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = SPELL_BAR.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    ctx.fillStyle = SPELL_BAR.labelColor;
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(icon.label, left + size / 2, top + size + 2);
    ctx.globalAlpha = 1;
    left += size + gap;
  }
}

const TOP = -Math.PI / 2;

export interface RingSlice {
  color: string;
  /** Canvas angles in radians; increasing is clockwise. */
  start: number;
  end: number;
}

/** One slice per phase, sized by its share of the cycle, starting at 12 o'clock and running clockwise. */
export function ringSlices(): RingSlice[] {
  const total = DAY_CYCLE.phases.reduce((sum, p) => sum + p.length, 0);
  let angle = TOP;
  return DAY_CYCLE.phases.map((phase) => {
    const start = angle;
    angle += (phase.length / total) * Math.PI * 2;
    return { color: phase.ringColor, start, end: angle };
  });
}

/** Angle of the day ring's hand for a point in the cycle. */
export function ringHandAngle(cycleFraction: number): number {
  return TOP + cycleFraction * Math.PI * 2;
}

/** Text in the middle of the ring: ["Day 7", "/ 15"], or ["Day 17"] in endless mode. */
export function ringDayText(day: number, endless: boolean): string[] {
  return endless ? [`Day ${day}`] : [`Day ${day}`, `/ ${DAY_CYCLE.winDay}`];
}

export function drawDayRing(ctx: CanvasRenderingContext2D, state: CycleState, endless = false): void {
  const radius = DAY_RING.size / 2;
  const cx = VIEW_WIDTH - DAY_RING.margin - radius;
  const cy = DAY_RING.margin + radius;

  for (const slice of ringSlices()) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, slice.start, slice.end);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, DAY_RING.innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = DAY_RING.innerColor;
  ctx.fill();

  // Hand across the colored band, poking slightly past the rim.
  const angle = ringHandAngle(state.cycleFraction);
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(angle) * DAY_RING.innerRadius, cy + Math.sin(angle) * DAY_RING.innerRadius);
  ctx.lineTo(cx + Math.cos(angle) * (radius + 3), cy + Math.sin(angle) * (radius + 3));
  ctx.strokeStyle = DAY_RING.handColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = DAY_RING.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = ringDayText(state.day, endless);
  if (lines.length === 2) {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText(lines[0]!, cx, cy - 5);
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(lines[1]!, cx, cy + 7);
  } else {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText(lines[0]!, cx, cy);
  }

  // Phase name under the ring, with a dark outline so it reads on any terrain.
  const label = DAY_CYCLE.phases[state.phaseIndex]!.label;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.strokeText(label, cx, cy + radius + 12);
  ctx.fillText(label, cx, cy + radius + 12);
}
