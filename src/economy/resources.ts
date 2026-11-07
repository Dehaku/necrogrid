// Resource counters with caps. GAME_DESIGN.md section 9.1. There is no item inventory.

import { RESOURCE_CAPS, RESOURCE_ORDER, RESOURCES, type ResourceAmounts, type ResourceId } from '../data/resources';

export function resourceCap(id: ResourceId): number {
  return RESOURCE_CAPS[RESOURCES[id].tier];
}

export class Resources {
  private readonly amounts: Record<ResourceId, number> = { bone: 0, flesh: 0, ichor: 0, soulShard: 0 };

  get(id: ResourceId): number {
    return this.amounts[id];
  }

  /** Adds up to the cap; the rest is lost. Returns how much was actually added. */
  add(id: ResourceId, amount: number): number {
    const before = this.amounts[id];
    this.amounts[id] = Math.min(resourceCap(id), before + Math.max(0, amount));
    return this.amounts[id] - before;
  }

  canAfford(cost: ResourceAmounts): boolean {
    return RESOURCE_ORDER.every((id) => this.amounts[id] >= (cost[id] ?? 0));
  }

  /** Spends the whole cost, or nothing if it cannot be afforded. */
  spend(cost: ResourceAmounts): boolean {
    if (!this.canAfford(cost)) return false;
    for (const id of RESOURCE_ORDER) this.amounts[id] -= cost[id] ?? 0;
    return true;
  }

  /** A copy of all amounts. */
  snapshot(): Record<ResourceId, number> {
    return { ...this.amounts };
  }
}
