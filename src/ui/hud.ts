// HUD drawn in screen space after the world. GAME_DESIGN.md section 8.4.
// M2: the day ring. M4: health and mana crescents, the spell bar (Bolt).

import { BOLT, CHAIN, MEND } from '../data/spells';
import { mendProblem } from '../entities/player';
import { baseStats, type Stats } from '../core/stats';
import { healthBarColor } from './healthBars';
import { DAY_CYCLE, DAY_RING } from '../data/time';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
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

/** The spell icons for the current state: Bolt, Chain, and the Mend badge with the Flesh count. */
export function spellIcons(player: Player, flesh: number, stats: Stats = baseStats()): SpellIcon[] {
  return [
    {
      label: 'LMB',
      cooldownFraction: player.boltCooldown / stats.boltCooldown,
      usable: player.mana >= stats.boltManaCost,
      draw: (ctx, cx, cy, size) => {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = BOLT.color;
        ctx.fill();
      },
    },
    {
      label: 'RMB',
      cooldownFraction: player.chainCooldown / stats.chainCooldown,
      usable: player.mana >= CHAIN.manaCost,
      draw: (ctx, cx, cy, size) => {
        // Zigzag.
        const w = size * 0.32;
        ctx.beginPath();
        ctx.moveTo(cx - w, cy - w);
        ctx.lineTo(cx - w * 0.2, cy - w * 0.1);
        ctx.lineTo(cx + w * 0.1, cy - w * 0.55);
        ctx.lineTo(cx + w, cy + w);
        ctx.strokeStyle = CHAIN.coreColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'miter';
        ctx.stroke();
      },
    },
    {
      label: 'Q',
      cooldownFraction: player.mendCooldown / MEND.cooldown,
      // Greyed out when Mend cannot be used for any reason other than its own cooldown.
      usable: mendProblem({ ...player, mendCooldown: 0 }, flesh) === undefined,
      draw: (ctx, cx, cy, size) => {
        const arm = size * 0.28;
        const w = size * 0.11;
        ctx.fillStyle = MEND.color;
        ctx.fillRect(cx - w, cy - arm, w * 2, arm * 2);
        ctx.fillRect(cx - arm, cy - w, arm * 2, w * 2);
        // Flesh count in the corner.
        ctx.font = '700 8px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#f2ead8';
        ctx.fillText(String(flesh), cx + size / 2 - 1, cy + size / 2);
      },
    },
  ];
}

/**
 * Phylactery panel, top-center: HP bar colored like health bars, with the numbers. On the final day a
 * completion countdown ("1:15" → "0:00") shows under the bar; after completion it reads "Bound".
 */
export function drawPhylacteryPanel(ctx: CanvasRenderingContext2D, hp: number, maxHp: number, countdown?: number, bound = false): void {
  const width = 260;
  const left = (VIEW_WIDTH - width) / 2;
  const top = 14;
  ctx.fillStyle = 'rgba(12, 10, 16, 0.8)';
  ctx.fillRect(left - 6, top - 4, width + 12, 34);
  ctx.fillStyle = '#c9b8ec';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PHYLACTERY', left, top);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2ead8';
  ctx.fillText(`${Math.ceil(hp)} / ${maxHp}`, left + width, top);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(left, top + 15, width, 9);
  ctx.fillStyle = healthBarColor(hp / maxHp);
  ctx.fillRect(left, top + 15, width * Math.max(0, hp / maxHp), 9);
  const note = bound ? 'Bound' : countdown !== undefined ? formatCountdown(countdown) : undefined;
  if (note) {
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = bound ? '#c9b8ec' : '#ffcf5a';
    ctx.fillText(note, left + width / 2, top + 30);
  }
}

/** "2:30" from 150 seconds; never below "0:00". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Where the off-screen Phylactery arrow goes: on a rectangle inset from the screen edge, along
 * the line from the screen center toward the target. Undefined if the target is on screen.
 */
export function edgeArrowPosition(target: { x: number; y: number }, inset = 30): { x: number; y: number; angle: number } | undefined {
  const cx = VIEW_WIDTH / 2;
  const cy = VIEW_HEIGHT / 2;
  if (target.x >= 0 && target.x <= VIEW_WIDTH && target.y >= 0 && target.y <= VIEW_HEIGHT) return undefined;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const scale = Math.min((cx - inset) / Math.abs(dx || 1e-9), (cy - inset) / Math.abs(dy || 1e-9));
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
}

/** The arrow itself; `alarm` (2 s after the Phylactery takes damage) makes it flash red. */
export function drawEdgeArrow(ctx: CanvasRenderingContext2D, at: { x: number; y: number; angle: number }, alarm: boolean, now: number): void {
  const red = alarm && Math.floor(now / 150) % 2 === 0;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fillStyle = red ? '#ff4040' : '#b9a3ea';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** "R Repair (2 Bone)" over the building R would repair. `x`, `y` = top-center of its footprint on screen. */
export function drawRepairPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, keyLabel: string, costLabel: string): void {
  const text = costLabel ? `Repair (${costLabel})` : 'Repair';
  ctx.font = '700 11px system-ui, sans-serif';
  const width = 16 + 6 + ctx.measureText(text).width + 8;
  const left = x - width / 2;
  const top = y - 30;
  ctx.fillStyle = 'rgba(12, 10, 16, 0.85)';
  ctx.fillRect(left, top, width, 18);
  ctx.strokeStyle = 'rgba(232, 224, 204, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 3.5, top + 2.5, 13, 13);
  ctx.fillStyle = '#f2ead8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keyLabel, left + 10, top + 9.5);
  ctx.textAlign = 'left';
  ctx.fillText(text, left + 22, top + 9.5);
}

/**
 * "E Harvest" over the corpse E would harvest, or a progress ring while harvesting it.
 * `x`, `y` are the corpse's screen position.
 */
export function drawHarvestPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, progress: number | undefined): void {
  if (progress !== undefined) {
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
    ctx.strokeStyle = '#e8e0cc';
    ctx.stroke();
    return;
  }
  const top = y - 30;
  ctx.font = '700 11px system-ui, sans-serif';
  const textWidth = ctx.measureText('Harvest').width;
  const width = 16 + 6 + textWidth + 8;
  const left = x - width / 2;
  ctx.fillStyle = 'rgba(12, 10, 16, 0.85)';
  ctx.fillRect(left, top, width, 18);
  ctx.strokeStyle = 'rgba(232, 224, 204, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 3.5, top + 2.5, 13, 13);
  ctx.fillStyle = '#f2ead8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + 10, top + 9.5);
  ctx.textAlign = 'left';
  ctx.fillText('Harvest', left + 22, top + 9.5);
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
