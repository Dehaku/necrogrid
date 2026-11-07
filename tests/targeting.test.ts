import { describe, expect, it } from 'vitest';
import { chooseTarget } from '../src/combat/targeting';
import { turnToward } from '../src/world/navigation';
import { SpatialHash } from '../src/world/spatialHash';

describe('chooseTarget', () => {
  it('picks the closer target on spawn, ties going to the player', () => {
    expect(chooseTarget(undefined, { player: 10, phylactery: 20 })).toBe('player');
    expect(chooseTarget(undefined, { player: 20, phylactery: 10 })).toBe('phylactery');
    expect(chooseTarget(undefined, { player: 10, phylactery: 10 })).toBe('player');
  });

  it('keeps its target until the other is clearly closer (0.8 ×)', () => {
    expect(chooseTarget('player', { player: 10, phylactery: 9 })).toBe('player');
    expect(chooseTarget('player', { player: 10, phylactery: 8 })).toBe('player');
    expect(chooseTarget('player', { player: 10, phylactery: 7.9 })).toBe('phylactery');
    expect(chooseTarget('phylactery', { player: 7.9, phylactery: 10 })).toBe('player');
  });

  it('does not flicker when the distances wobble around equal', () => {
    let target = chooseTarget(undefined, { player: 10, phylactery: 10.1 });
    const flips = new Set<string>([target]);
    for (let i = 0; i < 50; i++) {
      const wobble = Math.sin(i) * 0.5;
      target = chooseTarget(target, { player: 10 + wobble, phylactery: 10 - wobble });
      flips.add(target);
    }
    expect(flips.size).toBe(1);
  });

  it('switches away from an unreachable target', () => {
    expect(chooseTarget('player', { player: Infinity, phylactery: 40 })).toBe('phylactery');
  });
});

describe('turnToward', () => {
  it('turns by at most the limit, the short way around', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
    // From just below +π to just above −π is a short turn (0.083 rad) across the wrap.
    expect(turnToward(3.1, -3.1, 0.05)).toBeCloseTo(3.15);
    expect(turnToward(3.1, -3.1, 0.1)).toBe(-3.1);
  });
});

describe('SpatialHash', () => {
  it('finds items within a radius across cell borders', () => {
    const hash = new SpatialHash<{ x: number; y: number; id: number }>(2);
    hash.insert({ x: 1.9, y: 0, id: 1 });
    hash.insert({ x: 2.1, y: 0, id: 2 });
    hash.insert({ x: 5, y: 5, id: 3 });
    expect(hash.queryRadius(2, 0, 0.5).map((i) => i.id).sort()).toEqual([1, 2]);
    expect(hash.queryRadius(-10, -10, 1)).toEqual([]);
  });
});
