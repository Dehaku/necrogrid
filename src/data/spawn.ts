// Spawn director values. Data only. GAME_DESIGN.md section 6.

import type { EnemyId } from './enemies';
import { VIEW_RADIUS } from './tuning';

export const SPAWN = {
  /** Day rate = dayRateBase + dayRatePerDay × (day − 1), capped at dayRateCap. Enemies per second. */
  dayRateBase: 1.0,
  dayRatePerDay: 0.1,
  dayRateCap: 3.0,
  nightRate: 0.2,
  packSizeDay: { min: 3, max: 6 },
  packSizeNight: { min: 1, max: 2 },
  /** Budget never exceeds this (2 × the largest pack). */
  budgetCap: 12,
  /** Seconds to wait after a pack could not be placed. */
  retryDelay: 1,
  /** Chance a pack spawns around the Phylactery instead of the player. */
  phylacterySpawnShare: 0.5,
  /** Pack centers are this many tiles from the anchor. */
  ringMin: 32,
  ringMax: 40,
  /** Center points tried per pack before giving up. */
  centerAttempts: 10,
  /** Pack members are placed on passing tiles within this many tiles (square) of the center. */
  memberSearchRadius: 3,
  /** Tiles added around the visible view for the off-screen check. */
  offscreenMargin: 2,
  maxActiveEnemies: 150,
  /** Enemies farther than this from both the player and the Phylactery are removed. */
  despawnDistance: 2 * VIEW_RADIUS,
  /** Enemy types the director may spawn. Wraith and Hellhound join in M9. */
  activeRoster: ['imp', 'shambler', 'brute'] as readonly EnemyId[],
} as const;
