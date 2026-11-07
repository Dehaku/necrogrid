// Kill gallery on the pause screen: every enemy type slain this run, in a row, with how many
// died under each. Hovering one shows its corpse drop rates (section 9.2).

import { ENEMIES, type EnemyId } from '../data/enemies';
import { ELITE_LOOT, LOOT } from '../data/loot';
import { RESOURCE_ORDER, RESOURCES } from '../data/resources';
import { KILL_GALLERY, MENU } from '../data/ui';
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import { Camera } from '../render/camera';
import { drawEnemy } from '../render/sprites';
import { contains, drawBox, type Rect } from './menuWidgets';

/** Enemy types in roster order (the order of ENEMIES). */
const ORDER = Object.keys(ENEMIES) as EnemyId[];

export interface GalleryEntry {
  type: EnemyId;
  count: number;
  /** The slot around the icon and its count; hovering it shows the tooltip. */
  rect: Rect;
}

/** One slot per enemy type with at least one kill, centered in a row. */
export function galleryLayout(kills: Readonly<Record<EnemyId, number>>): GalleryEntry[] {
  const types = ORDER.filter((t) => (kills[t] ?? 0) > 0);
  const { slotWidth, slotHeight, top } = KILL_GALLERY;
  const left = (VIEW_WIDTH - types.length * slotWidth) / 2;
  return types.map((type, i) => ({
    type,
    count: kills[type],
    rect: { x: left + i * slotWidth, y: top, w: slotWidth, h: slotHeight },
  }));
}

/** Tooltip lines: each resource a corpse of this type can drop, with its amount or chance. */
export function dropRateLines(type: EnemyId): string[] {
  const loot = LOOT[ENEMIES[type].corpseSize];
  const lines: string[] = [];
  for (const id of RESOURCE_ORDER) {
    const roll = loot[id];
    if (!roll) continue;
    const name = RESOURCES[id].name;
    if ('chance' in roll) lines.push(`${name}: 1 (${Math.round(roll.chance * 100)}% chance)`);
    else lines.push(`${name}: ${roll.min === roll.max ? roll.min : `${roll.min}–${roll.max}`}`);
  }
  const bonus = RESOURCE_ORDER.filter((id) => (ELITE_LOOT.bonus[id] ?? 0) > 0).map((id) => `+${ELITE_LOOT.bonus[id]} ${RESOURCES[id].name}`);
  lines.push([`Elite: ×${ELITE_LOOT.multiplier} amounts`, ...bonus].join(', '));
  return lines;
}

/** Icons are drawn with the world sprite code through a camera at the origin. */
const iconCamera = new Camera();

export function drawKillGallery(ctx: CanvasRenderingContext2D, kills: Readonly<Record<EnemyId, number>>, mouse: Point, time: number): void {
  const entries = galleryLayout(kills);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (entries.length === 0) {
    ctx.font = 'italic 14px system-ui, sans-serif';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('No demons slain yet', VIEW_WIDTH / 2, KILL_GALLERY.top + KILL_GALLERY.slotHeight / 2);
    return;
  }
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillStyle = MENU.panelText;
  ctx.fillText('SLAIN THIS RUN', VIEW_WIDTH / 2, KILL_GALLERY.top - 12);

  let hovered: GalleryEntry | undefined;
  for (const e of entries) {
    const cx = e.rect.x + e.rect.w / 2;
    const iconY = e.rect.y + KILL_GALLERY.iconY;
    const over = contains(e.rect, mouse);
    if (over) hovered = e;
    if (over) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(e.rect.x + 4, e.rect.y, e.rect.w - 8, e.rect.h);
    }
    // World coordinates that land on (cx, iconY) for a camera at the origin.
    drawEnemy(ctx, iconCamera, ENEMIES[e.type], false, (cx - VIEW_WIDTH / 2) / TILE_SIZE, (iconY - VIEW_HEIGHT / 2) / TILE_SIZE, -Math.PI / 2, time);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = MENU.focusText;
    ctx.fillText(String(e.count), cx, e.rect.y + KILL_GALLERY.countY);
  }
  if (hovered) drawTooltip(ctx, hovered);
}

function drawTooltip(ctx: CanvasRenderingContext2D, e: GalleryEntry): void {
  const def = ENEMIES[e.type];
  const lines = dropRateLines(e.type);
  const lineHeight = 18;
  const w = 250;
  const h = 40 + lines.length * lineHeight;
  const x = Math.min(VIEW_WIDTH - w - 8, Math.max(8, e.rect.x + e.rect.w / 2 - w / 2));
  // Above the row: there is no room below it on a 720 px view.
  const y = e.rect.y - h - 8;
  drawBox(ctx, { x, y, w, h });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = MENU.focusText;
  ctx.fillText(`${def.name} · ${def.corpseSize} corpse`, x + 12, y + 18);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = MENU.panelText;
  lines.forEach((line, i) => ctx.fillText(line, x + 12, y + 40 + i * lineHeight));
}
