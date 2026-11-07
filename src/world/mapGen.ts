// Chunk generation. Each chunk depends only on (seed, chunkX, chunkY), so the world is
// the same whatever order chunks are visited in. GAME_DESIGN.md section 4.1.

import { hashInts, Rng } from '../core/rng';
import {
  CHUNK_SIZE,
  CLEAR_RADIUS,
  COVERAGE_VARIANCE,
  DIRT,
  MARSH,
  PLACEMENT_ATTEMPTS,
  ROCK,
  TILE,
  type TileId,
} from '../data/terrain';

const AREA = CHUNK_SIZE * CHUNK_SIZE;
const NEIGHBORS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Returns the chunk's tiles, row by row: index = localY × CHUNK_SIZE + localX. */
export function generateChunk(seed: number, chunkX: number, chunkY: number): Uint8Array {
  const rng = new Rng(hashInts(seed, chunkX, chunkY));
  const tiles = new Uint8Array(AREA).fill(TILE.grass);
  const originX = chunkX * CHUNK_SIZE;
  const originY = chunkY * CHUNK_SIZE;

  const tileAt = (lx: number, ly: number): number | undefined => tiles[ly * CHUNK_SIZE + lx];
  const inClearZone = (lx: number, ly: number): boolean =>
    Math.max(Math.abs(originX + lx), Math.abs(originY + ly)) <= CLEAR_RADIUS;

  // Rock: small clusters that never touch another cluster, even diagonally, and stay inside
  // the chunk margin. A 4-connected cluster of at most 4 tiles cannot enclose a tile, so rock
  // can never seal off an area.
  const rockLow = ROCK.chunkEdgeMargin;
  const rockHigh = CHUNK_SIZE - 1 - ROCK.chunkEdgeMargin;
  placeFeature(rng, tiles, targetCount(rng, ROCK.coverage), ROCK.clusterMin, ROCK.clusterMax, TILE.rock, (lx, ly) => {
    if (lx < rockLow || lx > rockHigh || ly < rockLow || ly > rockHigh) return false;
    if (inClearZone(lx, ly) || tileAt(lx, ly) !== TILE.grass) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (tileAt(lx + dx, ly + dy) === TILE.rock) return false;
      }
    }
    return true;
  });

  // Marsh: patches on grass, outside the clear zone.
  placeFeature(rng, tiles, targetCount(rng, MARSH.coverage), MARSH.patchMin, MARSH.patchMax, TILE.marsh, (lx, ly) =>
    !inClearZone(lx, ly) && tileAt(lx, ly) === TILE.grass,
  );

  // Dirt: cosmetic patches on whatever is still grass. Allowed in the clear zone.
  placeFeature(rng, tiles, targetCount(rng, DIRT.coverage), DIRT.patchMin, DIRT.patchMax, TILE.dirt, (lx, ly) =>
    tileAt(lx, ly) === TILE.grass,
  );

  return tiles;
}

function targetCount(rng: Rng, coverage: number): number {
  return Math.round(AREA * coverage * rng.range(1 - COVERAGE_VARIANCE, 1 + COVERAGE_VARIANCE));
}

/**
 * Grows clusters from random seed tiles until `target` tiles are placed or attempts run out.
 * A cluster grows one 4-connected neighbor at a time. `allowed` is checked against tiles as
 * they were before the current cluster is written, so it sees earlier clusters only.
 */
function placeFeature(
  rng: Rng,
  tiles: Uint8Array,
  target: number,
  minSize: number,
  maxSize: number,
  tile: TileId,
  allowed: (lx: number, ly: number) => boolean,
): void {
  let placed = 0;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && placed < target; attempt++) {
    const size = Math.min(rng.int(minSize, maxSize), target - placed);
    const startX = rng.int(0, CHUNK_SIZE - 1);
    const startY = rng.int(0, CHUNK_SIZE - 1);
    if (!allowed(startX, startY)) continue;

    const cluster = new Set<number>([startY * CHUNK_SIZE + startX]);
    while (cluster.size < size) {
      const frontier = new Set<number>();
      for (const index of cluster) {
        const x = index % CHUNK_SIZE;
        const y = Math.floor(index / CHUNK_SIZE);
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CHUNK_SIZE || ny >= CHUNK_SIZE) continue;
          const neighbor = ny * CHUNK_SIZE + nx;
          if (!cluster.has(neighbor) && allowed(nx, ny)) frontier.add(neighbor);
        }
      }
      if (frontier.size === 0) break;
      cluster.add(rng.pick([...frontier]));
    }

    for (const index of cluster) tiles[index] = tile;
    placed += cluster.size;
  }
}
