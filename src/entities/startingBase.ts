// The free starting defense: random walls on the ring 2 tiles out, then a Totem and a Corpse
// Collector on that same ring, which take priority over walls. GAME_DESIGN.md section 10.5.

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
  collector: Point | undefined;
}

const same = (a: Point, b: Point | undefined) => b !== undefined && a.x === b.x && a.y === b.y;

/**
 * Plans the starting base on the wall ring:
 * 1. Each ring tile rolls `wallChance` (in a fixed order) for a wall, if `canPlace` allows.
 * 2. The Totem, then the Collector, each take a random ring tile (different ones). They come
 *    after the walls and take priority: a wall on their tile is dropped.
 * 3. If the ring is now completely closed, one random wall is removed, so the player is never
 *    sealed in.
 */
export function planStartingBase(
  rng: Rng,
  phylactery: Footprint,
  _playerTile: Point,
  canPlace: (tile: Point) => boolean,
): StartingBasePlan {
  const ring = ringAround(phylactery, STARTING_BASE.wallRingDistance);
  let walls = ring.filter((tile) => rng.chance(STARTING_BASE.wallChance) && canPlace(tile));

  const open = ring.filter((t) => canPlace(t));
  const totem = open.length > 0 ? rng.pick(open) : undefined;
  const rest = open.filter((t) => !same(t, totem));
  const collector = rest.length > 0 ? rng.pick(rest) : undefined;
  walls = walls.filter((w) => !same(w, totem) && !same(w, collector));

  const occupied = walls.length + (totem ? 1 : 0) + (collector ? 1 : 0);
  if (occupied === ring.length && walls.length > 0) walls.splice(rng.int(0, walls.length - 1), 1);
  return { walls, totem, collector };
}
