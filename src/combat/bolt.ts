// Bolt: casting and flight. GAME_DESIGN.md section 8.1.
// A bolt hits the first enemy along its path, or stops at rock (or ungenerated ground).
// It passes over the player's own buildings. Enemies are checked before rock, so an enemy
// hovering over rock can still be hit.

import { BOLT } from '../data/spells';
import { TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';
import { baseStats, type Stats } from '../core/stats';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';

/** Casts a bolt toward `aim` if cooldown and mana allow. Damage, cooldown, and cost come from `stats` (gear). */
export function tryCastBolt(player: Player, aim: Point, stats: Stats = baseStats()): Projectile | undefined {
  if (player.boltCooldown > 0 || player.mana < stats.boltManaCost) return undefined;
  let dx = aim.x - player.x;
  let dy = aim.y - player.y;
  let length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    dx = Math.cos(player.facing);
    dy = Math.sin(player.facing);
    length = 1;
  }
  dx /= length;
  dy /= length;
  player.mana -= stats.boltManaCost;
  player.boltCooldown = stats.boltCooldown;
  const speed = BOLT.speed / TILE_SIZE;
  const x = player.x + dx * BOLT.spawnOffset;
  const y = player.y + dy * BOLT.spawnOffset;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    vx: dx * speed,
    vy: dy * speed,
    life: BOLT.lifetime,
    damage: stats.boltDamage,
    radius: BOLT.radius,
    alive: true,
  };
}

export interface BoltTarget {
  x: number;
  y: number;
  /** Hit radius in tiles. */
  radius: number;
}

/**
 * Where along the segment from (x0, y0) to (x1, y1) a circle of radius `r` around `c`
 * is first touched: 0 at the start, 1 at the end, or undefined if never.
 */
export function segmentCircleHit(x0: number, y0: number, x1: number, y1: number, c: Point, r: number): number | undefined {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - c.x;
  const fy = y0 - c.y;
  const a = dx * dx + dy * dy;
  const c2 = fx * fx + fy * fy - r * r;
  if (c2 <= 0) return 0;
  if (a < 1e-12) return undefined;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c2;
  if (disc < 0) return undefined;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : undefined;
}

/**
 * Moves a bolt one tick. Returns the target it hit (the earliest along its path), if any.
 * `candidates` are the possible targets near the bolt; `isSolid` says where bolts stop.
 */
export function stepBolt<T extends BoltTarget>(
  bolt: Projectile,
  dt: number,
  candidates: readonly T[],
  isSolid: (tileX: number, tileY: number) => boolean,
): T | undefined {
  bolt.prevX = bolt.x;
  bolt.prevY = bolt.y;
  const x1 = bolt.x + bolt.vx * dt;
  const y1 = bolt.y + bolt.vy * dt;

  let hit: T | undefined;
  let hitT = Infinity;
  for (const target of candidates) {
    const t = segmentCircleHit(bolt.x, bolt.y, x1, y1, target, target.radius + bolt.radius);
    if (t !== undefined && t < hitT) {
      hitT = t;
      hit = target;
    }
  }
  if (hit) {
    bolt.x += (x1 - bolt.x) * hitT;
    bolt.y += (y1 - bolt.y) * hitT;
    bolt.alive = false;
    return hit;
  }

  // Rock check in small steps along the segment, so a fast bolt cannot skip a 1-tile rock.
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - bolt.x, y1 - bolt.y) / 0.25));
  for (let s = 1; s <= steps; s++) {
    const px = bolt.x + ((x1 - bolt.x) * s) / steps;
    const py = bolt.y + ((y1 - bolt.y) * s) / steps;
    if (isSolid(Math.floor(px), Math.floor(py))) {
      bolt.x = px;
      bolt.y = py;
      bolt.alive = false;
      return undefined;
    }
  }

  bolt.x = x1;
  bolt.y = y1;
  bolt.life -= dt;
  if (bolt.life <= 0) bolt.alive = false;
  return undefined;
}
