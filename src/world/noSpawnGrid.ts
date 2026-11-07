// Per-tile counters marking where buildings block spawning. GAME_DESIGN.md section 6.
// A building raises every tile within its no-spawn radius of its footprint by 1 when placed
// and lowers them by 1 when removed. Counters (not flags) keep overlapping radii correct.
// The map is sparse and separate from chunks, so a radius can reach ungenerated chunks.

import { tileKey, type Footprint } from './grid';

export class NoSpawnGrid {
  private readonly counts = new Map<number, number>();

  add(fp: Footprint, radius: number): void {
    this.forEachTile(fp, radius, (key) => this.counts.set(key, (this.counts.get(key) ?? 0) + 1));
  }

  remove(fp: Footprint, radius: number): void {
    this.forEachTile(fp, radius, (key) => {
      const next = (this.counts.get(key) ?? 0) - 1;
      if (next > 0) this.counts.set(key, next);
      else this.counts.delete(key);
    });
  }

  isBlocked(tileX: number, tileY: number): boolean {
    return this.counts.has(tileKey(tileX, tileY));
  }

  /** For tests and the debug overlay. */
  countAt(tileX: number, tileY: number): number {
    return this.counts.get(tileKey(tileX, tileY)) ?? 0;
  }

  private forEachTile(fp: Footprint, radius: number, fn: (key: number) => void): void {
    for (let y = fp.y - radius; y < fp.y + fp.h + radius; y++) {
      for (let x = fp.x - radius; x < fp.x + fp.w + radius; x++) fn(tileKey(x, y));
    }
  }
}
