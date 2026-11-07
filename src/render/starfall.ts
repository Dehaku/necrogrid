// Endless-mode night reward: a few gentle diagonal cyan shooting stars, drawn over the night
// darkness. They live in world space (tiles), so they stay put in the sky as the player moves
// rather than following the camera. Purely visual, own RNG, ages with simulation time.

import { STARFALL } from '../data/fx';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import { Rng } from '../core/rng';
import type { Camera } from './camera';

interface Star {
  /** World position and velocity, in tiles and tiles per second. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Trail length in tiles. */
  trail: number;
  age: number;
  life: number;
}

/** Half the view, in tiles. */
const HALF_W = VIEW_WIDTH / TILE_SIZE / 2;
const HALF_H = VIEW_HEIGHT / TILE_SIZE / 2;

export class Starfall {
  stars: Star[] = [];
  private budget = 0;
  private readonly rng = new Rng(0x57a2);

  /**
   * `active`: endless mode. `nightBlend`: 0 by day, 1 at night. `view`: the world point at the
   * center of the view; new stars start around the visible area so they cross it.
   */
  advance(dt: number, active: boolean, nightBlend: number, view: Point): void {
    for (const s of this.stars) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.stars = this.stars.filter((s) => s.age < s.life);
    if (!active || nightBlend <= 0) {
      this.budget = 0;
      return;
    }
    this.budget += STARFALL.rate * nightBlend * dt;
    while (this.budget >= 1) {
      this.budget -= 1;
      if (this.stars.length < STARFALL.maxStars) this.spawn(view);
    }
  }

  clear(): void {
    this.stars = [];
    this.budget = 0;
  }

  private spawn(view: Point): void {
    const speed = 1 + (this.rng.next() * 2 - 1) * STARFALL.speedSpread;
    const vx = (STARFALL.velocity.x * speed) / TILE_SIZE;
    const vy = (STARFALL.velocity.y * speed) / TILE_SIZE;
    const life = this.rng.range(STARFALL.life.min, STARFALL.life.max);
    // Pick where it should be halfway through its life (somewhere in view, a little extra to the
    // sides), then start it back along its path, so it crosses the view while it is bright.
    const midX = view.x + (this.rng.next() * 2 - 1) * HALF_W * 1.1;
    const midY = view.y + (this.rng.next() * 2 - 1) * HALF_H * 0.9;
    this.stars.push({
      x: midX - vx * life * 0.5,
      y: midY - vy * life * 0.5,
      vx,
      vy,
      trail: this.rng.range(STARFALL.trail.min, STARFALL.trail.max) / TILE_SIZE,
      age: 0,
      life,
    });
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.stars.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const t = s.age / s.life;
      // Fade in over the first 15%, out over the last 30%.
      const fade = Math.min(1, t / 0.15, (1 - t) / 0.3);
      const opacity = STARFALL.maxOpacity * Math.max(0, fade);
      const len = Math.hypot(s.vx, s.vy);
      const head = camera.worldToScreen(s.x, s.y);
      const tail = camera.worldToScreen(s.x - (s.vx / len) * s.trail, s.y - (s.vy / len) * s.trail);
      if (Math.max(head.x, tail.x) < -10 || Math.min(head.x, tail.x) > VIEW_WIDTH + 10) continue;
      if (Math.max(head.y, tail.y) < -10 || Math.min(head.y, tail.y) > VIEW_HEIGHT + 10) continue;
      const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      gradient.addColorStop(0, `rgba(${STARFALL.color}, 0)`);
      gradient.addColorStop(1, `rgba(${STARFALL.color}, ${opacity})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${STARFALL.color}, ${opacity})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
