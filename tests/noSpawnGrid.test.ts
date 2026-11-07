import { describe, expect, it } from 'vitest';
import { NoSpawnGrid } from '../src/world/noSpawnGrid';

describe('NoSpawnGrid', () => {
  it('blocks every tile within the radius of the footprint, and nothing beyond', () => {
    const grid = new NoSpawnGrid();
    grid.add({ x: 0, y: 0, w: 1, h: 1 }, 3);
    expect(grid.isBlocked(0, 0)).toBe(true);
    expect(grid.isBlocked(3, 3)).toBe(true);
    expect(grid.isBlocked(-3, -3)).toBe(true);
    expect(grid.isBlocked(4, 0)).toBe(false);
    expect(grid.isBlocked(0, -4)).toBe(false);
  });

  it('measures the radius from each edge of a larger footprint', () => {
    const grid = new NoSpawnGrid();
    grid.add({ x: -1, y: -1, w: 3, h: 3 }, 3);
    expect(grid.isBlocked(4, 0)).toBe(true);
    expect(grid.isBlocked(5, 0)).toBe(false);
    expect(grid.isBlocked(-4, -4)).toBe(true);
    expect(grid.isBlocked(-5, 0)).toBe(false);
  });

  it('gives a Totem-sized radius of 5 an 11 × 11 area', () => {
    const grid = new NoSpawnGrid();
    grid.add({ x: 10, y: 10, w: 1, h: 1 }, 5);
    let blocked = 0;
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (grid.isBlocked(x, y)) blocked++;
    expect(blocked).toBe(121);
  });

  it('keeps overlapping tiles blocked until every building covering them is removed', () => {
    const grid = new NoSpawnGrid();
    const a = { x: 0, y: 0, w: 1, h: 1 };
    const b = { x: 2, y: 0, w: 1, h: 1 };
    grid.add(a, 3);
    grid.add(b, 3);
    expect(grid.countAt(1, 0)).toBe(2);
    grid.remove(a, 3);
    expect(grid.isBlocked(1, 0)).toBe(true);
    expect(grid.isBlocked(-3, 0)).toBe(false);
    grid.remove(b, 3);
    expect(grid.isBlocked(1, 0)).toBe(false);
    expect(grid.countAt(1, 0)).toBe(0);
  });
});
