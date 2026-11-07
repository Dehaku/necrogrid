// Stat modifiers. GAME_DESIGN.md section 10.3: all `add` modifiers first, then all `mul`.

import type { Modifier, StatId } from '../data/recipes';
import { BOLT, CHAIN } from '../data/spells';
import { PLAYER } from '../data/tuning';

export type Stats = Record<StatId, number>;

/** The necromancer's stats before gear. */
export function baseStats(): Stats {
  return {
    maxHp: PLAYER.maxHp,
    maxMana: PLAYER.maxMana,
    manaRegen: PLAYER.manaRegen,
    boltDamage: BOLT.damage,
    boltCooldown: BOLT.cooldown,
    boltManaCost: BOLT.manaCost,
    chainDamage: CHAIN.damage,
    chainMaxJumps: CHAIN.maxJumps,
    chainCooldown: CHAIN.cooldown,
  };
}

/** Applies modifiers to base stats: every `add`, then every `mul`. */
export function computeStats(base: Stats, modifiers: readonly Modifier[]): Stats {
  const out = { ...base };
  for (const m of modifiers) if (m.op === 'add') out[m.stat] += m.value;
  for (const m of modifiers) if (m.op === 'mul') out[m.stat] *= m.value;
  // Keep the stats sane whatever the gear does.
  out.boltCooldown = Math.max(0.05, out.boltCooldown);
  out.chainCooldown = Math.max(0.05, out.chainCooldown);
  out.boltManaCost = Math.max(0, out.boltManaCost);
  out.chainMaxJumps = Math.max(0, Math.round(out.chainMaxJumps));
  return out;
}
