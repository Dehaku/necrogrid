// Grid queries and circle-vs-tile collision. GAME_DESIGN.md section 4.1 (collision).

import { TILE_PROPS, type TileId } from '../data/terrain';
import type { Point } from '../core/input';

/** Ungenerated tiles (undefined) are not walkable. */
export function isWalkableTile(tile: TileId | undefined): boolean {
  return tile !== undefined && TILE_PROPS[tile].walkable;
}

/** Player speed multiplier for a tile. Ungenerated counts as 1 (the player cannot stand there anyway). */
export function playerSpeedMultiplier(tile: TileId | undefined): number {
  return tile === undefined ? 1 : TILE_PROPS[tile].playerSpeedMultiplier;
}

/**
 * Pushes a circle out of every blocked tile it overlaps, so it slides along walls instead
 * of sticking. Repeats a few times so corners between several tiles resolve cleanly.
 */
export function resolveCircleCollision(
  x: number,
  y: number,
  radius: number,
  isBlocked: (tileX: number, tileY: number) => boolean,
  iterations = 4,
): Point {
  const r2 = radius * radius;
  for (let i = 0; i < iterations; i++) {
    let moved = false;
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius);
    const maxY = Math.floor(y + radius);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!isBlocked(tx, ty)) continue;
        const nearestX = Math.min(Math.max(x, tx), tx + 1);
        const nearestY = Math.min(Math.max(y, ty), ty + 1);
        const dx = x - nearestX;
        const dy = y - nearestY;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (radius - d);
          y += (dy / d) * (radius - d);
        } else {
          // Center is inside the tile: leave through the nearest edge.
          const toLeft = x - tx;
          const toRight = tx + 1 - x;
          const toTop = y - ty;
          const toBottom = ty + 1 - y;
          const least = Math.min(toLeft, toRight, toTop, toBottom);
          if (least === toLeft) x = tx - radius;
          else if (least === toRight) x = tx + 1 + radius;
          else if (least === toTop) y = ty - radius;
          else y = ty + 1 + radius;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}
