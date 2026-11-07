import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { CorpseSize } from '../src/data/enemies';
import { RESOURCE_ORDER, type ResourceAmounts } from '../src/data/resources';
import { corpseExpiry, corpseOpacity, corpsesToDraw } from '../src/entities/corpse';
import { rollLoot } from '../src/economy/lootRoll';
import { Resources } from '../src/economy/resources';
import { counterOpacity } from '../src/ui/resourceHud';

function rollMany(size: CorpseSize, elite: boolean, n = 4000): ResourceAmounts[] {
  const rng = new Rng(99);
  return Array.from({ length: n }, () => rollLoot(size, elite, rng));
}
const values = (rolls: ResourceAmounts[], id: keyof ResourceAmounts) => rolls.map((r) => r[id] ?? 0);
const share = (rolls: ResourceAmounts[], id: keyof ResourceAmounts) => values(rolls, id).filter((v) => v > 0).length / rolls.length;

describe('loot table', () => {
  it('small: 1–2 Bone, no Flesh, 15% Ichor, no Soul Shard', () => {
    const rolls = rollMany('small', false);
    expect(new Set(values(rolls, 'bone'))).toEqual(new Set([1, 2]));
    expect(share(rolls, 'flesh')).toBe(0);
    expect(share(rolls, 'ichor')).toBeGreaterThan(0.12);
    expect(share(rolls, 'ichor')).toBeLessThan(0.18);
    expect(share(rolls, 'soulShard')).toBe(0);
  });

  it('medium: 2–3 Bone, 50% Flesh, 30% Ichor', () => {
    const rolls = rollMany('medium', false);
    expect(new Set(values(rolls, 'bone'))).toEqual(new Set([2, 3]));
    expect(share(rolls, 'flesh')).toBeGreaterThan(0.46);
    expect(share(rolls, 'flesh')).toBeLessThan(0.54);
    expect(share(rolls, 'ichor')).toBeGreaterThan(0.26);
    expect(share(rolls, 'ichor')).toBeLessThan(0.34);
  });

  it('large: 3–5 Bone, 1–2 Flesh, 1 Ichor, and always 1 Soul Shard', () => {
    const rolls = rollMany('large', false);
    expect(new Set(values(rolls, 'bone'))).toEqual(new Set([3, 4, 5]));
    expect(new Set(values(rolls, 'flesh'))).toEqual(new Set([1, 2]));
    expect(new Set(values(rolls, 'ichor'))).toEqual(new Set([1]));
    expect(new Set(values(rolls, 'soulShard'))).toEqual(new Set([1]));
  });

  it('elite: every rolled amount × 4, plus 1 Soul Shard whatever the size', () => {
    const smalls = rollMany('small', true, 500);
    expect(new Set(values(smalls, 'bone'))).toEqual(new Set([4, 8]));
    expect(new Set(values(smalls, 'soulShard'))).toEqual(new Set([1]));
    const larges = rollMany('large', true, 500);
    expect(new Set(values(larges, 'soulShard'))).toEqual(new Set([5]));
    expect(new Set(values(larges, 'ichor'))).toEqual(new Set([4]));
  });
});

describe('Resources', () => {
  it('caps basic resources at 200 and rare at 50; the rest is lost', () => {
    const r = new Resources();
    expect(r.add('bone', 250)).toBe(200);
    expect(r.get('bone')).toBe(200);
    expect(r.add('soulShard', 60)).toBe(50);
    expect(r.add('soulShard', 1)).toBe(0);
  });

  it('spends a whole cost or nothing', () => {
    const r = new Resources();
    r.add('bone', 10);
    r.add('flesh', 3);
    expect(r.spend({ bone: 5, flesh: 5 })).toBe(false);
    expect(r.snapshot()).toMatchObject({ bone: 10, flesh: 3 });
    expect(r.spend({ bone: 5, flesh: 3 })).toBe(true);
    expect(r.snapshot()).toMatchObject({ bone: 5, flesh: 0 });
    expect(RESOURCE_ORDER).toHaveLength(4);
  });
});

describe('corpse fade', () => {
  it('fades by the end of the next day phase: day-made and night-made corpses alike', () => {
    // Made during day 1 (t = 50): fades by the end of day 2's day phase (135 + 75).
    expect(corpseExpiry(50)).toBe(210);
    // Made during night 1 (t = 100): same deadline, the coming day.
    expect(corpseExpiry(100)).toBe(210);
    // Made at dawn of day 1 (t = 130): still the coming day.
    expect(corpseExpiry(130)).toBe(210);
    // Made exactly as day 2 starts: the next day phase starting after it is day 3's.
    expect(corpseExpiry(135)).toBe(345);
  });

  it('drops opacity linearly from 1 to 0', () => {
    const c = { createdAt: 200, expiresAt: 400 };
    expect(corpseOpacity(c, 200)).toBe(1);
    expect(corpseOpacity(c, 300)).toBeCloseTo(0.5);
    expect(corpseOpacity(c, 400)).toBe(0);
    expect(corpseOpacity(c, 500)).toBe(0);
  });

  it('draws only the newest N corpses', () => {
    const corpses = [1, 2, 3, 4, 5];
    expect(corpsesToDraw(corpses, 3)).toEqual([3, 4, 5]);
    expect(corpsesToDraw(corpses, 10)).toEqual(corpses);
  });
});

describe('resource counters', () => {
  it('stay for 3 s after a change, then fade over 0.5 s', () => {
    expect(counterOpacity(0)).toBe(1);
    expect(counterOpacity(3)).toBe(1);
    expect(counterOpacity(3.25)).toBeCloseTo(0.5);
    expect(counterOpacity(3.5)).toBe(0);
    expect(counterOpacity(Infinity)).toBe(0);
  });
});
