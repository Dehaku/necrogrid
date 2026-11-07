// Chain: hitscan that jumps between enemies with damage falloff. GAME_DESIGN.md section 8.1.
// Ignores terrain and buildings.

import { CHAIN } from '../data/spells';
import type { Point } from '../core/input';
import type { Player } from '../entities/player';

export interface ChainOptions {
  castRadius: number;
  maxJumps: number;
  jumpRange: number;
}

function nearest<T extends Point>(from: Point, candidates: readonly T[], range: number, exclude: ReadonlySet<T>): T | undefined {
  let best: T | undefined;
  let bestD2 = range * range;
  for (const c of candidates) {
    if (exclude.has(c)) continue;
    const d2 = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
    if (d2 <= bestD2) {
      // Ties keep the earlier candidate, so results do not depend on float noise.
      if (d2 === bestD2 && best) continue;
      bestD2 = d2;
      best = c;
    }
  }
  return best;
}

/**
 * The enemies a chain hits, in order: the nearest enemy within `castRadius` of the cursor,
 * then up to `maxJumps` more, each the nearest not-yet-hit enemy within `jumpRange` of the
 * one before it. Empty if nothing is near the cursor.
 */
export function chainTargets<T extends Point>(cursor: Point, enemies: readonly T[], options: ChainOptions = CHAIN): T[] {
  const hit = new Set<T>();
  const first = nearest(cursor, enemies, options.castRadius, hit);
  if (!first) return [];
  const chain = [first];
  hit.add(first);
  for (let jump = 0; jump < options.maxJumps; jump++) {
    const next = nearest(chain[chain.length - 1]!, enemies, options.jumpRange, hit);
    if (!next) break;
    chain.push(next);
    hit.add(next);
  }
  return chain;
}

/** Damage for the i-th link (0 = first hit): damage × falloff^i. */
export function chainDamage(index: number, damage: number = CHAIN.damage, falloff: number = CHAIN.falloff): number {
  return damage * Math.pow(falloff, index);
}

/**
 * Casts Chain toward `cursor` if cooldown and mana allow and an enemy is in reach.
 * Spends mana and starts the cooldown only when something is hit. Returns the targets.
 */
export function tryCastChain<T extends Point>(player: Player, cursor: Point, enemies: readonly T[]): T[] {
  if (player.chainCooldown > 0 || player.mana < CHAIN.manaCost) return [];
  const targets = chainTargets(cursor, enemies);
  if (targets.length === 0) return [];
  player.mana -= CHAIN.manaCost;
  player.chainCooldown = CHAIN.cooldown;
  return targets;
}
