// Which tiles buildings occupy. Used by collision, flow fields, and spawn checks.
// GAME_DESIGN.md sections 4.1 and 15.1.

import { tileKey, type Footprint } from './grid';

export class BuildingGrid {
  private readonly tiles = new Map<number, number>();
  /** Goes up on every change, so flow fields know to rebuild. */
  version = 0;

  place(buildingId: number, fp: Footprint): void {
    for (let y = fp.y; y < fp.y + fp.h; y++) {
      for (let x = fp.x; x < fp.x + fp.w; x++) this.tiles.set(tileKey(x, y), buildingId);
    }
    this.version++;
  }

  remove(fp: Footprint): void {
    for (let y = fp.y; y < fp.y + fp.h; y++) {
      for (let x = fp.x; x < fp.x + fp.w; x++) this.tiles.delete(tileKey(x, y));
    }
    this.version++;
  }

  buildingAt(tileX: number, tileY: number): number | undefined {
    return this.tiles.get(tileKey(tileX, tileY));
  }

  has(tileX: number, tileY: number): boolean {
    return this.tiles.has(tileKey(tileX, tileY));
  }
}
