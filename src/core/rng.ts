// Seeded random numbers. All gameplay randomness goes through this module.
// GAME_DESIGN.md section 15 (deterministic simulation).

/** Mixes any number of integers into one well-distributed 32-bit seed. Order matters. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5 ^ values.length;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small, fast seeded generator (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** A uniformly chosen element. The array must not be empty. */
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('Rng.pick on an empty array');
    return item;
  }
}

/**
 * Seed for a new run. `?seed=N` in the URL wins (handy for testing); otherwise the browser's
 * crypto RNG picks one. This is the only randomness allowed outside Rng (section 8.5).
 */
export function newRunSeed(search: string): number {
  const fromUrl = new URLSearchParams(search).get('seed');
  if (fromUrl !== null && /^\d+$/.test(fromUrl)) return Number(fromUrl) >>> 0;
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
}
