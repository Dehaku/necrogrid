// Camera: converts between world tiles and logical screen pixels. It follows the player.
// GAME_DESIGN.md section 4.
//
// World coordinates are in tiles. Tile (x, y) covers [x, x + 1) × [y, y + 1), so its
// center is (x + 0.5, y + 0.5). +x is east, +y is south (screen down).

import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';

export class Camera {
  /** World position (tiles) at the center of the view. */
  x = 0;
  y = 0;

  centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx - this.x) * TILE_SIZE + VIEW_WIDTH / 2,
      y: (wy - this.y) * TILE_SIZE + VIEW_HEIGHT / 2,
    };
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - VIEW_WIDTH / 2) / TILE_SIZE + this.x,
      y: (sy - VIEW_HEIGHT / 2) / TILE_SIZE + this.y,
    };
  }
}
