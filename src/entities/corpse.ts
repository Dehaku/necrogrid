// Corpses: left by every enemy death, harvested for resources. GAME_DESIGN.md section 9.2.

import type { CorpseSize, EnemyId } from '../data/enemies';
import type { ResourceAmounts } from '../data/resources';
import { DAY_CYCLE } from '../data/time';
import { CYCLE_LENGTH } from '../time/dayCycle';

export interface Corpse {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly enemyType: EnemyId;
  readonly size: CorpseSize;
  readonly elite: boolean;
  /** Facing of the enemy when it died, so the corpse lies the way it fell. */
  readonly heading: number;
  /** Run time (s) when it was created and when it is fully faded. */
  readonly createdAt: number;
  readonly expiresAt: number;
  /** Rolled at death, so harvesting and Collectors give the same thing. */
  readonly loot: ResourceAmounts;
}

const DAY_LENGTH = DAY_CYCLE.phases[0].length;

/**
 * When a corpse created at `createdAt` (run seconds) is fully faded: the end of the first day
 * phase that starts after it. A corpse made during day N, or that night, fades by the end of
 * day N + 1's day phase.
 */
export function corpseExpiry(createdAt: number): number {
  const nextDayStart = (Math.floor(createdAt / CYCLE_LENGTH) + 1) * CYCLE_LENGTH;
  return nextDayStart + DAY_LENGTH;
}

/** Opacity falls linearly from 1 at creation to 0 at expiry. */
export function corpseOpacity(corpse: Pick<Corpse, 'createdAt' | 'expiresAt'>, now: number): number {
  const t = (now - corpse.createdAt) / (corpse.expiresAt - corpse.createdAt);
  return Math.min(1, Math.max(0, 1 - t));
}

/** The newest `count` corpses (corpses are kept in creation order). Only these are drawn. */
export function corpsesToDraw<T>(corpses: readonly T[], count: number): readonly T[] {
  return corpses.length <= count ? corpses : corpses.slice(corpses.length - count);
}
