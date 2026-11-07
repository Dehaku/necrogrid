import { describe, expect, it } from 'vitest';
import { FlowField, FlowFields, type FlowTerrain } from '../src/world/flowField';
import { tileKey } from '../src/world/grid';

function terrain(rocks: [number, number][] = [], buildings: [number, number][] = []): FlowTerrain {
  const rock = new Set(rocks.map(([x, y]) => tileKey(x, y)));
  const building = new Set(buildings.map(([x, y]) => tileKey(x, y)));
  return {
    isWalkable: (x, y) => !rock.has(tileKey(x, y)),
    isBuilding: (x, y) => building.has(tileKey(x, y)),
  };
}

function build(t: FlowTerrain, radius = 10): FlowField {
  const field = new FlowField(radius);
  field.build(0, 0, [{ x: 0, y: 0 }], t);
  return field;
}

describe('FlowField', () => {
  it('stores octile path cost on open ground', () => {
    const field = build(terrain());
    expect(field.distanceAt(0, 0)).toBe(0);
    expect(field.distanceAt(5, 0)).toBeCloseTo(5);
    expect(field.distanceAt(3, 3)).toBeCloseTo(3 * Math.SQRT2);
    expect(field.distanceAt(4, 2)).toBeCloseTo(2 + 2 * Math.SQRT2);
  });

  it('points each tile toward the goal', () => {
    const field = build(terrain());
    expect(field.directionAt(5, 0)).toEqual({ x: -1, y: 0 });
    const diag = field.directionAt(3, 3)!;
    expect(diag.x).toBeCloseTo(-Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(-Math.SQRT1_2);
    expect(field.directionAt(0, 0)).toBeUndefined();
  });

  it('never cuts a corner: a diagonal step needs both side tiles open', () => {
    const field = build(terrain([[1, 0]]));
    // (1, 1) → (0, 0) would squeeze past the rock at (1, 0), so it goes via (0, 1).
    expect(field.distanceAt(1, 1)).toBeCloseTo(2);
    const step = field.directionAt(1, 1)!;
    expect(step).toEqual({ x: -1, y: 0 });
  });

  it('also refuses diagonals past a building corner', () => {
    const field = build(terrain([], [[0, 1]]));
    expect(field.distanceAt(1, 1)).toBeCloseTo(2);
  });

  it('routes around buildings when it can', () => {
    // A wall at x = 2 from y = -3 to 3; going around costs far less than +20.
    const wall: [number, number][] = [];
    for (let y = -3; y <= 3; y++) wall.push([2, y]);
    const field = build(terrain([], wall));
    const cost = field.distanceAt(4, 0)!;
    expect(cost).toBeGreaterThan(4);
    expect(cost).toBeLessThan(20);
  });

  it('paths through a building, at +20, when it is the only way', () => {
    const ring: [number, number][] = [];
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.max(Math.abs(x), Math.abs(y)) === 2) ring.push([x, y]);
    const field = build(terrain([], ring));
    expect(field.distanceAt(3, 0)).toBeCloseTo(3 + 20);
    expect(field.directionAt(3, 0)).toEqual({ x: -1, y: 0 });
  });

  it('marks tiles sealed off by rock as unreachable', () => {
    const ring: [number, number][] = [];
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.max(Math.abs(x), Math.abs(y)) === 2) ring.push([x, y]);
    const field = build(terrain(ring));
    expect(field.distanceAt(5, 5)).toBe(Infinity);
    expect(field.directionAt(5, 5)).toBeUndefined();
  });

  it('returns undefined outside its window', () => {
    const field = build(terrain(), 10);
    expect(field.distanceAt(10, 0)).toBeDefined();
    expect(field.distanceAt(11, 0)).toBeUndefined();
    expect(field.sample(30.5, 0.5)).toBeUndefined();
  });

  it('blends directions smoothly between tile centers', () => {
    const field = build(terrain());
    // Between (3,0) pointing west and (3,1) pointing north-west.
    const v = field.sample(3.5, 1.0)!;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(-Math.SQRT1_2);
  });
});

describe('FlowFields', () => {
  it('rebuilds at most one field per tick and alternates when both are dirty', () => {
    const fields = new FlowFields(terrain(), { x: 0, y: 0 }, [{ x: 2, y: 0 }]);
    fields.trackPlayer(5, 5);
    const first = fields.update();
    const second = fields.update();
    expect(new Set([first, second])).toEqual(new Set(['player', 'phylactery']));
    expect(fields.update()).toBeUndefined();
  });

  it('rebuilds the player field when the player changes tile', () => {
    const fields = new FlowFields(terrain(), { x: 0, y: 0 }, [{ x: 2, y: 0 }]);
    fields.trackPlayer(5, 5);
    fields.update();
    fields.update();
    fields.trackPlayer(5, 5);
    expect(fields.update()).toBeUndefined();
    fields.trackPlayer(6, 5);
    expect(fields.update()).toBe('player');
    expect(fields.player.distanceAt(6, 5)).toBe(0);
  });

  it('only rebuilds for chunks that overlap a window', () => {
    const fields = new FlowFields(terrain(), { x: 0, y: 0 }, [{ x: 2, y: 0 }]);
    fields.trackPlayer(0, 0);
    fields.update();
    fields.update();
    fields.chunkGenerated(400, 400, 16);
    expect(fields.update()).toBeUndefined();
    fields.chunkGenerated(32, 0, 16);
    expect(fields.update()).toBeDefined();
  });
});
