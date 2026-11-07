// Crafting rules. GAME_DESIGN.md sections 10.1 and 10.3. Reads recipes from src/data/recipes.ts.

import { STAT_LABELS, type GearId, type Modifier } from '../data/recipes';
import type { ResourceAmounts } from '../data/resources';
import { gearDef, type GearState } from './unlocks';

/**
 * Why an item cannot be crafted right now, or undefined if it can: already unlocked, needs an
 * Altar the player is not at, or not enough resources (checked in that order).
 */
export function craftProblem(id: GearId, gear: GearState, canAfford: (cost: ResourceAmounts) => boolean, atAltar: boolean): string | undefined {
  const def = gearDef(id);
  if (gear.isUnlocked(id)) return 'Already unlocked';
  if (def.needsAltar && !atAltar) return 'Needs an Altar';
  if (!canAfford(def.recipe)) return 'Not enough resources';
  return undefined;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(Math.abs(n)) : String(Math.abs(Number(n.toFixed(2))));
}

/** "Bolt damage +4", "Bolt cooldown −0.05 s", "Chain damage ×1.25". */
export function modifierText(m: Modifier): string {
  const label = STAT_LABELS[m.stat];
  if (m.op === 'mul') return `${label.name} ×${m.value}`;
  const sign = m.value < 0 ? '−' : '+';
  return `${label.name} ${sign}${formatNumber(m.value)}${label.unit ?? ''}`;
}

export function effectsText(id: GearId): string {
  return gearDef(id).modifiers.map(modifierText).join(', ');
}
