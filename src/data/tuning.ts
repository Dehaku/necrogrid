// Core tuning values. Data only; logic that uses these lives elsewhere.
// GAME_DESIGN.md sections 4, 8 and 15.

/** Pixels per tile in the 1280 × 720 logical view. */
export const TILE_SIZE = 32;

/** Logical view size in pixels. The canvas is letterboxed to this aspect ratio. */
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/** Tiles from the player to a corner of the view. "Beyond view" distances are multiples of this. */
export const VIEW_RADIUS = 23;

/** Simulation ticks per second (fixed timestep). */
export const TICK_RATE = 60;

/** Cap on real elapsed time per frame, in seconds. Time scale is applied after this cap. */
export const MAX_FRAME_TIME = 0.25;

/** Debug time scale choices (section 13). */
export const TIME_SCALES = [1, 2, 5, 10, 20] as const;

export const PLAYER = {
  /** Pixels per second. */
  moveSpeed: 120,
  /** Collision radius in tiles. */
  radius: 0.5,
  /** Starting tile: directly south of the Phylactery (section 10.5). */
  startTile: { x: 0, y: 2 },
} as const;
