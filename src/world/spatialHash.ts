// Neighbor queries: "what is within radius R of this point?" GAME_DESIGN.md section 15.1.

import { tileKey } from './grid';

export interface Positioned {
  x: number;
  y: number;
}

export class SpatialHash<T extends Positioned> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const key = tileKey(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    const cell = this.cells.get(key);
    if (cell) cell.push(item);
    else this.cells.set(key, [item]);
  }

  /** Items whose position is within `radius` of (x, y), appended to `out`. */
  queryRadius(x: number, y: number, radius: number, out: T[] = []): T[] {
    const r2 = radius * radius;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.cells.get(tileKey(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }
}
