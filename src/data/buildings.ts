// Building values. Data only. GAME_DESIGN.md sections 6 (no-spawn radius) and 10.
// M3 has only the Phylactery placeholder; the six player buildings arrive in M7.

/**
 * Terrain edits (section 10.2, keys 7 and 8). Costs are paid once resources exist (M6) and
 * the actions are placed from build mode (M7). Neither is refunded.
 */
export const TERRAIN_EDITS = {
  /** Turn a grass or dirt tile into marsh. */
  marsh: { cost: { flesh: 10, ichor: 1 } },
  /** Fill any marsh tile, wild or player-made, into dirt. */
  fill: { cost: { bone: 5, flesh: 5 } },
} as const;

/** Tiles past each footprint edge where enemies cannot spawn, unless a building says otherwise. */
export const DEFAULT_NO_SPAWN_RADIUS = 3;

export const PHYLACTERY = {
  /** Footprint in tiles: 3 × 3 centered on tile (0, 0). */
  footprint: { x: -1, y: -1, w: 3, h: 3 },
  hp: 600,
  /**
   * Whether reaching 0 HP ends the run (section 11). Off until M9, so M4–M8 can be played
   * and tested before the starting walls, Totem, and repairs (M7) exist. Turn on in M9.
   */
  destructionEndsRun: false,
  noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS,
  color: '#3d2a55',
  edgeColor: '#9b7fd1',
} as const;
