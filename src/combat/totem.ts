// Bone Totem targeting and shots. GAME_DESIGN.md section 10.2.

import { TOTEM } from '../data/buildings';
import { BOLT } from '../data/spells';
import { TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';
import type { Projectile } from '../entities/projectile';

/** The nearest candidate within `range` of `from`, or undefined. */
export function nearestWithin<T extends Point>(from: Point, candidates: readonly T[], range: number): T | undefined {
  let best: T | undefined;
  let bestD2 = range * range;
  for (const c of candidates) {
    const d2 = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = c;
    }
  }
  return best;
}

/** A Totem bolt from `from` toward `target`. It flies like the player's Bolt and passes over buildings. */
export function totemBolt(from: Point, target: Point): Projectile {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = TOTEM.boltSpeed / TILE_SIZE;
  return {
    x: from.x,
    y: from.y,
    prevX: from.x,
    prevY: from.y,
    vx: (dx / d) * speed,
    vy: (dy / d) * speed,
    life: BOLT.lifetime,
    damage: TOTEM.damage,
    radius: BOLT.radius,
    alive: true,
    source: 'totem',
  };
}
