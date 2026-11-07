// Smoothed steering: separation, turn-rate-limited heading, and terrain collision.
// GAME_DESIGN.md section 15.1.

import { NAV, TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';
import { resolveCircleCollision } from './grid';
import type { SpatialHash } from './spatialHash';

export interface Steerable {
  x: number;
  y: number;
  heading: number;
}

/** Push away from neighbors closer than NAV.separationRadius. Stronger the closer they are. */
export function separation<T extends Point>(self: T, neighbors: SpatialHash<T>, scratch: T[]): Point {
  scratch.length = 0;
  neighbors.queryRadius(self.x, self.y, NAV.separationRadius, scratch);
  let sx = 0;
  let sy = 0;
  for (const other of scratch) {
    if (other === self) continue;
    const dx = self.x - other.x;
    const dy = self.y - other.y;
    const d = Math.hypot(dx, dy);
    const strength = 1 - d / NAV.separationRadius;
    if (d > 1e-6) {
      sx += (dx / d) * strength;
      sy += (dy / d) * strength;
    } else {
      // Exactly stacked: push apart along a direction derived from the pair, so it is deterministic.
      sx += self.x < other.x || (self.x === other.x && self.y < other.y) ? -strength : strength;
    }
  }
  return { x: sx, y: sy };
}

/** Turns `current` toward `desired` by at most `maxStep` radians. */
export function turnToward(current: number, desired: number, maxStep: number): number {
  let delta = desired - current;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) <= maxStep) return desired;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Moves a unit one tick: turn its heading toward the desired direction at the limited
 * turn rate, move at full speed along the heading, then resolve collisions.
 * `desired` of zero length means stand still.
 */
export function steer(
  unit: Steerable,
  desired: Point,
  speedPxPerSecond: number,
  radius: number,
  dt: number,
  isBlocked: ((tileX: number, tileY: number) => boolean) | undefined,
): void {
  const length = Math.hypot(desired.x, desired.y);
  if (length < 1e-3) return;
  const maxTurn = ((NAV.turnRate * Math.PI) / 180) * dt;
  unit.heading = turnToward(unit.heading, Math.atan2(desired.y, desired.x), maxTurn);
  const step = (speedPxPerSecond / TILE_SIZE) * dt;
  let x = unit.x + Math.cos(unit.heading) * step;
  let y = unit.y + Math.sin(unit.heading) * step;
  if (isBlocked) {
    const resolved = resolveCircleCollision(x, y, radius, isBlocked);
    x = resolved.x;
    y = resolved.y;
  }
  unit.x = x;
  unit.y = y;
}
