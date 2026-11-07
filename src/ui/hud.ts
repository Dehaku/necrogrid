// HUD drawn in screen space after the world. GAME_DESIGN.md section 8.4.
// M2: the day ring.

import { DAY_CYCLE, DAY_RING } from '../data/time';
import { VIEW_WIDTH } from '../data/tuning';
import type { CycleState } from '../time/dayCycle';

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
