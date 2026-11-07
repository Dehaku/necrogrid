// Chunk storage and the generation radius. Generated chunks are kept for the whole run.
// GAME_DESIGN.md section 4.1.

import { CHUNK_SIZE, type TileId } from '../data/terrain';
import { generateChunk } from './mapGen';

export interface Chunk {
  readonly chunkX: number;
  readonly chunkY: number;
  /** Row by row: index = localY × CHUNK_SIZE + localX. */
  readonly tiles: Uint8Array;
}

/** The chunk coordinate that contains a tile coordinate. */
export function chunkCoord(tile: number): number {
  return Math.floor(tile / CHUNK_SIZE);
}

/** Numeric key so lookups never allocate (getTile runs tens of thousands of times per tick). */
function key(chunkX: number, chunkY: number): number {
  return (chunkX + 0x8000) * 0x10000 + (chunkY + 0x8000);
}

export class ChunkMap {
  private readonly chunks = new Map<number, Chunk>();

  constructor(readonly seed: number) {}

  get chunkCount(): number {
    return this.chunks.size;
  }

  getChunk(chunkX: number, chunkY: number): Chunk | undefined {
    return this.chunks.get(key(chunkX, chunkY));
  }

  /** The tile at a tile coordinate, or undefined if its chunk has not been generated. */
  getTile(tileX: number, tileY: number): TileId | undefined {
    const chunkX = chunkCoord(tileX);
    const chunkY = chunkCoord(tileY);
    const chunk = this.chunks.get(key(chunkX, chunkY));
    if (!chunk) return undefined;
    const localX = tileX - chunkX * CHUNK_SIZE;
    const localY = tileY - chunkY * CHUNK_SIZE;
    return chunk.tiles[localY * CHUNK_SIZE + localX] as TileId;
  }

  /**
   * Changes one tile (terrain edits such as player-made marsh). Returns false if the tile's
   * chunk has not been generated. Changes are kept for the run like everything else in a chunk.
   */
  setTile(tileX: number, tileY: number, tile: TileId): boolean {
    const chunkX = chunkCoord(tileX);
    const chunkY = chunkCoord(tileY);
    const chunk = this.chunks.get(key(chunkX, chunkY));
    if (!chunk) return false;
    chunk.tiles[(tileY - chunkY * CHUNK_SIZE) * CHUNK_SIZE + (tileX - chunkX * CHUNK_SIZE)] = tile;
    return true;
  }

  /** Generates one chunk if it does not exist yet. Returns it if it was new. */
  generate(chunkX: number, chunkY: number): Chunk | undefined {
    const k = key(chunkX, chunkY);
    if (this.chunks.has(k)) return undefined;
    const chunk: Chunk = { chunkX, chunkY, tiles: generateChunk(this.seed, chunkX, chunkY) };
    this.chunks.set(k, chunk);
    return chunk;
  }

  /**
   * Generates every chunk with any part within `radius` tiles of world point (x, y).
   * Returns the chunks that were newly generated.
   */
  ensureAround(x: number, y: number, radius: number): Chunk[] {
    const created: Chunk[] = [];
    const minX = chunkCoord(Math.floor(x - radius));
    const maxX = chunkCoord(Math.floor(x + radius));
    const minY = chunkCoord(Math.floor(y - radius));
    const maxY = chunkCoord(Math.floor(y + radius));
    for (let chunkY = minY; chunkY <= maxY; chunkY++) {
      for (let chunkX = minX; chunkX <= maxX; chunkX++) {
        const left = chunkX * CHUNK_SIZE;
        const top = chunkY * CHUNK_SIZE;
        const nearestX = Math.min(Math.max(x, left), left + CHUNK_SIZE);
        const nearestY = Math.min(Math.max(y, top), top + CHUNK_SIZE);
        if (Math.hypot(x - nearestX, y - nearestY) > radius) continue;
        const chunk = this.generate(chunkX, chunkY);
        if (chunk) created.push(chunk);
      }
    }
    return created;
  }
}
