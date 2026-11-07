// Corpse loot and harvesting. Data only. GAME_DESIGN.md sections 9.2 and 9.3.

import type { CorpseSize } from './enemies';
import type { ResourceId } from './resources';

/** A loot entry: a uniform integer range, or a chance of getting exactly 1. */
export type LootRoll = { min: number; max: number } | { chance: number };

/** Loot by corpse size. Missing resources drop nothing. */
export const LOOT: Readonly<Record<CorpseSize, Partial<Record<ResourceId, LootRoll>>>> = {
  small: { bone: { min: 1, max: 2 }, ichor: { chance: 0.15 } },
  medium: { bone: { min: 2, max: 3 }, flesh: { chance: 0.5 }, ichor: { chance: 0.3 } },
  large: { bone: { min: 3, max: 5 }, flesh: { min: 1, max: 2 }, ichor: { min: 1, max: 1 }, soulShard: { min: 1, max: 1 } },
};

/** Elite corpses: every rolled amount × multiplier, then this many Soul Shards added (section 7.1). */
export const ELITE_LOOT = { multiplier: 4, bonusSoulShards: 1 } as const;

export const HARVEST = {
  /** Tiles from the player's center to the corpse's center. */
  range: 1,
  /** Seconds to harvest, by corpse size. */
  duration: { small: 0.6, medium: 1.0, large: 1.6 } as Readonly<Record<CorpseSize, number>>,
} as const;
