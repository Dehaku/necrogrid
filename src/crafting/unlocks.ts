// Unlocked gear and equipped slots. GAME_DESIGN.md section 10.3. There is no item inventory:
// crafting unlocks an item for the rest of the run, and any unlocked item can be equipped in
// its slot at any time, for free.

import { GEAR, type GearDef, type GearId, type GearSlot, type Modifier } from '../data/recipes';

export function gearDef(id: GearId): GearDef {
  const def = GEAR.find((g) => g.id === id);
  if (!def) throw new Error(`Unknown gear ${id}`);
  return def;
}

export class GearState {
  readonly unlocked = new Set<GearId>();
  readonly equipped: Record<GearSlot, GearId | undefined> = { weapon: undefined, robe: undefined, charm: undefined };

  isUnlocked(id: GearId): boolean {
    return this.unlocked.has(id);
  }

  unlock(id: GearId): void {
    this.unlocked.add(id);
  }

  /** Equips an unlocked item in its slot. Returns false if it is not unlocked. */
  equip(id: GearId): boolean {
    if (!this.unlocked.has(id)) return false;
    this.equipped[gearDef(id).slot] = id;
    return true;
  }

  unequip(slot: GearSlot): void {
    this.equipped[slot] = undefined;
  }

  /** Unlocked items for a slot, in roster order. */
  unlockedFor(slot: GearSlot): GearDef[] {
    return GEAR.filter((g) => g.slot === slot && this.unlocked.has(g.id));
  }

  /** Every modifier from equipped gear. */
  modifiers(): Modifier[] {
    const out: Modifier[] = [];
    for (const id of Object.values(this.equipped)) if (id) out.push(...gearDef(id).modifiers);
    return out;
  }
}
