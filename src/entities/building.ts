// Player buildings. GAME_DESIGN.md section 10.2.

import { BUILDINGS, type BuildingDef, type BuildingKind } from '../data/buildings';
import type { ResourceAmounts, ResourceId } from '../data/resources';
import { RESOURCE_ORDER } from '../data/resources';
import { TILE_PROPS, type TileId } from '../data/terrain';
import type { Point } from '../core/input';
import { distanceToFootprint, type Footprint } from '../world/grid';

export interface Building {
  readonly id: number;
  readonly kind: BuildingKind;
  readonly def: BuildingDef;
  readonly footprint: Footprint;
  hp: number;
  readonly maxHp: number;
  /** Starting buildings are free: no refund and no drop. */
  readonly free: boolean;
  /** The player can walk through it (Bone Doors). Enemies never can. */
  readonly playerPassable: boolean;
  /** Seconds until it can act again (Totem shot, Collector harvest). */
  cooldown: number;
  /** Repair paid for but not yet used, per resource (fractions of a unit). */
  repairCredit: Partial<Record<ResourceId, number>>;
}

export function createBuilding(
  id: number,
  kind: BuildingKind,
  x: number,
  y: number,
  free: boolean,
  playerPassable: boolean = BUILDINGS[kind].playerPassable,
): Building {
  const def = BUILDINGS[kind];
  return {
    id,
    kind,
    def,
    footprint: { x, y, w: def.w, h: def.h },
    hp: def.hp,
    maxHp: def.hp,
    free,
    playerPassable,
    cooldown: 0,
    repairCredit: {},
  };
}

export function footprintCenter(fp: Footprint): Point {
  return { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 };
}

/** Top-left tile for a footprint of size w × h centered under the cursor's tile. */
export function footprintAtCursor(cursor: Point, w: number, h: number): Footprint {
  return { x: Math.floor(cursor.x - (w - 1) / 2), y: Math.floor(cursor.y - (h - 1) / 2), w, h };
}

export interface PlacementWorld {
  getTile(tileX: number, tileY: number): TileId | undefined;
  isOccupied(tileX: number, tileY: number): boolean;
  isNoBuildZone(tileX: number, tileY: number): boolean;
  /** Units (the player and enemies) as circles. */
  units(): Iterable<{ x: number; y: number; radius: number }>;
}

/**
 * Why a building cannot go at this footprint, or undefined if it can (section 4.1):
 * every tile must be explored, buildable, free, and outside the no-build zone, and no unit may
 * overlap it. The starting Totem passes `ignoreNoBuildZone`.
 */
export function placementProblem(fp: Footprint, world: PlacementWorld, ignoreNoBuildZone = false): string | undefined {
  for (let y = fp.y; y < fp.y + fp.h; y++) {
    for (let x = fp.x; x < fp.x + fp.w; x++) {
      const tile = world.getTile(x, y);
      if (tile === undefined) return 'Not explored yet';
      if (!TILE_PROPS[tile].buildable) return `Cannot build on ${TILE_PROPS[tile].name}`;
      if (world.isOccupied(x, y)) return 'Something is already built here';
      if (!ignoreNoBuildZone && world.isNoBuildZone(x, y)) return 'Too close to the Phylactery';
    }
  }
  for (const u of world.units()) {
    if (distanceToFootprint(u.x, u.y, fp) < u.radius) return 'Something is standing there';
  }
  return undefined;
}

/** A share of a cost, each resource rounded down (refunds and destruction drops). */
export function shareOf(cost: ResourceAmounts, share: number): ResourceAmounts {
  const out: ResourceAmounts = {};
  for (const id of RESOURCE_ORDER) {
    const n = Math.floor((cost[id] ?? 0) * share);
    if (n > 0) out[id] = n;
  }
  return out;
}
