import { describe, expect, it } from 'vitest';
import { createPlayer, updatePlayer, type MoveIntent, type PlayerTerrain } from '../src/entities/player';

const still: MoveIntent = { up: false, down: false, left: false, right: false };
const open: PlayerTerrain = { speedMultiplierAt: () => 1, isBlocked: () => false };

function run(move: MoveIntent, seconds: number, terrain = open) {
  const player = createPlayer(0, 0);
  for (let i = 0; i < seconds * 60; i++) {
    updatePlayer(player, move, { x: player.x + 1, y: player.y }, 1 / 60, terrain);
  }
  return player;
}

describe('player movement', () => {
  it('starts on the center of its tile', () => {
    const player = createPlayer(0, 2);
    expect(player.x).toBe(0.5);
    expect(player.y).toBe(2.5);
  });

  it('moves at 120 px/s (3.75 tiles/s)', () => {
    const player = run({ ...still, right: true }, 1);
    expect(player.x - 0.5).toBeCloseTo(3.75);
    expect(player.y).toBe(0.5);
  });

  it('is not faster on diagonals', () => {
    const player = run({ ...still, up: true, right: true }, 1);
    expect(Math.hypot(player.x - 0.5, player.y - 0.5)).toBeCloseTo(3.75);
  });

  it('does not move when opposite keys cancel', () => {
    const player = run({ ...still, left: true, right: true }, 1);
    expect(player.x).toBe(0.5);
  });

  it('faces the aim point', () => {
    const player = createPlayer(0, 0);
    updatePlayer(player, still, { x: 0.5, y: 5 }, 1 / 60, open);
    expect(player.facing).toBeCloseTo(Math.PI / 2);
  });

  it('moves at half speed on marsh', () => {
    const marsh: PlayerTerrain = { speedMultiplierAt: () => 0.5, isBlocked: () => false };
    const player = run({ ...still, right: true }, 1, marsh);
    expect(player.x - 0.5).toBeCloseTo(1.875);
  });

  it('stops against a blocked column and slides along it', () => {
    // Everything at x >= 3 is blocked.
    const wall: PlayerTerrain = { speedMultiplierAt: () => 1, isBlocked: (tx) => tx >= 3 };
    const player = run({ ...still, right: true, down: true }, 2, wall);
    expect(player.x).toBeCloseTo(2.5);
    expect(player.y).toBeGreaterThan(4);
  });
});
