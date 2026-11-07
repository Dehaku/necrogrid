// Placeholder shapes (GAME_DESIGN.md section 15, placeholder art rule).

import { TILE_PROPS, UNGENERATED_COLOR, type TileId } from '../data/terrain';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Camera } from './camera';

const GRID_COLOR = 'rgba(255, 255, 255, 0.035)';
const ORIGIN_COLOR = 'rgba(155, 127, 209, 0.12)';
const PLAYER_COLOR = '#9b7fd1';
const PLAYER_FACING_COLOR = '#e4d8ff';

/** Anything that can say which tile is where (undefined = not generated). */
export interface TileSource {
  getTile(tileX: number, tileY: number): TileId | undefined;
}

/** Visible tiles, faint tile lines, and a marker where the Phylactery will stand. */
export function drawTerrain(ctx: CanvasRenderingContext2D, camera: Camera, tiles: TileSource): void {
  const topLeft = camera.screenToWorld(0, 0);
  const minX = Math.floor(topLeft.x);
  const minY = Math.floor(topLeft.y);
  const maxX = Math.ceil(topLeft.x + VIEW_WIDTH / TILE_SIZE);
  const maxY = Math.ceil(topLeft.y + VIEW_HEIGHT / TILE_SIZE);

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const tile = tiles.getTile(tx, ty);
      const p = camera.worldToScreen(tx, ty);
      ctx.fillStyle = tile === undefined ? UNGENERATED_COLOR : TILE_PROPS[tile].color;
      // Rounded edges with 1 px overlap so no seams show between tiles at fractional scales.
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      ctx.fillRect(x, y, TILE_SIZE + 1, TILE_SIZE + 1);
    }
  }

  // Mark the 3 × 3 area where the Phylactery will stand (tiles -1..1).
  const origin = camera.worldToScreen(-1, -1);
  ctx.fillStyle = ORIGIN_COLOR;
  ctx.fillRect(origin.x, origin.y, TILE_SIZE * 3, TILE_SIZE * 3);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = minX; x <= maxX; x++) {
    const sx = Math.round(camera.worldToScreen(x, 0).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, VIEW_HEIGHT);
  }
  for (let y = minY; y <= maxY; y++) {
    const sy = Math.round(camera.worldToScreen(0, y).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(VIEW_WIDTH, sy);
  }
  ctx.stroke();
}

/** The necromancer: a square rotated to face the aim direction, with a marker on its front. */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  x: number,
  y: number,
  facing: number,
): void {
  const p = camera.worldToScreen(x, y);
  const half = TILE_SIZE * 0.45;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(facing);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.fillStyle = PLAYER_FACING_COLOR;
  ctx.beginPath();
  ctx.moveTo(half + 6, 0);
  ctx.lineTo(half - 4, -6);
  ctx.lineTo(half - 4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
