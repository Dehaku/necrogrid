// The Phylactery. M3: a placeholder that blocks movement, is targeted, and takes damage.
// Completion, repair, and loss arrive in M7 and M9. GAME_DESIGN.md section 10.4.

import { PHYLACTERY } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { Point } from '../core/input';
import type { Footprint } from '../world/grid';

/** Building id the Phylactery uses in the BuildingGrid. Player buildings start above this. */
export const PHYLACTERY_ID = 1;

export interface Phylactery {
  readonly footprint: Footprint;
  /** World position of the footprint's center. */
  readonly center: Point;
  hp: number;
  readonly maxHp: number;
  /** Repair paid for but not yet used (see economy/repair.ts). */
  repairCredit: Partial<Record<ResourceId, number>>;
}

export function createPhylactery(): Phylactery {
  const fp = PHYLACTERY.footprint;
  return {
    footprint: fp,
    center: { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 },
    hp: PHYLACTERY.hp,
    maxHp: PHYLACTERY.hp,
    repairCredit: {},
  };
}

/** The tiles bordering the footprint: the flow field goals and the no-build zone (section 10.4). */
export function phylacteryRingTiles(fp: Footprint): Point[] {
  const tiles: Point[] = [];
  for (let y = fp.y - 1; y <= fp.y + fp.h; y++) {
    for (let x = fp.x - 1; x <= fp.x + fp.w; x++) {
      const onRing = x === fp.x - 1 || x === fp.x + fp.w || y === fp.y - 1 || y === fp.y + fp.h;
      if (onRing) tiles.push({ x, y });
    }
  }
  return tiles;
}
