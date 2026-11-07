// Compact resource counters, top-left. GAME_DESIGN.md section 8.4.
// Hidden by default; a counter appears when its resource changes and fades 3 s later.
// All four stay visible near an Altar (M7) and while the C or Tab screen is open.

import { RESOURCE_ORDER, RESOURCES, type ResourceId } from '../data/resources';
import { RESOURCE_HUD } from '../data/ui';
import type { EventBus, GameEvents } from '../core/events';
import { resourceCap } from '../economy/resources';

/** Counter opacity `sinceChange` seconds after its resource last changed. */
export function counterOpacity(sinceChange: number): number {
  if (sinceChange <= RESOURCE_HUD.linger) return 1;
  return Math.max(0, 1 - (sinceChange - RESOURCE_HUD.linger) / RESOURCE_HUD.fade);
}

export class ResourceHud {
  /** Seconds since each resource last changed (Infinity = never). Ages with simulation time. */
  private readonly since: Record<ResourceId, number> = { bone: Infinity, flesh: Infinity, ichor: Infinity, soulShard: Infinity };
  private off: (() => void) | undefined;

  attach(events: EventBus<GameEvents>): void {
    this.off?.();
    for (const id of RESOURCE_ORDER) this.since[id] = Infinity;
    this.off = events.on('resources:changed', ({ id }) => (this.since[id] = 0));
  }

  advance(dt: number): void {
    for (const id of RESOURCE_ORDER) this.since[id] += dt;
  }

  draw(ctx: CanvasRenderingContext2D, amount: (id: ResourceId) => number, showAll: boolean): void {
    let row = 0;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const id of RESOURCE_ORDER) {
      const opacity = showAll ? 1 : counterOpacity(this.since[id]);
      if (opacity <= 0) continue;
      const y = RESOURCE_HUD.y + row * RESOURCE_HUD.rowHeight + RESOURCE_HUD.rowHeight / 2;
      const x = RESOURCE_HUD.x;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(x - 4, y - RESOURCE_HUD.rowHeight / 2 + 1, 150, RESOURCE_HUD.rowHeight - 2);
      ctx.fillStyle = RESOURCES[id].color;
      ctx.fillRect(x, y - 5, 10, 10);
      ctx.textAlign = 'left';
      ctx.fillText(RESOURCES[id].name, x + 16, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = amount(id) >= resourceCap(id) ? '#ffcf5a' : '#f2ead8';
      ctx.fillText(String(amount(id)), x + 140, y);
      row++;
    }
    ctx.globalAlpha = 1;
  }
}
