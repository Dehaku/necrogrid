// Building values. Data only. GAME_DESIGN.md sections 6 (no-spawn radius), 10.2 (roster),
// 10.4 (Phylactery), and 10.5 (starting base).

import type { ResourceAmounts } from './resources';

export type BuildingKind = 'wall' | 'door' | 'totem' | 'collector' | 'altar' | 'lantern';
export type TerrainEditKind = 'marsh' | 'fill';
/** Everything the build hotbar can place. */
export type BuildChoice = BuildingKind | TerrainEditKind;

/** Tiles past each footprint edge where enemies cannot spawn, unless a building says otherwise. */
export const DEFAULT_NO_SPAWN_RADIUS = 3;

export interface BuildingDef {
  readonly kind: BuildingKind;
  readonly name: string;
  /** Footprint size in tiles. */
  readonly w: number;
  readonly h: number;
  readonly cost: ResourceAmounts;
  readonly hp: number;
  readonly noSpawnRadius: number;
  /** The player can walk through it (Bone Door). Enemies never can. */
  readonly playerPassable: boolean;
  readonly color: string;
  /** Short text drawn on the placeholder square. */
  readonly label: string;
  /** One line for the build ghost: what it does. */
  readonly description: string;
}

export const BUILDINGS: Readonly<Record<BuildingKind, BuildingDef>> = {
  wall: {
    kind: 'wall', name: 'Bone Wall', w: 1, h: 1, cost: { bone: 4 }, hp: 150,
    noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS, playerPassable: false, color: '#cfc6ad', label: '',
    description: 'Blocks enemies and Wraith shots.',
  },
  door: {
    kind: 'door', name: 'Bone Door', w: 1, h: 1, cost: { bone: 12 }, hp: 150,
    noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS, playerPassable: true, color: '#cfc6ad', label: '',
    description: 'A wall you can walk through. Enemies cannot.',
  },
  totem: {
    kind: 'totem', name: 'Bone Totem', w: 1, h: 1, cost: { bone: 10, ichor: 5 }, hp: 80,
    noSpawnRadius: 5, playerPassable: false, color: '#7b5ea7', label: 'T',
    description: 'Shoots the nearest enemy within 6 tiles.',
  },
  collector: {
    kind: 'collector', name: 'Corpse Collector', w: 1, h: 1, cost: { bone: 8, flesh: 2 }, hp: 80,
    noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS, playerPassable: false, color: '#5f8a55', label: 'C',
    description: 'Harvests corpses within 3 tiles for you.',
  },
  altar: {
    kind: 'altar', name: 'Altar', w: 2, h: 2, cost: { flesh: 10, ichor: 10 }, hp: 150,
    noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS, playerPassable: false, color: '#8a3b4b', label: 'ALTAR',
    description: 'Crafting. +4 mana regen nearby. +50 to every resource cap.',
  },
  lantern: {
    kind: 'lantern', name: 'Grave Lantern', w: 1, h: 1, cost: { bone: 3, flesh: 2 }, hp: 40,
    noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS, playerPassable: false, color: '#d9b44a', label: 'L',
    description: 'Night light. Slow, free heal and repair within 4 tiles.',
  },
};

/**
 * Terrain edits (section 10.2, keys 7 and 8). Neither is refunded.
 */
export const TERRAIN_EDITS = {
  /** Turn a grass or dirt tile into marsh. */
  marsh: { name: 'Marsh', cost: { flesh: 10, ichor: 1 }, description: 'Slows you and ground demons by half.' },
  /** Fill any marsh tile, wild or player-made, into dirt. */
  fill: { name: 'Fill', cost: { bone: 5, flesh: 5 }, description: 'Turns marsh back into buildable dirt.' },
} as const;

/** Build hotbar order: keys 1–8. */
export const HOTBAR: readonly BuildChoice[] = ['wall', 'door', 'totem', 'collector', 'altar', 'lantern', 'marsh', 'fill'];

export const BUILD_RULES = {
  /** Repair: hold R within this many tiles of a damaged building's footprint. */
  repairRange: 2,
  /** HP restored per second while repairing. */
  repairRate: 50,
  /** Share of the cost given back when the player removes a building (rounded down). */
  removeRefund: 0.5,
  /** Share of the cost dropped when demons destroy a building (rounded down). */
  destroyDrop: 0.5,
} as const;

export const TOTEM = {
  /** Fires at the nearest enemy within this many tiles of its center. */
  range: 6,
  interval: 1.0,
  damage: 8,
  /** Pixels per second; the bolt otherwise behaves like the player's (passes over buildings). */
  boltSpeed: 500,
  boltColor: '#b6f2c9',
} as const;

export const COLLECTOR = {
  range: 3,
  cooldownMin: 3,
  cooldownMax: 5,
} as const;

export const ALTAR = {
  /** Extra mana per second while the player is within `auraRadius` tiles of the Altar's center. */
  manaRegenAura: 4,
  auraRadius: 5,
  /** Each standing Altar adds this to every resource cap (stacks). */
  capBonus: 50,
} as const;

export const LANTERN = {
  /** Each Lantern lights this many tiles around itself at night. */
  lightRadius: 4,
  /** Wraith targeting weight (M9). */
  aggroWeight: 2,
  /**
   * Heal and repair aura, always on. Reaches the player (center within `auraRadius` of the
   * Lantern's center) and every building and the Phylactery whose footprint is within it.
   * Free, and does not stack: one Lantern or five, the rate is the same.
   */
  auraRadius: 4,
  /** Player HP per second. */
  healRate: 1,
  /** Building HP per second. */
  repairRate: 1,
} as const;

export const STARTING_BASE = {
  /** Chance each of the 24 wall-ring tiles gets a Bone Wall. */
  wallChance: 0.6,
  /** The wall ring is this many tiles out from the Phylactery's footprint. */
  wallRingDistance: 2,
} as const;

export const PHYLACTERY = {
  /** Footprint in tiles: 3 × 3 centered on tile (0, 0). */
  footprint: { x: -1, y: -1, w: 3, h: 3 },
  hp: 600,
  /** Repair: 1 Bone per 10 HP (it has no build cost to scale from). */
  repairCost: { bone: 60 } as ResourceAmounts,
  /** Reaching 0 HP ends the run (section 11), before and after completion. */
  destructionEndsRun: true,
  noSpawnRadius: DEFAULT_NO_SPAWN_RADIUS,
  color: '#3d2a55',
  edgeColor: '#9b7fd1',
} as const;
