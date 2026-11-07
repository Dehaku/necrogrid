// Crafting menu (C). Pauses the game. Lists every recipe; ones that cannot be crafted right now
// are greyed out with the reason. GAME_DESIGN.md sections 10.1 and 10.3.

import { GEAR, SLOTS, type GearId } from '../data/recipes';
import { RESOURCE_ORDER, RESOURCES } from '../data/resources';
import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import { effectsText } from '../crafting/crafting';
import { drawBox, hitIndex, type MenuPress, type Rect } from './menuWidgets';

export type CraftAction = { craft: GearId } | 'close';

export interface CraftView {
  /** Why each item cannot be crafted, or undefined if it can. */
  problem(id: GearId): string | undefined;
  unlocked(id: GearId): boolean;
  atAltar: boolean;
}

const BOX: Rect = { x: VIEW_WIDTH / 2 - 470, y: VIEW_HEIGHT / 2 - 300, w: 940, h: 600 };
const ROW_H = 46;
const FIRST_ROW = BOX.y + 92;

export class CraftMenu {
  isOpen = false;
  focus = 0;
  private lastMouse: Point = { x: Number.NaN, y: Number.NaN };

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  rowRect(i: number): Rect {
    return { x: BOX.x + 20, y: FIRST_ROW + i * ROW_H, w: BOX.w - 40, h: ROW_H - 6 };
  }

  handle(press: MenuPress): CraftAction | undefined {
    const count = GEAR.length;
    switch (press.kind) {
      case 'prev':
        this.focus = (this.focus + count - 1) % count;
        return undefined;
      case 'next':
        this.focus = (this.focus + 1) % count;
        return undefined;
      case 'confirm':
        return { craft: GEAR[this.focus]!.id };
      case 'back':
        return 'close';
      case 'click': {
        const i = hitIndex(GEAR.map((_, k) => this.rowRect(k)), press.at);
        if (i < 0) return undefined;
        this.focus = i;
        return { craft: GEAR[i]!.id };
      }
      default:
        return undefined;
    }
  }

  hover(mouse: Point): void {
    if (mouse.x === this.lastMouse.x && mouse.y === this.lastMouse.y) return;
    this.lastMouse = { ...mouse };
    const i = hitIndex(GEAR.map((_, k) => this.rowRect(k)), mouse);
    if (i >= 0) this.focus = i;
  }

  draw(ctx: CanvasRenderingContext2D, view: CraftView): void {
    ctx.fillStyle = TITLE.pauseOverlay;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    drawBox(ctx, BOX);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('Crafting', BOX.x + 24, BOX.y + 32);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = view.atAltar ? '#7fd17a' : MENU.panelText;
    ctx.fillText(view.atAltar ? 'At an Altar: every recipe is available' : 'Not at an Altar: recipes marked ⌂ need one', BOX.x + 24, BOX.y + 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('Enter or click to craft · C or Esc to close', BOX.x + BOX.w - 24, BOX.y + 32);

    GEAR.forEach((g, i) => {
      const r = this.rowRect(i);
      const problem = view.problem(g.id);
      const unlocked = view.unlocked(g.id);
      const focused = i === this.focus;
      ctx.fillStyle = focused ? 'rgba(90, 74, 106, 0.5)' : 'rgba(30, 24, 38, 0.6)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (focused) {
        ctx.strokeStyle = MENU.focusBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      const dim = problem !== undefined && !unlocked;
      ctx.globalAlpha = dim ? 0.55 : 1;
      const cy = r.y + r.h / 2;
      ctx.textAlign = 'left';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(`${g.needsAltar ? '⌂ ' : ''}${g.name}`, r.x + 12, cy - 8);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText(SLOTS.find((s) => s.id === g.slot)!.name, r.x + 12, cy + 10);
      // Cost.
      let x = r.x + 230;
      ctx.font = '600 13px system-ui, sans-serif';
      for (const id of RESOURCE_ORDER) {
        const n = g.recipe[id];
        if (!n) continue;
        ctx.fillStyle = RESOURCES[id].color;
        const text = `${n} ${RESOURCES[id].name}`;
        ctx.fillText(text, x, cy);
        x += ctx.measureText(text).width + 14;
      }
      // Effects.
      ctx.fillStyle = '#c9c1b4';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(effectsText(g.id), r.x + 480, cy);
      // Status.
      ctx.textAlign = 'right';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.globalAlpha = 1;
      if (unlocked) {
        ctx.fillStyle = '#7fd17a';
        ctx.fillText('Unlocked', r.x + r.w - 12, cy);
      } else if (problem) {
        ctx.fillStyle = '#ff8a8a';
        ctx.fillText(problem, r.x + r.w - 12, cy);
      } else {
        ctx.fillStyle = '#f2ead8';
        ctx.fillText('Craft', r.x + r.w - 12, cy);
      }
    });
    ctx.globalAlpha = 1;
  }
}
