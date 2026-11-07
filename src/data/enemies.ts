// Enemy roster and elite values. Data only. GAME_DESIGN.md section 7.
// Adding an enemy means adding one entry here (and to SPAWN.activeRoster once it works).

export type EnemyId = 'imp' | 'shambler' | 'brute' | 'wraith' | 'hellhound';
export type EnemyShape = 'triangle' | 'circle' | 'square' | 'diamond' | 'hexagon';
export type CorpseSize = 'small' | 'medium' | 'large';
export type MovementProfile = 'ground' | 'flying';

export interface EnemyDef {
  readonly id: EnemyId;
  readonly name: string;
  readonly hp: number;
  /** Pixels per second. */
  readonly speed: number;
  readonly damage: number;
  /** Seconds between attacks. */
  readonly attackInterval: number;
  readonly attack: 'melee' | 'ranged';
  /** Attack range in tiles, center to center. */
  readonly range: number;
  /** Collision radius in tiles. */
  readonly radius: number;
  /** Half the drawn shape's size, in tiles. Visual only. */
  readonly drawSize: number;
  readonly spawnWeightDay: number;
  readonly spawnWeightNight: number;
  readonly minDay: number;
  readonly movement: MovementProfile;
  /** Pixels per second, ranged enemies only. */
  readonly projectileSpeed?: number;
  readonly corpseSize: CorpseSize;
  readonly color: string;
  readonly shape: EnemyShape;
  /** Damage multiplier against buildings. */
  readonly buildingDamageMultiplier: number;
  /**
   * How a ground enemy finds its way: 'field' follows the flow fields around obstacles;
   * 'direct' walks straight at its target and attacks whatever building is in the way.
   * Flying enemies always go direct.
   */
  readonly navigation: 'field' | 'direct';
  /** Optional sway in the heading: up to `strength` radians either side, `speed` sways per second. */
  readonly wiggle?: { readonly strength: number; readonly speed: number };
  /** Seconds to fade in after spawning; meanwhile it cannot move, attack, or be hit. */
  readonly fadeIn?: number;
}

/** Melee range in tiles, center to center (section 7). */
export const MELEE_RANGE = 2;

export const ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = {
  imp: {
    id: 'imp', name: 'Imp', hp: 10, speed: 90, damage: 4, attackInterval: 0.8, attack: 'melee',
    range: MELEE_RANGE, radius: 0.5, drawSize: 0.32, spawnWeightDay: 60, spawnWeightNight: 0, minDay: 1,
    movement: 'ground', corpseSize: 'small', color: '#d64545', shape: 'triangle', buildingDamageMultiplier: 1,
    navigation: 'field',
  },
  shambler: {
    id: 'shambler', name: 'Shambler', hp: 25, speed: 45, damage: 6, attackInterval: 1.2, attack: 'melee',
    range: MELEE_RANGE, radius: 0.5, drawSize: 0.42, spawnWeightDay: 30, spawnWeightNight: 40, minDay: 1,
    movement: 'ground', corpseSize: 'medium', color: '#5d9c4a', shape: 'circle', buildingDamageMultiplier: 1,
    // Dumb: no pathfinding, and a shambling sway.
    navigation: 'direct', wiggle: { strength: 0.55, speed: 0.7 },
  },
  brute: {
    id: 'brute', name: 'Brute', hp: 90, speed: 30, damage: 18, attackInterval: 2.0, attack: 'melee',
    range: MELEE_RANGE, radius: 0.5, drawSize: 0.6, spawnWeightDay: 8, spawnWeightNight: 20, minDay: 1,
    movement: 'ground', corpseSize: 'large', color: '#5a3a33', shape: 'square', buildingDamageMultiplier: 2,
    navigation: 'field',
  },
  wraith: {
    id: 'wraith', name: 'Wraith', hp: 40, speed: 70, damage: 8, attackInterval: 2.5, attack: 'ranged',
    range: 6, radius: 0.5, drawSize: 0.45, spawnWeightDay: 0, spawnWeightNight: 40, minDay: 1,
    movement: 'flying', projectileSpeed: 96, corpseSize: 'medium', color: 'rgba(170, 110, 230, 0.75)',
    shape: 'diamond', buildingDamageMultiplier: 1, navigation: 'direct', fadeIn: 2,
  },
  hellhound: {
    id: 'hellhound', name: 'Hellhound', hp: 35, speed: 120, damage: 10, attackInterval: 1.0, attack: 'melee',
    range: MELEE_RANGE, radius: 0.5, drawSize: 0.4, spawnWeightDay: 6, spawnWeightNight: 0, minDay: 5,
    movement: 'ground', corpseSize: 'medium', color: '#e0782a', shape: 'hexagon', buildingDamageMultiplier: 1,
    navigation: 'field',
  },
};

/** Shots fired by ranged enemies (Wraiths). Section 7. */
export const ENEMY_SHOT = {
  /** Hit radius in tiles. */
  radius: 0.2,
  /** Seconds before it fizzles. */
  lifetime: 2.5,
  color: '#c58cff',
} as const;

export const ELITE = {
  /** Chance per spawned enemy (section 7.1). */
  chance: 0.05,
  hpMultiplier: 2.5,
  damageMultiplier: 1.5,
  /** Marker circle under the enemy. */
  markerRadius: 0.7,
  markerDark: '#8a6a00',
  markerLight: '#ffe066',
  /** Seconds for one full dark → light → dark pulse. */
  markerPeriod: 1.2,
} as const;
