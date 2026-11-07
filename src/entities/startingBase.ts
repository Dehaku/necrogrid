// The free starting defense: random walls on the ring 2 tiles out, then one Totem on the
// inner ring. GAME_DESIGN.md section 10.5.

import { STARTING_BASE } from '../data/buildings';
import type { Point } from '../core/input';
import type { Rng } from '../core/rng';
import type { Footprint } from '../world/grid';
import { phylacteryRingTiles } from './phylactery';

/** The tiles exactly `distance` tiles out from a footprint (the border of the grown square). */
export function ringAround(fp: Footprint, distance: number): Point[] {
  const grown: Footprint = { x: fp.x - distance + 1, y: fp.y - distance + 1, w: fp.w + 2 * (distance - 1), h: fp.h + 2 * (distance - 1) };
  return phylacteryRingTiles(grown);
}

export interface StartingBasePlan {
  walls: Point[];
  totem: Point | undefined;
}

/**
 * Plans the starting base. Each wall-ring tile rolls `wallChance` (in a fixed order) and must
 * pass `canPlace`. If every tile got a wall, one random wall is removed so the player is never
 * sealed in. Then the Totem goes on a random free inner-ring tile (right around the
 * Phylactery) that is not the player's. The player can walk through it.
 */
export function planStartingBase(
  rng: Rng,
  phylactery: Footprint,
  playerTile: Point,
  canPlace: (tile: Point) => boolean,
): StartingBasePlan {
  const ring = ringAround(phylactery, STARTING_BASE.wallRingDistance);
  const walls = ring.filter((tile) => rng.chance(STARTING_BASE.wallChance) && canPlace(tile));
  if (walls.length === ring.length) walls.splice(rng.int(0, walls.length - 1), 1);

  const inner = phylacteryRingTiles(phylactery).filter(
    (t) => !(t.x === playerTile.x && t.y === playerTile.y) && canPlace(t),
  );
  const totem = inner.length > 0 ? rng.pick(inner) : undefined;
  return { walls, totem };
}
