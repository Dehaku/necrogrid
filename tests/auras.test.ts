import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { TILE } from '../src/data/terrain';
import { Game, type PlayerCommand } from '../src/game';
import type { Building } from '../src/entities/building';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const idle: PlayerCommand = { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false };
const ticks = (game: Game, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.tick(DT, idle);
};

/** Open ground, no starting base, spawning off, player at (30.5, 30.5). */
function arena(): Game {
  const game = new Game(5, new EventBus<GameEvents>(), { startingBase: false });
  game.director.paused = true;
  for (let x = -10; x <= 50; x++) for (let y = -10; y <= 50; y++) {
    if (!game.buildings.has(x, y)) game.map.setTile(x, y, TILE.grass);
  }
  game.player.x = game.player.prevX = 30.5;
  game.player.y = game.player.prevY = 30.5;
  ticks(game, 3 * DT);
  return game;
}

function place(game: Game, kind: Parameters<Game['placeBuilding']>[0], x: number, y: number): Building {
  const b = game.placeBuilding(kind, x, y, { free: true, ignoreNoBuildZone: true });
  if (typeof b === 'string') throw new Error(b);
  return b;
}

describe('Grave Lantern aura', () => {
  it('heals the player 1 HP/s within 4 tiles, and not beyond', () => {
    const game = arena();
    place(game, 'lantern', 33, 30); // center (33.5, 30.5): 3 tiles from the player
    game.player.hp = 50;
    ticks(game, 10);
    expect(game.player.hp).toBeCloseTo(60, 1);

    game.player.x = game.player.prevX = 38.5; // 5 tiles away
    ticks(game, 5);
    expect(game.player.hp).toBeCloseTo(60, 1);
  });

  it('repairs buildings within 4 tiles 1 HP/s for free, and not beyond', () => {
    const game = arena();
    place(game, 'lantern', 20, 20);
    const near = place(game, 'wall', 23, 20);
    const far = place(game, 'wall', 26, 20);
    near.hp = 100;
    far.hp = 100;
    const before = game.resources.snapshot();
    ticks(game, 10);
    expect(near.hp).toBeCloseTo(110, 1);
    expect(far.hp).toBe(100);
    expect(game.resources.snapshot()).toEqual(before);
  });

  it('repairs itself and the Phylactery, and stops at full HP', () => {
    const game = arena();
    const lantern = place(game, 'lantern', 3, 0);
    lantern.hp = 30;
    game.phylactery.hp = 500;
    ticks(game, 20);
    expect(lantern.hp).toBe(lantern.maxHp);
    expect(game.phylactery.hp).toBeCloseTo(520, 1);
  });

  it('does not stack: two Lanterns heal as fast as one', () => {
    const game = arena();
    place(game, 'lantern', 33, 30);
    place(game, 'lantern', 30, 33);
    const wall = place(game, 'wall', 32, 32);
    wall.hp = 100;
    game.player.hp = 50;
    ticks(game, 10);
    expect(game.player.hp).toBeCloseTo(60, 1);
    expect(wall.hp).toBeCloseTo(110, 1);
  });
});

describe('Altar resource caps', () => {
  it('adds 50 to every cap per standing Altar', () => {
    const game = arena();
    expect(game.resources.cap('bone')).toBe(200);
    expect(game.resources.cap('ichor')).toBe(50);
    place(game, 'altar', 20, 20);
    expect(game.resources.cap('bone')).toBe(250);
    expect(game.resources.cap('flesh')).toBe(250);
    expect(game.resources.cap('ichor')).toBe(100);
    expect(game.resources.cap('soulShard')).toBe(100);
    game.gain({ bone: 999, ichor: 999 });
    expect(game.resources.get('bone')).toBe(250);
    expect(game.resources.get('ichor')).toBe(100);
    place(game, 'altar', 24, 20);
    expect(game.resources.cap('bone')).toBe(300);
  });

  it('keeps resources above the cap when an Altar is lost, but they cannot grow', () => {
    const game = arena();
    const altar = place(game, 'altar', 20, 20);
    game.gain({ bone: 250 });
    game.removeBuilding(altar.id);
    expect(game.resources.cap('bone')).toBe(200);
    expect(game.resources.get('bone')).toBe(250);
    game.gain({ bone: 10 });
    expect(game.resources.get('bone')).toBe(250);
    game.spend({ bone: 100 });
    game.gain({ bone: 100 });
    expect(game.resources.get('bone')).toBe(200);
  });
});
