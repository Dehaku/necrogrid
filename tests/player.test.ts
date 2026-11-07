import { describe, expect, it } from 'vitest';
import { createPlayer, updatePlayer, type MoveIntent } from '../src/entities/player';

const still: MoveIntent = { up: false, down: false, left: false, right: false };

function run(move: MoveIntent, seconds: number) {
  const player = createPlayer(0, 0);
  for (let i = 0; i < seconds * 60; i++) {
    updatePlayer(player, move, { x: player.x + 1, y: player.y }, 1 / 60);
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
    updatePlayer(player, still, { x: 0.5, y: 5 }, 1 / 60);
    expect(player.facing).toBeCloseTo(Math.PI / 2);
  });
});
