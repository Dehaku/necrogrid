// Short-lived visual effects: enemy attack swipes (section 7) and floating damage numbers.
// They age with simulation time (advance() is called from the tick), so they freeze while
// paused and speed up with the debug time scale. Purely visual: nothing here feeds back
// into the simulation.

import { TILE_SIZE } from '../data/tuning';
import { DAMAGE_NUMBERS, SWIPE } from '../data/ui';
import type { EventBus, GameEvents } from '../core/events';
import type { Camera } from './camera';

interface Swipe {
  x: number;
  y: number;
  angle: number;
  size: number;
  elite: boolean;
  age: number;
}

interface DamageNumber {
  x: number;
  y: number;
  text: string;
  age: number;
}

const DEG = Math.PI / 180;

export interface SwipeSlice {
  /** Angles relative to the swipe's aim direction, in radians; from < to. */
  from: number;
  to: number;
  opacity: number;
}

/**
 * The swipe at progress t (0–1) as slices of arc. The bright leading edge sweeps forward
 * across the span (clockwise) during the first `headTravel` of the duration; behind it a
 * trail fades to nothing over `trailSpan` degrees. Once the edge reaches the far side, the
 * whole swipe fades out.
 */
export function swipeSlices(t: number): SwipeSlice[] {
  const half = (SWIPE.span / 2) * DEG;
  const head = -half + SWIPE.span * DEG * Math.min(1, t / SWIPE.headTravel);
  const tail = Math.max(-half, head - SWIPE.trailSpan * DEG);
  const fadeOut = t <= SWIPE.headTravel ? 1 : Math.max(0, 1 - (t - SWIPE.headTravel) / (1 - SWIPE.headTravel));
  const slices: SwipeSlice[] = [];
  const n = SWIPE.trailSlices;
  const width = (head - tail) / n;
  if (width <= 0) return slices;
  for (let i = 0; i < n; i++) {
    // i = n − 1 is the slice at the leading edge (brightest).
    const brightness = (i + 1) / n;
    slices.push({
      from: tail + width * i,
      to: tail + width * (i + 1),
      opacity: SWIPE.startOpacity * brightness * fadeOut,
    });
  }
  return slices;
}

export class Effects {
  private swipes: Swipe[] = [];
  private numbers: DamageNumber[] = [];
  private unsubscribe: (() => void)[] = [];
  /** Settings toggle (M6). */
  showDamageNumbers = true;

  /** Listen to a run's events. Replaces any earlier run. */
  attach(events: EventBus<GameEvents>): void {
    this.detach();
    this.unsubscribe = [
      events.on('enemy:attacked', (e) => this.swipes.push({ ...e, age: 0 })),
      events.on('enemy:damaged', (e) =>
        this.numbers.push({ x: e.x, y: e.y - 0.4, text: String(Math.round(e.amount)), age: 0 }),
      ),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.swipes = [];
    this.numbers = [];
  }

  advance(dt: number): void {
    for (const s of this.swipes) s.age += dt;
    for (const n of this.numbers) n.age += dt;
    this.swipes = this.swipes.filter((s) => s.age < SWIPE.duration);
    this.numbers = this.numbers.filter((n) => n.age < DAMAGE_NUMBERS.lifetime);
  }

  /** Swipes, drawn with the world (before lighting). */
  drawWorld(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const s of this.swipes) {
      const t = s.age / SWIPE.duration;
      const offset = s.size * SWIPE.offsetPerSize + SWIPE.offsetBase;
      const center = camera.worldToScreen(s.x + Math.cos(s.angle) * offset, s.y + Math.sin(s.angle) * offset);
      const outer = SWIPE.radiusBase * (s.size / SWIPE.radiusSizeRef) * TILE_SIZE;
      const inner = outer * SWIPE.innerRatio;
      ctx.fillStyle = s.elite ? SWIPE.eliteColor : SWIPE.color;
      for (const slice of swipeSlices(t)) {
        ctx.globalAlpha = slice.opacity;
        ctx.beginPath();
        ctx.arc(center.x, center.y, outer, s.angle + slice.from, s.angle + slice.to);
        ctx.arc(center.x, center.y, inner, s.angle + slice.to, s.angle + slice.from, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Damage numbers, drawn over everything in the world (after lighting). */
  drawOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!this.showDamageNumbers) return;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    for (const n of this.numbers) {
      const t = n.age / DAMAGE_NUMBERS.lifetime;
      const p = camera.worldToScreen(n.x, n.y - DAMAGE_NUMBERS.rise * t);
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeText(n.text, p.x, p.y);
      ctx.fillStyle = DAMAGE_NUMBERS.color;
      ctx.fillText(n.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
