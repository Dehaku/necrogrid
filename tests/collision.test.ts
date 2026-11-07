import { describe, expect, it } from 'vitest';
import { TILE } from '../src/data/terrain';
import { isWalkableTile, playerSpeedMultiplier, resolveCircleCollision } from '../src/world/grid';

const single = (bx: number, by: number) => (tx: number, ty: number) => tx === bx && ty === by;

describe('resolveCircleCollision', () => {
  it('leaves a circle alone when nothing overlaps', () => {
    expect(resolveCircleCollision(0.5, 0.5, 0.5, single(5, 5))).toEqual({ x: 0.5, y: 0.5 });
  });

  it('pushes a circle out of a tile edge', () => {
    // Rock at tile (1, 0); circle center 0.3 tiles left of its west edge.
    const p = resolveCircleCollision(0.7, 0.5, 0.5, single(1, 0));
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });

  it('pushes a circle away from a tile corner along the diagonal', () => {
    const p = resolveCircleCollision(0.8, 0.8, 0.5, single(1, 1));
    const d = Math.hypot(1 - p.x, 1 - p.y);
    expect(d).toBeCloseTo(0.5);
    expect(p.x).toBeCloseTo(p.y);
  });

  it('gets a circle whose center is inside a tile out through the nearest edge', () => {
    const p = resolveCircleCollision(1.1, 0.5, 0.5, single(1, 0));
    expect(p.x).toBeCloseTo(0.5);
  });

  it('does not snag on the seam between two wall tiles', () => {
    const wall = (tx: number) => tx === 1;
    const p = resolveCircleCollision(0.6, 2.0, 0.5, wall);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(2.0);
  });
});

describe('tile helpers', () => {
  it('treats rock and ungenerated tiles as blocked', () => {
    expect(isWalkableTile(TILE.grass)).toBe(true);
    expect(isWalkableTile(TILE.marsh)).toBe(true);
    expect(isWalkableTile(TILE.rock)).toBe(false);
    expect(isWalkableTile(undefined)).toBe(false);
  });

  it('slows the player on marsh only', () => {
    expect(playerSpeedMultiplier(TILE.marsh)).toBe(0.5);
    expect(playerSpeedMultiplier(TILE.dirt)).toBe(1);
  });
});
