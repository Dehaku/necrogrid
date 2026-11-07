import { describe, expect, it } from 'vitest';
import { hashInts, Rng } from '../src/core/rng';
import { SPAWN } from '../src/data/spawn';
import {
  canSpawnAt,
  isOffScreen,
  rosterWeights,
  SpawnDirector,
  spawnRate,
  type SpawnRequest,
  type SpawnWorld,
} from '../src/director/spawnDirector';
import { NoSpawnGrid } from '../src/world/noSpawnGrid';

/** An endless generated world with ~20% scattered rock and a few buildings with no-spawn radii. */
function makeWorld(overrides: Partial<SpawnWorld> = {}): { world: SpawnWorld; noSpawn: NoSpawnGrid } {
  const noSpawn = new NoSpawnGrid();
  const buildings = [
    { x: -1, y: -1, w: 3, h: 3, r: 3 },
    { x: 34, y: 0, w: 1, h: 1, r: 5 },
    { x: 0, y: -36, w: 1, h: 1, r: 3 },
  ];
  for (const b of buildings) noSpawn.add(b, b.r);
  const isBuilding = (x: number, y: number) =>
    buildings.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  const world: SpawnWorld = {
    day: 1,
    nightBlend: 0,
    activeEnemies: 0,
    player: { x: 0.5, y: 2.5 },
    phylactery: { x: 0.5, y: 0.5 },
    camera: { x: 0.5, y: 2.5 },
    isGenerated: () => true,
    isRock: (x, y) => hashInts(x, y) % 5 === 0,
    isBuilding,
    isNoSpawn: (x, y) => noSpawn.isBlocked(x, y),
    ...overrides,
  };
  return { world, noSpawn };
}

function run(seconds: number, world: SpawnWorld, seed = 1) {
  const director = new SpawnDirector(new Rng(seed));
  const packs: SpawnRequest[][] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const requests = director.update(1 / 60, world);
    if (requests.length > 0) packs.push(requests);
  }
  return { director, packs, all: packs.flat() };
}

describe('spawn rate', () => {
  it('ramps 0.1 per day from 1.0 and caps at 3.0', () => {
    expect(spawnRate(1, 0)).toBeCloseTo(1.0);
    expect(spawnRate(15, 0)).toBeCloseTo(2.4);
    expect(spawnRate(40, 0)).toBeCloseTo(3.0);
  });

  it('is 0.2 at night and blends linearly at dusk and dawn', () => {
    expect(spawnRate(1, 1)).toBeCloseTo(0.2);
    expect(spawnRate(1, 0.5)).toBeCloseTo(0.6);
  });

  it('spawns about rate × time enemies', () => {
    const { world } = makeWorld();
    const { all } = run(600, world);
    expect(all.length).toBeGreaterThan(580);
    expect(all.length).toBeLessThanOrEqual(600);
  });
});

describe('spawn weights', () => {
  it('uses the day roster by day and the night roster at night', () => {
    expect(rosterWeights(1, 0)).toEqual([
      { type: 'imp', weight: 60 },
      { type: 'shambler', weight: 30 },
      { type: 'brute', weight: 8 },
    ]);
    expect(rosterWeights(1, 1)).toEqual([
      { type: 'shambler', weight: 40 },
      { type: 'brute', weight: 20 },
    ]);
  });

  it('blends weights during dusk and dawn', () => {
    const imp = rosterWeights(1, 0.5).find((w) => w.type === 'imp');
    expect(imp?.weight).toBeCloseTo(30);
  });

  it('produces the day mix (imps about 61%)', () => {
    const { world } = makeWorld();
    const { all } = run(1500, world, 7);
    const imps = all.filter((r) => r.type === 'imp').length / all.length;
    expect(imps).toBeGreaterThan(0.56);
    expect(imps).toBeLessThan(0.66);
  });

  it('makes about 1 in 20 spawns elite', () => {
    const { world } = makeWorld({ day: 20 });
    const { all } = run(2000, world, 3);
    const share = all.filter((r) => r.elite).length / all.length;
    expect(share).toBeGreaterThan(0.035);
    expect(share).toBeLessThan(0.065);
  });
});

describe('spawn locations', () => {
  it('never spawns in rock, on a building, or on a no-spawn tile, and always off screen', () => {
    const { world } = makeWorld();
    const { all } = run(1200, world, 11);
    expect(all.length).toBeGreaterThan(1000);
    for (const r of all) {
      const tx = Math.floor(r.x);
      const ty = Math.floor(r.y);
      expect(world.isRock(tx, ty)).toBe(false);
      expect(world.isBuilding(tx, ty)).toBe(false);
      expect(world.isNoSpawn(tx, ty)).toBe(false);
      expect(isOffScreen(tx, ty, world.camera)).toBe(true);
    }
  });

  it('places packs 32–40 tiles from their anchor, about half around the Phylactery', () => {
    // Player far from the Phylactery, so the two rings do not overlap.
    const { world } = makeWorld({ player: { x: 200.5, y: 0.5 }, camera: { x: 200.5, y: 0.5 } });
    const { packs } = run(1200, world, 5);
    let aroundPhylactery = 0;
    for (const pack of packs) {
      const anchor = pack[0]!.anchor === 'phylactery' ? world.phylactery : world.player;
      if (pack[0]!.anchor === 'phylactery') aroundPhylactery++;
      for (const r of pack) {
        const d = Math.hypot(r.x - anchor.x, r.y - anchor.y);
        // Center 32–40 out, members up to 3 tiles (diagonally ~4.3) from it, plus tile rounding.
        expect(d).toBeGreaterThan(SPAWN.ringMin - 5.5);
        expect(d).toBeLessThan(SPAWN.ringMax + 5.5);
      }
    }
    const share = aroundPhylactery / packs.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it('lets flying enemies spawn over rock but not ground enemies', () => {
    const { world } = makeWorld({ isRock: () => true });
    expect(canSpawnAt(40, 40, false, world)).toBe(false);
    expect(canSpawnAt(40, 40, true, world)).toBe(true);
  });
});

describe('spawn budget', () => {
  it('caps the budget at 12 and retries after a failed pack', () => {
    const { world } = makeWorld({ isGenerated: () => false });
    const { director, all } = run(60, world);
    expect(all).toHaveLength(0);
    expect(director.budget).toBeLessThanOrEqual(12);
    expect(director.budget).toBeGreaterThan(11);
  });

  it('stops growing at the active enemy cap and never spawns past it', () => {
    const { world } = makeWorld({ activeEnemies: SPAWN.maxActiveEnemies });
    const { director, all } = run(30, world);
    expect(all).toHaveLength(0);
    expect(director.budget).toBe(0);

    const near = makeWorld({ activeEnemies: SPAWN.maxActiveEnemies - 1 }).world;
    const director2 = new SpawnDirector(new Rng(2));
    director2.budget = 12;
    const requests = director2.update(1 / 60, near);
    expect(requests.length).toBeLessThanOrEqual(1);
  });

  it('spawns nothing while paused', () => {
    const { world } = makeWorld();
    const director = new SpawnDirector(new Rng(1));
    director.paused = true;
    for (let i = 0; i < 600; i++) expect(director.update(1 / 60, world)).toHaveLength(0);
  });
});
