// Rolls corpse loot from src/data/loot.ts. GAME_DESIGN.md sections 7.1 and 9.2.

import type { CorpseSize } from '../data/enemies';
import { ELITE_LOOT, LOOT } from '../data/loot';
import { RESOURCE_ORDER, type ResourceAmounts } from '../data/resources';
import type { Rng } from '../core/rng';

/**
 * Rolls once per resource: a uniform integer range, or a chance of getting 1. Elite corpses
 * multiply every rolled amount, then add the elite bonus (1 Soul Shard) whatever the size.
 */
export function rollLoot(size: CorpseSize, elite: boolean, rng: Rng): ResourceAmounts {
  const table = LOOT[size];
  const loot: ResourceAmounts = {};
  for (const id of RESOURCE_ORDER) {
    const roll = table[id];
    if (!roll) continue;
    const amount = 'chance' in roll ? (rng.chance(roll.chance) ? 1 : 0) : rng.int(roll.min, roll.max);
    if (amount > 0) loot[id] = amount;
  }
  if (elite) {
    for (const id of RESOURCE_ORDER) if (loot[id]) loot[id] = loot[id]! * ELITE_LOOT.multiplier;
    for (const id of RESOURCE_ORDER) {
      const bonus = ELITE_LOOT.bonus[id] ?? 0;
      if (bonus > 0) loot[id] = (loot[id] ?? 0) + bonus;
    }
  }
  return loot;
}
