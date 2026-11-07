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

/** Endless mode reward: gentle diagonal cyan shooting stars at night (screen space). */
export const STARFALL = {
  /** Stars per second at full night (scaled by the night blend at dusk and dawn). */
  rate: 1.2,
  /** Never more than this many at once ("just a few"). */
  maxStars: 5,
  /** Pixels per second: drifting down and to the left. */
  velocity: { x: -150, y: 230 },
  /** Random ± spread on speed (fraction). */
  speedSpread: 0.25,
  /** Trail length in pixels. */
  trail: { min: 40, max: 80 },
  /** Seconds each star lives (it fades in and out). */
  life: { min: 1.6, max: 2.6 },
  color: '127, 243, 255',
  maxOpacity: 0.85,
} as const;

/**
 * The Phylactery's soft pulse. Still until the final day; through that day's countdown it
 * quickens from `startHz` to `endHz`, then settles to a calm `boundHz` glow in endless mode.
 */
export const PHYLACTERY_PULSE = {
  startHz: 0.4,
  endHz: 2,
  boundHz: 0.35,
  glowRgb: '200, 170, 255',
  /** Opacity of the inner glow at the top of a pulse. */
  glowMax: 0.4,
  /** Glow blur around the edge in pixels, at rest and at the top of a pulse. */
  haloMin: 4,
  haloMax: 18,
  /** At night it lights a small area: this many tiles at rest, plus `lightPulse` at the top of a pulse. */
  lightRadius: 2.2,
  lightPulse: 1.2,
  timerColor: '#ffcf5a',
} as const;
