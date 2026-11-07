// Tile types and map generation tuning. Data only.
// GAME_DESIGN.md section 4.1.

import { VIEW_RADIUS } from './tuning';

export const TILE = {
  grass: 0,
  dirt: 1,
  rock: 2,
  marsh: 3,
} as const;

export type TileId = (typeof TILE)[keyof typeof TILE];

export interface TileProps {
  readonly name: string;
  readonly walkable: boolean;
  readonly buildable: boolean;
  /** Multiplies the player's move speed while standing on this tile. Demons ignore it. */
  readonly playerSpeedMultiplier: number;
  readonly color: string;
}

export const TILE_PROPS: Readonly<Record<TileId, TileProps>> = {
  [TILE.grass]: { name: 'grass', walkable: true, buildable: true, playerSpeedMultiplier: 1, color: '#1f2620' },
  [TILE.dirt]: { name: 'dirt', walkable: true, buildable: true, playerSpeedMultiplier: 1, color: '#2a2521' },
  [TILE.rock]: { name: 'rock', walkable: false, buildable: false, playerSpeedMultiplier: 1, color: '#55505c' },
  [TILE.marsh]: { name: 'marsh', walkable: true, buildable: false, playerSpeedMultiplier: 0.5, color: '#1e3833' },
};

/** Drawn where no chunk has been generated yet. */
export const UNGENERATED_COLOR = '#000000';

/** Chunks are CHUNK_SIZE × CHUNK_SIZE tiles. */
export const CHUNK_SIZE = 16;

/** A chunk is generated when any part of it comes within this many tiles of the player. */
export const CHUNK_GENERATION_RADIUS = 2 * VIEW_RADIUS;

/** No rock or marsh within this many tiles (square distance) of the Phylactery's center tile. */
export const CLEAR_RADIUS = 6;

/**
 * Each chunk's target tile count for a feature is 256 × coverage × a random factor in
 * [1 − coverageVariance, 1 + coverageVariance], so chunks vary but the average matches.
 * Features are placed in this order: rock, then marsh, then dirt on what is still grass.
 */
export const COVERAGE_VARIANCE = 0.5;

export const ROCK = {
  coverage: 0.04,
  clusterMin: 1,
  clusterMax: 4,
  /** Rock stays this many tiles inside its chunk, so clusters in neighboring chunks never touch. */
  chunkEdgeMargin: 1,
} as const;

export const MARSH = {
  coverage: 0.06,
  patchMin: 3,
  patchMax: 8,
} as const;

export const DIRT = {
  coverage: 0.2,
  patchMin: 4,
  patchMax: 12,
} as const;

/** Random seed tiles tried per feature per chunk before giving up on reaching the target. */
export const PLACEMENT_ATTEMPTS = 60;
