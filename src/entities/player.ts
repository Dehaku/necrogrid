// The necromancer. M0: movement and facing only (GAME_DESIGN.md section 8).

import { PLAYER, TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';

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

/** Creates the player standing on the center of a tile. */
export function createPlayer(tileX: number, tileY: number): Player {
  const x = tileX + 0.5;
  const y = tileY + 0.5;
  return { x, y, prevX: x, prevY: y, facing: -Math.PI / 2 };
}

/** One simulation tick: move at constant speed (diagonals are not faster) and face the aim point. */
export function updatePlayer(player: Player, move: MoveIntent, aim: Point, dt: number): void {
  player.prevX = player.x;
  player.prevY = player.y;

  const dx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const dy = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    const tilesPerSecond = PLAYER.moveSpeed / TILE_SIZE;
    player.x += (dx / length) * tilesPerSecond * dt;
    player.y += (dy / length) * tilesPerSecond * dt;
  }

  const ax = aim.x - player.x;
  const ay = aim.y - player.y;
  if (ax !== 0 || ay !== 0) player.facing = Math.atan2(ay, ax);
}
