// Equipment screen (Tab). Pauses the game. M6: resources; gear unlocks join in M8.
// GAME_DESIGN.md sections 8 and 10.3.

import { RESOURCE_ORDER, RESOURCES, type ResourceId } from '../data/resources';
import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import { resourceCap } from '../economy/resources';
import { drawBox, type Rect } from './menuWidgets';

export class EquipmentScreen {
  isOpen = false;

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  private rect(): Rect {
    return { x: VIEW_WIDTH / 2 - 260, y: VIEW_HEIGHT / 2 - 170, w: 520, h: 340 };
  }

  draw(ctx: CanvasRenderingContext2D, amount: (id: ResourceId) => number): void {
    ctx.fillStyle = TITLE.pauseOverlay;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    const r = this.rect();
    drawBox(ctx, r);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('Equipment', r.x + r.w / 2, r.y + 34);

    ctx.textAlign = 'left';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('RESOURCES', r.x + 32, r.y + 76);
    ctx.font = '16px system-ui, sans-serif';
    RESOURCE_ORDER.forEach((id, i) => {
      const y = r.y + 108 + i * 32;
      ctx.fillStyle = RESOURCES[id].color;
      ctx.fillRect(r.x + 32, y - 7, 14, 14);
      ctx.textAlign = 'left';
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(RESOURCES[id].name, r.x + 56, y);
      ctx.textAlign = 'right';
      const full = amount(id) >= resourceCap(id);
      ctx.fillStyle = full ? '#ffcf5a' : MENU.focusText;
      ctx.fillText(`${amount(id)} / ${resourceCap(id)}`, r.x + 250, y);
    });

    ctx.textAlign = 'left';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('GEAR', r.x + 300, r.y + 76);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Crafted gear appears here (M8).', r.x + 300, r.y + 108);

    ctx.textAlign = 'center';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Tab or Esc to close', r.x + r.w / 2, r.y + r.h - 22);
  }
}
