// Particle and screen-shake values. Data only. GAME_DESIGN.md section 14 (M10).
// Both are purely visual: they never feed back into the simulation.

/** [min, max] ranges are rolled per particle from a visual-only RNG. */
export type Range = readonly [number, number];

export interface BurstDef {
  readonly count: number;
  /** Tiles per second. */
  readonly speed: Range;
  /** Seconds. */
  readonly life: Range;
  /** Pixels (square side). */
  readonly size: Range;
  /** Upward drift in tiles per second (motes), 0 for none. */
  readonly rise: number;
}

export const PARTICLES = {
  /** Live particles never exceed this; the oldest are replaced. */
  max: 900,
  /** Velocity lost per second (fraction), so bursts spread then settle. */
  drag: 3.5,
  /** Enemy death: chunks in the enemy's color, more for bigger corpses. */
  death: {
    small: { count: 8, speed: [1.5, 4.5], life: [0.35, 0.75], size: [2, 3.5], rise: 0 },
    medium: { count: 12, speed: [1.5, 4.5], life: [0.4, 0.85], size: [2, 4], rise: 0 },
    large: { count: 18, speed: [1.2, 4], life: [0.5, 1], size: [2.5, 5], rise: 0 },
  } satisfies Record<'small' | 'medium' | 'large', BurstDef>,
  /** Extra gold sparks when an elite dies. */
  eliteBurst: { count: 10, speed: [2, 5], life: [0.4, 0.8], size: [2, 3], rise: 0 } satisfies BurstDef,
  eliteColor: '#e8c547',
  /** A hit on an enemy: a few bright sparks. */
  hit: { count: 3, speed: [2, 5], life: [0.1, 0.22], size: [1.5, 2.5], rise: 0 } satisfies BurstDef,
  hitColor: '#fff3d6',
  /** A building destroyed: debris in its color. */
  debris: { count: 16, speed: [1, 3.5], life: [0.5, 1.1], size: [2.5, 4.5], rise: 0 } satisfies BurstDef,
  /** A corpse harvested (by hand or Collector): soul motes drifting up. */
  harvest: { count: 7, speed: [0.2, 0.8], life: [0.5, 0.9], size: [1.5, 3], rise: 1.2 } satisfies BurstDef,
  harvestColor: '#c9b8ec',
  /** The Phylactery takes a hit. */
  phylactery: { count: 6, speed: [1.5, 3.5], life: [0.3, 0.6], size: [2, 3], rise: 0 } satisfies BurstDef,
  phylacteryColor: '#b89ae8',
} as const;

/**
 * Screen shake ("trauma" model): hits add trauma (0–1), which decays over time. The offset is
 * maxOffset × trauma², so small hits barely move the view and big ones jolt it.
 */
export const SHAKE = {
  /** Pixels at full trauma. */
  maxOffset: 12,
  /** Trauma lost per second. */
  decay: 1.8,
  /** Wobble speed in Hz. */
  frequency: 22,
  /** The player takes a hit of at least `minDamage` (Brutes, Hellhounds, elites). */
  playerHit: { minDamage: 10, trauma: 0.45 },
  /** The necromancer dies (after completion: respawns). */
  playerDied: 0.8,
  /** A building is destroyed on screen. */
  buildingDestroyed: 0.3,
  /** The Phylactery takes a hit of at least `minDamage` while on screen. */
  phylacteryHit: { minDamage: 15, trauma: 0.3 },
} as const;
