import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { TILE } from '../src/data/terrain';
import { Game, type PlayerCommand } from '../src/game';

const DT = 1 / 60;
const idle: PlayerCommand = { move: { up: false, down: false, left: false, right: false }, aim: { x: 0, y: 0 }, bolt: false, chain: false };

function quietGame(): Game {
  const game = new Game(1, new EventBus<GameEvents>());
  game.director.paused = true;
  game.godMode = true;
  return game;
}

/** Makes a strip of tiles all one type (forcing the terrain, for a clean measurement). */
function paint(game: Game, x0: number, x1: number, y: number, tile: number): void {
  for (let x = x0; x <= x1; x++) for (let dy = -2; dy <= 2; dy++) game.map.setTile(x, y + dy, tile as never);
}

/** How far a Shambler walking toward a far-away player covers in 2 s on the given ground. */
function shamblerDistance(tile: number): number {
  const game = quietGame();
  // Player east of the Shambler (and much closer than the Phylactery); a straight strip of ground between them.
  game.player.x = game.player.prevX = 30.5;
  game.player.y = game.player.prevY = 20.5;
  paint(game, 15, 31, 20, tile);
  for (let i = 0; i < 3; i++) game.tick(DT, idle);
  const s = game.spawnEnemy('shambler', 20.5, 20.5, false);
  const x0 = s.x;
  const y0 = s.y;
  for (let i = 0; i < 120; i++) game.tick(DT, idle);
  expect(s.target).toBe('player');
  return Math.hypot(s.x - x0, s.y - y0);
}

describe('marsh slows demons', () => {
  it('halves a ground demon\'s speed on marsh', () => {
    const onGrass = shamblerDistance(TILE.grass);
    const onMarsh = shamblerDistance(TILE.marsh);
    // Shambler: 45 px/s = 1.41 tiles/s, so ~2.8 tiles in 2 s on grass, ~1.4 on marsh.
    expect(onGrass).toBeCloseTo(2.81, 0);
    expect(onMarsh / onGrass).toBeCloseTo(0.5, 1);
  });
});

describe('terrain edits', () => {
  it('turns grass or dirt into marsh, and emits tile:changed', () => {
    const events = new EventBus<GameEvents>();
    const game = new Game(1, events);
    const changes: number[] = [];
    events.on('tile:changed', (e) => changes.push(e.tile));
    game.gain({ flesh: 20, ichor: 2 });
    game.map.setTile(5, 5, TILE.grass);
    game.map.setTile(6, 5, TILE.dirt);
    expect(game.editTerrain('marsh', 5, 5)).toBeUndefined();
    expect(game.editTerrain('marsh', 6, 5)).toBeUndefined();
    expect(game.map.getTile(5, 5)).toBe(TILE.marsh);
    expect(game.map.getTile(6, 5)).toBe(TILE.marsh);
    expect(changes).toEqual([TILE.marsh, TILE.marsh]);
    // 10 Flesh + 1 Ichor each.
    expect(game.resources.get('flesh')).toBe(0);
    expect(game.resources.get('ichor')).toBe(0);
  });

  it('costs 5 Bone + 5 Flesh to fill, and refuses when you cannot pay', () => {
    const game = quietGame();
    game.map.setTile(7, 8, TILE.marsh);
    expect(game.editTerrain('fill', 7, 8)).toBe('Not enough resources');
    expect(game.map.getTile(7, 8)).toBe(TILE.marsh);
    game.gain({ bone: 5, flesh: 5 });
    expect(game.editTerrain('fill', 7, 8)).toBeUndefined();
    expect(game.resources.snapshot()).toMatchObject({ bone: 0, flesh: 0 });
  });

  it('fills any marsh, wild or player-made, into dirt', () => {
    const game = quietGame();
    game.gain({ bone: 100, flesh: 100, ichor: 10 });
    game.map.setTile(7, 7, TILE.marsh); // stands in for wild marsh
    expect(game.editTerrain('fill', 7, 7)).toBeUndefined();
    expect(game.map.getTile(7, 7)).toBe(TILE.dirt);
    game.map.setTile(8, 7, TILE.grass);
    game.editTerrain('marsh', 8, 7);
    expect(game.editTerrain('fill', 8, 7)).toBeUndefined();
    expect(game.map.getTile(8, 7)).toBe(TILE.dirt);
  });

  it('refuses edits that break the rules, without charging for them', () => {
    const game = quietGame();
    game.gain({ bone: 100, flesh: 100, ichor: 10 });
    game.map.setTile(9, 9, TILE.rock);
    expect(game.editTerrain('marsh', 9, 9)).toBe('Marsh needs grass or dirt');
    expect(game.editTerrain('fill', 9, 9)).toBe('Only marsh can be filled');
    game.map.setTile(10, 9, TILE.marsh);
    expect(game.editTerrain('marsh', 10, 9)).toBe('Marsh needs grass or dirt');
    // The Phylactery's own tiles and its 16-tile ring.
    expect(game.editTerrain('marsh', 0, 0)).toBe('A building is in the way');
    expect(game.editTerrain('marsh', 0, 2)).toBe('Too close to the Phylactery');
    expect(game.editTerrain('marsh', 5000, 5000)).toBe('Not explored yet');
    expect(game.resources.snapshot()).toMatchObject({ bone: 100, flesh: 100, ichor: 10 });
    game.map.setTile(3, 3, TILE.grass);
    expect(game.editTerrain('marsh', 3, 3)).toBeUndefined();
  });

  it('makes a filled tile buildable again (marsh is not buildable)', async () => {
    const { TILE_PROPS } = await import('../src/data/terrain');
    expect(TILE_PROPS[TILE.marsh].buildable).toBe(false);
    expect(TILE_PROPS[TILE.dirt].buildable).toBe(true);
  });
});
