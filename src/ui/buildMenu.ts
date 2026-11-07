// Build mode: the hotbar, the placement ghost, and its tooltip. GAME_DESIGN.md sections 4.1
// (ghost), 8.4 (build hotbar), and 10.2 (roster). Build mode does not pause the game.

import { BUILDINGS, HOTBAR, TERRAIN_EDITS, type BuildChoice } from '../data/buildings';
import { RESOURCE_ORDER, RESOURCES, type ResourceAmounts } from '../data/resources';
import { TILE_PROPS, TILE } from '../data/terrain';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Footprint } from '../world/grid';

export interface ChoiceInfo {
  name: string;
  cost: ResourceAmounts;
  w: number;
  h: number;
  color: string;
}

export function choiceInfo(choice: BuildChoice): ChoiceInfo {
  if (choice === 'marsh') return { name: TERRAIN_EDITS.marsh.name, cost: TERRAIN_EDITS.marsh.cost, w: 1, h: 1, color: TILE_PROPS[TILE.marsh].color };
  if (choice === 'fill') return { name: TERRAIN_EDITS.fill.name, cost: TERRAIN_EDITS.fill.cost, w: 1, h: 1, color: TILE_PROPS[TILE.dirt].color };
  const def = BUILDINGS[choice];
  return { name: def.name, cost: def.cost, w: def.w, h: def.h, color: def.color };
}

/** "10 Bone, 5 Ichor" */
export function costText(cost: ResourceAmounts): string {
  return RESOURCE_ORDER.filter((id) => (cost[id] ?? 0) > 0)
    .map((id) => `${cost[id]} ${RESOURCES[id].name}`)
    .join(', ');
}

export class BuildMode {
  active = false;
  /** Index into HOTBAR. */
  slot = 0;

  toggle(): void {
    this.active = !this.active;
  }

  select(index: number): void {
    if (index >= 0 && index < HOTBAR.length) this.slot = index;
  }

  get choice(): BuildChoice {
    return HOTBAR[this.slot]!;
  }
}

const SLOT = 52;
const GAP = 6;

/** The hotbar, bottom-center: key, swatch, and cost for each choice; unaffordable ones greyed. */
export function drawHotbar(ctx: CanvasRenderingContext2D, mode: BuildMode, canAfford: (cost: ResourceAmounts) => boolean): void {
  const total = HOTBAR.length * SLOT + (HOTBAR.length - 1) * GAP;
  const left = (VIEW_WIDTH - total) / 2;
  const top = VIEW_HEIGHT - SLOT - 14;

  ctx.fillStyle = 'rgba(242, 234, 216, 0.85)';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`BUILD · ${choiceInfo(mode.choice).name} · LMB place (hold to paint) · RMB remove · B / Esc / Tab / E exit`, VIEW_WIDTH / 2, top - 6);

  HOTBAR.forEach((choice, i) => {
    const info = choiceInfo(choice);
    const x = left + i * (SLOT + GAP);
    const affordable = canAfford(info.cost);
    ctx.globalAlpha = affordable ? 1 : 0.45;
    ctx.fillStyle = 'rgba(12, 10, 16, 0.88)';
    ctx.fillRect(x, top, SLOT, SLOT);
    ctx.fillStyle = info.color;
    const sw = info.w > 1 ? 22 : 16;
    ctx.fillRect(x + (SLOT - sw) / 2, top + 9, sw, sw);
    ctx.strokeStyle = i === mode.slot ? '#f2ead8' : 'rgba(201, 194, 176, 0.35)';
    ctx.lineWidth = i === mode.slot ? 2 : 1;
    ctx.strokeRect(x + 0.5, top + 0.5, SLOT - 1, SLOT - 1);
    ctx.fillStyle = '#f2ead8';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(i + 1), x + 4, top + 3);
    // Cost as colored numbers.
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const parts = RESOURCE_ORDER.filter((id) => (info.cost[id] ?? 0) > 0);
    const step = SLOT / (parts.length + 1);
    parts.forEach((id, k) => {
      ctx.fillStyle = RESOURCES[id].color;
      ctx.fillText(String(info.cost[id]), x + step * (k + 1), top + SLOT - 3);
    });
    ctx.globalAlpha = 1;
  });
}

/** The placement ghost: green when it can be placed, red when not, with a tooltip. */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  fp: Footprint,
  info: ChoiceInfo,
  problem: string | undefined,
): void {
  const w = fp.w * TILE_SIZE;
  const h = fp.h * TILE_SIZE;
  const ok = problem === undefined;
  ctx.fillStyle = ok ? 'rgba(80, 220, 120, 0.35)' : 'rgba(230, 70, 70, 0.35)';
  ctx.fillRect(screen.x, screen.y, w, h);
  ctx.strokeStyle = ok ? '#5ee08a' : '#ec5a5a';
  ctx.lineWidth = 2;
  ctx.strokeRect(screen.x + 1, screen.y + 1, w - 2, h - 2);

  const lines = [`${info.name} — ${costText(info.cost)}`, ...(problem ? [problem] : [])];
  ctx.font = '600 12px system-ui, sans-serif';
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
  const tx = screen.x + w / 2 - width / 2;
  const ty = screen.y - 8 - lines.length * 16;
  ctx.fillStyle = 'rgba(12, 10, 16, 0.88)';
  ctx.fillRect(tx, ty, width, lines.length * 16 + 4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#f2ead8' : '#ff8a8a';
    ctx.fillText(line, screen.x + w / 2, ty + 3 + i * 16);
  });
}
