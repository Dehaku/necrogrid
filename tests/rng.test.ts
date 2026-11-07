import { describe, expect, it } from 'vitest';
import { hashInts, newRunSeed, Rng } from '../src/core/rng';

describe('Rng', () => {
  it('repeats exactly for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('stays in range', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('hits both ends of an int range', () => {
    const rng = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rng.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('hashInts', () => {
  it('is stable, order-sensitive, and handles negatives', () => {
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(1, 3, 2));
    expect(hashInts(5, -1, 0)).not.toBe(hashInts(5, 1, 0));
  });
});

describe('newRunSeed', () => {
  it('uses ?seed= when it is a whole number', () => {
    expect(newRunSeed('?seed=12345')).toBe(12345);
    expect(newRunSeed('?debug&seed=7')).toBe(7);
  });

  it('falls back to a random 32-bit seed otherwise', () => {
    const seed = newRunSeed('?seed=abc');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
