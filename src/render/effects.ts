// Short-lived visual effects: enemy attack swipes (section 7), Chain links (section 8.1), and
// floating damage numbers.
// They age with simulation time (advance() is called from the tick), so they freeze while
// paused and speed up with the debug time scale. Purely visual: nothing here feeds back
// into the simulation.

import { CHAIN } from '../data/spells';
import { TILE_SIZE } from '../data/tuning';
import { RESOURCE_ORDER, RESOURCES, type ResourceAmounts } from '../data/resources';
import { COLLECTOR_LINK, DAMAGE_NUMBERS, PICKUP_POPUPS, SWIPE } from '../data/ui';
import type { EventBus, GameEvents } from '../core/events';
import type { Point } from '../core/input';
import { Rng } from '../core/rng';
import type { Camera } from './camera';

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

interface ChainBolt {
  /** Jagged world-space path through every link. */
  path: Point[];
  age: number;
}

/**
 * A jagged path through `points`: each link is split into pieces of about `segmentLength`
 * tiles, and the inner joints are pushed sideways by up to `jitter` tiles. The ends of each
 * link stay on the necromancer and the enemies.
 */
export function jaggedPath(points: readonly Point[], rng: Rng, segmentLength: number = CHAIN.segmentLength, jitter: number = CHAIN.jitter): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const pieces = Math.max(1, Math.round(length / segmentLength));
    const nx = length > 0 ? -dy / length : 0;
    const ny = length > 0 ? dx / length : 0;
    if (i === 0) path.push({ ...a });
    for (let p = 1; p < pieces; p++) {
      const t = p / pieces;
      const off = rng.range(-jitter, jitter);
      path.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    }
    path.push({ ...b });
  }
  return path;
}

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
  private chains: ChainBolt[] = [];
  private popups: Popup[] = [];
  private collectorLinks: ChainBolt[] = [];
  /** Visual-only randomness (chain jaggedness). Separate from the simulation's RNG streams. */
  private readonly visualRng = new Rng(0x7a11);
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
      events.on('chain:cast', (e) => this.chains.push({ path: jaggedPath(e.points, this.visualRng), age: 0 })),
      events.on('collector:collected', (e) =>
        this.collectorLinks.push({
          path: jaggedPath([{ x: e.fromX, y: e.fromY }, { x: e.toX, y: e.toY }], this.visualRng, COLLECTOR_LINK.segmentLength, COLLECTOR_LINK.jitter),
          age: 0,
        }),
      ),
      // "+3 Bone" style lines, one per resource gained: harvests, refunds, and destruction drops.
      events.on('corpse:harvested', (e) => this.popupLoot(e.x, e.y, e.loot)),
      events.on('building:removed', (e) => this.popupLoot(e.x, e.y, e.refund)),
      events.on('building:destroyed', (e) => this.popupLoot(e.x, e.y, e.drop)),
    ];
  }

  private popupLoot(x: number, y: number, loot: ResourceAmounts): void {
    let line = 0;
    for (const id of RESOURCE_ORDER) {
      const n = loot[id];
      if (!n) continue;
      this.popups.push({
        x,
        y: y - 0.5 - line * PICKUP_POPUPS.lineHeight,
        text: `+${n} ${RESOURCES[id].name}`,
        color: RESOURCES[id].color,
        age: 0,
      });
      line++;
    }
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.swipes = [];
    this.numbers = [];
    this.chains = [];
    this.popups = [];
    this.collectorLinks = [];
  }

  advance(dt: number): void {
    for (const s of this.swipes) s.age += dt;
    for (const n of this.numbers) n.age += dt;
    for (const c of this.chains) c.age += dt;
    for (const p of this.popups) p.age += dt;
    for (const l of this.collectorLinks) l.age += dt;
    this.collectorLinks = this.collectorLinks.filter((l) => l.age < COLLECTOR_LINK.fade);
    this.swipes = this.swipes.filter((s) => s.age < SWIPE.duration);
    this.numbers = this.numbers.filter((n) => n.age < DAMAGE_NUMBERS.lifetime);
    this.chains = this.chains.filter((c) => c.age < CHAIN.fade);
    this.popups = this.popups.filter((p) => p.age < PICKUP_POPUPS.lifetime);
  }

  /** Thin gray jagged lines from Collectors to the corpses they just took, fading out. */
  private drawCollectorLinks(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLLECTOR_LINK.color;
    ctx.lineWidth = 1.5;
    for (const l of this.collectorLinks) {
      ctx.globalAlpha = 1 - l.age / COLLECTOR_LINK.fade;
      ctx.beginPath();
      l.path.forEach((p, i) => {
        const s = camera.worldToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    for (const p of this.popups) {
      const t = p.age / PICKUP_POPUPS.lifetime;
      const s = camera.worldToScreen(p.x, p.y - PICKUP_POPUPS.rise * t);
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeText(p.text, s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  /** Chain links: a wide glow under a thin bright core, fading out. Drawn over the lighting, like magic. */
  private drawChains(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const c of this.chains) {
      const alpha = 1 - c.age / CHAIN.fade;
      ctx.beginPath();
      c.path.forEach((p, i) => {
        const s = camera.worldToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = CHAIN.glowColor;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = CHAIN.coreColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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

  /** Chain links and damage numbers, drawn over everything in the world (after lighting). */
  drawOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    this.drawCollectorLinks(ctx, camera);
    this.drawChains(ctx, camera);
    this.drawPopups(ctx, camera);
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
