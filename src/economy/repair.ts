// Repairing buildings and the Phylactery. GAME_DESIGN.md sections 10.2 and 10.4.
// A full repair costs, per resource, ceil(cost × missingHP / maxHP). Resources are paid one
// unit at a time as the repair needs them, and anything paid but unused stays on the
// building as credit, so stopping and restarting never charges extra.

import { RESOURCE_ORDER, type ResourceAmounts, type ResourceId } from '../data/resources';

export interface Repairable {
  hp: number;
  readonly maxHp: number;
  repairCredit: Partial<Record<ResourceId, number>>;
}

const EPSILON = 1e-9;

/** What it would cost from now to repair to full, per resource. */
export function repairCostToFull(target: Repairable, cost: ResourceAmounts): ResourceAmounts {
  const missing = target.maxHp - target.hp;
  const out: ResourceAmounts = {};
  if (missing <= 0) return out;
  for (const id of RESOURCE_ORDER) {
    const c = cost[id] ?? 0;
    if (c <= 0) continue;
    const n = Math.max(0, Math.ceil((c * missing) / target.maxHp - (target.repairCredit[id] ?? 0) - EPSILON));
    if (n > 0) out[id] = n;
  }
  return out;
}

/**
 * One tick of repair at `rate` HP/s. `pay(id)` tries to spend one unit of a resource and
 * returns whether it could. Healing stops where the paid-for HP runs out. Returns HP restored.
 */
export function stepRepair(
  target: Repairable,
  cost: ResourceAmounts,
  rate: number,
  dt: number,
  pay: (id: ResourceId) => boolean,
): number {
  const missing = target.maxHp - target.hp;
  if (missing <= 0) return 0;
  const want = Math.min(rate * dt, missing);
  let heal = want;
  for (const id of RESOURCE_ORDER) {
    const c = cost[id] ?? 0;
    if (c <= 0) continue;
    const perHp = c / target.maxHp;
    let credit = target.repairCredit[id] ?? 0;
    while (credit + EPSILON < want * perHp && pay(id)) credit += 1;
    target.repairCredit[id] = credit;
    heal = Math.min(heal, credit / perHp);
  }
  if (heal <= 0) return 0;
  for (const id of RESOURCE_ORDER) {
    const c = cost[id] ?? 0;
    if (c <= 0) continue;
    target.repairCredit[id] = Math.max(0, (target.repairCredit[id] ?? 0) - (heal * c) / target.maxHp);
  }
  target.hp = Math.min(target.maxHp, target.hp + heal);
  // Float drift could leave 149.9999… of 150; snap to full so the building counts as repaired.
  if (target.maxHp - target.hp < 1e-6) target.hp = target.maxHp;
  return heal;
}
