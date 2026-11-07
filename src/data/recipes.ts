// Necromancer gear recipes and their stat effects. Data only. GAME_DESIGN.md section 10.3.

import type { ResourceAmounts } from './resources';

export type GearSlot = 'weapon' | 'robe' | 'charm';

/** Player stats that gear can change (section 10.3, "Modifiable stats"). */
export type StatId =
  | 'maxHp'
  | 'maxMana'
  | 'manaRegen'
  | 'boltDamage'
  | 'boltCooldown'
  | 'boltManaCost'
  | 'chainDamage'
  | 'chainMaxJumps'
  | 'chainCooldown';

/** All `add` modifiers apply first, then all `mul` modifiers. */
export interface Modifier {
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  readonly value: number;
}

export type GearId =
  | 'boneStaff'
  | 'gravewoodStaff'
  | 'lichStaff'
  | 'shroudOfRot'
  | 'graveVestments'
  | 'shroudOfTheUndying'
  | 'ringOfMarrow'
  | 'manaPhial'
  | 'chainFocus'
  | 'heartOfAsh';

export interface GearDef {
  readonly id: GearId;
  readonly name: string;
  readonly slot: GearSlot;
  readonly recipe: ResourceAmounts;
  /** Can only be crafted while standing at an Altar. */
  readonly needsAltar: boolean;
  readonly modifiers: readonly Modifier[];
}

const add = (stat: StatId, value: number): Modifier => ({ stat, op: 'add', value });
const mul = (stat: StatId, value: number): Modifier => ({ stat, op: 'mul', value });

/** In display order: weapons, robes, charms, early to late. */
export const GEAR: readonly GearDef[] = [
  { id: 'boneStaff', name: 'Bone Staff', slot: 'weapon', recipe: { bone: 12, flesh: 4 }, needsAltar: false, modifiers: [add('boltDamage', 4)] },
  {
    id: 'gravewoodStaff', name: 'Gravewood Staff', slot: 'weapon', recipe: { bone: 8, soulShard: 6 }, needsAltar: true,
    modifiers: [add('boltDamage', 8), add('boltCooldown', -0.05)],
  },
  {
    id: 'lichStaff', name: 'Lich Staff', slot: 'weapon', recipe: { soulShard: 10, ichor: 3 }, needsAltar: true,
    modifiers: [add('boltDamage', 14), add('boltManaCost', -2), mul('chainDamage', 1.25)],
  },
  { id: 'shroudOfRot', name: 'Shroud of Rot', slot: 'robe', recipe: { flesh: 10 }, needsAltar: false, modifiers: [add('maxHp', 25)] },
  {
    id: 'graveVestments', name: 'Grave Vestments', slot: 'robe', recipe: { bone: 6, flesh: 8, soulShard: 4 }, needsAltar: true,
    modifiers: [add('maxHp', 40), add('maxMana', 30), add('manaRegen', 2)],
  },
  {
    id: 'shroudOfTheUndying', name: 'Shroud of the Undying', slot: 'robe', recipe: { flesh: 12, soulShard: 8, ichor: 3 }, needsAltar: true,
    modifiers: [add('maxHp', 60), add('maxMana', 60), add('manaRegen', 4)],
  },
  { id: 'ringOfMarrow', name: 'Ring of Marrow', slot: 'charm', recipe: { bone: 5, soulShard: 3 }, needsAltar: false, modifiers: [add('manaRegen', 3)] },
  {
    id: 'manaPhial', name: 'Mana Phial', slot: 'charm', recipe: { flesh: 6, soulShard: 4 }, needsAltar: false,
    modifiers: [add('maxMana', 50), add('manaRegen', 2)],
  },
  {
    id: 'chainFocus', name: 'Chain Focus', slot: 'charm', recipe: { soulShard: 10, ichor: 3 }, needsAltar: true,
    modifiers: [add('chainMaxJumps', 1), add('chainCooldown', -0.2)],
  },
  {
    id: 'heartOfAsh', name: 'Heart of Ash', slot: 'charm', recipe: { soulShard: 12, ichor: 5 }, needsAltar: true,
    modifiers: [add('manaRegen', 6), mul('boltDamage', 1.2)],
  },
];

export const SLOTS: readonly { id: GearSlot; name: string }[] = [
  { id: 'weapon', name: 'Weapon' },
  { id: 'robe', name: 'Robe' },
  { id: 'charm', name: 'Charm' },
];

/** How each stat reads in effect text ("Bolt damage +4", "Bolt cooldown −0.05 s"). */
export const STAT_LABELS: Readonly<Record<StatId, { name: string; unit?: string }>> = {
  maxHp: { name: 'Max HP' },
  maxMana: { name: 'Max Mana' },
  manaRegen: { name: 'Mana regen' },
  boltDamage: { name: 'Bolt damage' },
  boltCooldown: { name: 'Bolt cooldown', unit: ' s' },
  boltManaCost: { name: 'Bolt mana cost' },
  chainDamage: { name: 'Chain damage' },
  chainMaxJumps: { name: 'Chain max jumps' },
  chainCooldown: { name: 'Chain cooldown', unit: ' s' },
};

export const CRAFTING = {
  /** Crafting "needs Altar" gear: the player's edge within this many tiles of an Altar's footprint. */
  altarReach: 0.5,
} as const;
