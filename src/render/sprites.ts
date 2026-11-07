// Placeholder shapes (GAME_DESIGN.md section 15, placeholder art rule).

import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Camera } from './camera';

const GROUND_COLOR = '#1b1a1f';
const GRID_COLOR = '#26252c';
const ORIGIN_COLOR = '#2e2638';
const PLAYER_COLOR = '#9b7fd1';
const PLAYER_FACING_COLOR = '#e4d8ff';

/** Flat ground with faint tile lines, so camera movement is visible. */
export function drawGround(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const topLeft = camera.screenToWorld(0, 0);
  const minX = Math.floor(topLeft.x);
  const minY = Math.floor(topLeft.y);
  const maxX = Math.ceil(topLeft.x + VIEW_WIDTH / TILE_SIZE);
  const maxY = Math.ceil(topLeft.y + VIEW_HEIGHT / TILE_SIZE);

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
