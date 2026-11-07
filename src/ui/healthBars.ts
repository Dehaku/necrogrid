// Health bars over damaged enemies (M4) and buildings (M7). GAME_DESIGN.md section 8.4.

import { TILE_SIZE } from '../data/tuning';
import { HEALTH_BAR } from '../data/ui';

/** Bar color in hard steps: above 2/3 green, above 1/3 yellow, otherwise red. */
export function healthBarColor(fraction: number): string {
  if (fraction > 2 / 3) return HEALTH_BAR.high;
  if (fraction > 1 / 3) return HEALTH_BAR.mid;
  return HEALTH_BAR.low;
}

/**
 * Draws a bar above a shape whose top edge is at screen y `top`, centered on `cx`.
 * `widthTiles` is the footprint width. Nothing is drawn at full HP.
 */
export function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  widthTiles: number,
  hp: number,
  maxHp: number,
): void {
  if (hp >= maxHp || hp <= 0) return;
  const width = widthTiles * TILE_SIZE - HEALTH_BAR.inset;
  const y = top - HEALTH_BAR.gap - HEALTH_BAR.height;
  const left = cx - width / 2;
  ctx.fillStyle = HEALTH_BAR.background;
  ctx.fillRect(left, y, width, HEALTH_BAR.height);
  ctx.fillStyle = healthBarColor(hp / maxHp);
  ctx.fillRect(left, y, width * (hp / maxHp), HEALTH_BAR.height);
}
