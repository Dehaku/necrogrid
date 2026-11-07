// Target selection with hysteresis. GAME_DESIGN.md section 7.

import { NAV } from '../data/tuning';

export type TargetId = 'player' | 'phylactery';

/**
 * Picks the closer of the player and the Phylactery. With a current target, switches only
 * when the other is closer than `switchRatio` × the current distance, so enemies about
 * equally far from both do not flicker. Without one, picks the closer; ties go to the player.
 */
export function chooseTarget(
  current: TargetId | undefined,
  distances: Readonly<Record<TargetId, number>>,
  switchRatio: number = NAV.targetSwitchRatio,
): TargetId {
  if (current === undefined) return distances.player <= distances.phylactery ? 'player' : 'phylactery';
  const other: TargetId = current === 'player' ? 'phylactery' : 'player';
  return distances[other] < switchRatio * distances[current] ? other : current;
}
