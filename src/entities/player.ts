// The necromancer. M1: movement, facing, terrain collision, and marsh slow (GAME_DESIGN.md section 8).

import { PLAYER, TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';
import { resolveCircleCollision } from '../world/grid';

export interface Player {
  /** World position in tiles. */
  x: number;
  y: number;
  /** Position at the start of the current tick, for render interpolation. */
  prevX: number;
  prevY: number;
  /** Aim direction in radians (0 = east, +π/2 = south). */
  facing: number;
}

export interface MoveIntent {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** What the player needs to know about the ground under and around it. */
export interface PlayerTerrain {
  /** Speed multiplier for the tile at a world position (marsh slows). */
  speedMultiplierAt(x: number, y: number): number;
  /** True if the player cannot enter this tile. */
  isBlocked(tileX: number, tileY: number): boolean;
}

/** Creates the player standing on the center of a tile. */
export function createPlayer(tileX: number, tileY: number): Player {
  const x = tileX + 0.5;
  const y = tileY + 0.5;
  return { x, y, prevX: x, prevY: y, facing: -Math.PI / 2 };
}

/**
 * One simulation tick: move at constant speed (diagonals are not faster), slowed by the
 * tile underfoot, slide along blocked tiles, and face the aim point.
 */
export function updatePlayer(
  player: Player,
  move: MoveIntent,
  aim: Point,
  dt: number,
  terrain: PlayerTerrain,
): void {
  player.prevX = player.x;
  player.prevY = player.y;

  const dx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const dy = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    const tilesPerSecond = (PLAYER.moveSpeed / TILE_SIZE) * terrain.speedMultiplierAt(player.x, player.y);
    const resolved = resolveCircleCollision(
      player.x + (dx / length) * tilesPerSecond * dt,
      player.y + (dy / length) * tilesPerSecond * dt,
      PLAYER.radius,
      (tx, ty) => terrain.isBlocked(tx, ty),
    );
    player.x = resolved.x;
    player.y = resolved.y;
  }

  const ax = aim.x - player.x;
  const ay = aim.y - player.y;
  if (ax !== 0 || ay !== 0) player.facing = Math.atan2(ay, ax);
}
