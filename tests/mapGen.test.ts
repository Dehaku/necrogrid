import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CLEAR_RADIUS, TILE, type TileId } from '../src/data/terrain';
import { ChunkMap } from '../src/world/chunks';
import { generateChunk } from '../src/world/mapGen';

function countTiles(map: ChunkMap, min: number, max: number) {
  const counts = new Map<TileId, number>();
  let total = 0;
  for (let y = min; y < max; y++) {
    for (let x = min; x < max; x++) {
      const tile = map.getTile(x, y);
      if (tile === undefined) continue;
      counts.set(tile, (counts.get(tile) ?? 0) + 1);
      total++;
    }
  }
  return { counts, total };
}

/** A map with chunks generated over [-n, n) chunks on both axes. */
function bigMap(seed: number, n: number): ChunkMap {
  const map = new ChunkMap(seed);
  for (let cy = -n; cy < n; cy++) for (let cx = -n; cx < n; cx++) map.generate(cx, cy);
  return map;
}

describe('generateChunk', () => {
  it('gives the same chunk for the same seed and coordinates', () => {
    expect(generateChunk(123, 4, -7)).toEqual(generateChunk(123, 4, -7));
  });

  it('gives different chunks for different seeds or coordinates', () => {
    expect(generateChunk(123, 4, -7)).not.toEqual(generateChunk(124, 4, -7));
    expect(generateChunk(123, 4, -7)).not.toEqual(generateChunk(123, 5, -7));
  });
});

describe('ChunkMap', () => {
  it('builds the same world whatever order chunks are visited in', () => {
    const a = new ChunkMap(99);
    const b = new ChunkMap(99);
    a.ensureAround(0, 0, 46);
    a.ensureAround(200, -150, 46);
    b.ensureAround(200, -150, 46);
    b.ensureAround(0, 0, 46);
    for (let y = -30; y < 30; y++) {
      for (let x = -30; x < 30; x++) expect(a.getTile(x, y)).toBe(b.getTile(x, y));
    }
  });

  it('reports ungenerated tiles as undefined', () => {
    const map = new ChunkMap(1);
    map.generate(0, 0);
    expect(map.getTile(0, 0)).toBeDefined();
    expect(map.getTile(-1, 0)).toBeUndefined();
    expect(map.getTile(CHUNK_SIZE, 0)).toBeUndefined();
  });

  it('generates every chunk within the radius, and only those', () => {
    const map = new ChunkMap(1);
    const created = map.ensureAround(0.5, 2.5, 46);
    expect(created.length).toBe(map.chunkCount);
    // A chunk whose nearest point is just inside the radius exists...
    expect(map.getTile(45, 2)).toBeDefined();
    // ...and one entirely beyond it does not.
    expect(map.getTile(64, 2)).toBeUndefined();
    // Nothing is generated twice.
    expect(map.ensureAround(0.5, 2.5, 46)).toHaveLength(0);
  });
});

describe('terrain rules', () => {
  it('keeps rock and marsh out of the area around the Phylactery', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const map = bigMap(seed, 1);
      for (let y = -CLEAR_RADIUS; y <= CLEAR_RADIUS; y++) {
        for (let x = -CLEAR_RADIUS; x <= CLEAR_RADIUS; x++) {
          const tile = map.getTile(x, y);
          expect(tile === TILE.grass || tile === TILE.dirt).toBe(true);
        }
      }
    }
  });

  it('matches the coverage targets on average', () => {
    const map = bigMap(2024, 10);
    const { counts, total } = countTiles(map, -160, 160);
    const share = (tile: TileId) => (counts.get(tile) ?? 0) / total;
    expect(share(TILE.rock)).toBeGreaterThan(0.03);
    expect(share(TILE.rock)).toBeLessThan(0.05);
    expect(share(TILE.marsh)).toBeGreaterThan(0.045);
    expect(share(TILE.marsh)).toBeLessThan(0.075);
    expect(share(TILE.dirt)).toBeGreaterThan(0.16);
    expect(share(TILE.dirt)).toBeLessThan(0.24);
  });

  it('only makes rock clusters of 1 to 4 tiles, never touching each other', () => {
    const map = bigMap(777, 6);
    const seen = new Set<string>();
    const isRock = (x: number, y: number) => map.getTile(x, y) === TILE.rock;
    for (let y = -96; y < 96; y++) {
      for (let x = -96; x < 96; x++) {
        if (!isRock(x, y) || seen.has(`${x},${y}`)) continue;
        // 8-connected flood fill: any touching rock counts as the same cluster.
        let size = 0;
        const stack = [[x, y] as const];
        seen.add(`${x},${y}`);
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          size++;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const k = `${cx + dx},${cy + dy}`;
              if (isRock(cx + dx, cy + dy) && !seen.has(k)) {
                seen.add(k);
                stack.push([cx + dx, cy + dy]);
              }
            }
          }
        }
        expect(size).toBeLessThanOrEqual(4);
      }
    }
  });
});
