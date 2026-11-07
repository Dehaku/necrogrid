import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { ENEMIES } from '../src/data/enemies';
import { HOTBAR } from '../src/data/buildings';
import { TILE } from '../src/data/terrain';
import { Game, wiggleAngle, type PlayerCommand } from '../src/game';
import { choiceInfo } from '../src/ui/buildMenu';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const idle: PlayerCommand = { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false };
const ticks = (game: Game, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.tick(DT, idle);
};

/** Open ground, no starting base, player far from the Phylactery, a short wall between the player and an enemy. */
function wallScenario(): { game: Game; wall: number[] } {
  const game = new Game(8, new EventBus<GameEvents>(), { startingBase: false });
  game.director.paused = true;
  game.godMode = true;
  for (let x = 10; x <= 50; x++) for (let y = 10; y <= 50; y++) game.map.setTile(x, y, TILE.grass);
  game.player.x = game.player.prevX = 30.5;
  game.player.y = game.player.prevY = 30.5;
  ticks(game, 3 * DT);
  game.gain({ bone: 200 });
  // A 5-tile wall at x = 34, y 28..32: easy to walk around.
  const wall: number[] = [];
  for (let y = 28; y <= 32; y++) {
    const b = game.placeBuilding('wall', 34, y);
    if (typeof b === 'string') throw new Error(b);
    wall.push(b.id);
  }
  ticks(game, 3 * DT);
  return { game, wall };
}

describe('Shamblers are dumb', () => {
  it('walk straight at the target and hit the wall in the way, instead of going around', () => {
    const { game, wall } = wallScenario();
    const shambler = game.spawnEnemy('shambler', 38.5, 30.5, false);
    ticks(game, 6);
    // Still on the far side of the wall, and the wall took the hits.
    expect(shambler.x).toBeGreaterThan(34.4);
    const damaged = wall.map((id) => game.buildingsById.get(id)).filter((b) => b && b.hp < b.maxHp);
    expect(damaged.length).toBeGreaterThan(0);
  });

  it('while Imps still path around the same wall', () => {
    const { game, wall } = wallScenario();
    const imp = game.spawnEnemy('imp', 38.5, 30.5, false);
    ticks(game, 6);
    expect(Math.hypot(imp.x - game.player.x, imp.y - game.player.y)).toBeLessThanOrEqual(2.2);
    expect(wall.every((id) => game.buildingsById.get(id)!.hp === 150)).toBe(true);
  });

  it('are the only ground enemy without pathfinding', () => {
    expect(ENEMIES.shambler.navigation).toBe('direct');
    expect(ENEMIES.imp.navigation).toBe('field');
    expect(ENEMIES.brute.navigation).toBe('field');
    expect(ENEMIES.hellhound.navigation).toBe('field');
  });
});

describe('Shambler wiggle', () => {
  const wiggle = ENEMIES.shambler.wiggle!;

  it('stays within its strength', () => {
    let most = 0;
    for (let t = 0; t < 30; t += 0.05) most = Math.max(most, Math.abs(wiggleAngle(7, t, wiggle)));
    expect(most).toBeLessThanOrEqual(wiggle.strength);
    expect(most).toBeGreaterThan(wiggle.strength * 0.5);
  });

  it('is the same for the same enemy and time (deterministic), and differs between enemies', () => {
    expect(wiggleAngle(3, 12.5, wiggle)).toBe(wiggleAngle(3, 12.5, wiggle));
    expect(wiggleAngle(3, 12.5, wiggle)).not.toBe(wiggleAngle(4, 12.5, wiggle));
  });

  it('makes a Shambler sway off a straight line, but still arrive', () => {
    const game = new Game(8, new EventBus<GameEvents>(), { startingBase: false });
    game.director.paused = true;
    game.godMode = true;
    for (let x = 10; x <= 50; x++) for (let y = 10; y <= 50; y++) game.map.setTile(x, y, TILE.grass);
    game.player.x = game.player.prevX = 20.5;
    game.player.y = game.player.prevY = 30.5;
    ticks(game, 3 * DT);
    const s = game.spawnEnemy('shambler', 32.5, 30.5, false);
    let maxOff = 0;
    for (let i = 0; i < 8 * 60; i++) {
      game.tick(DT, idle);
      maxOff = Math.max(maxOff, Math.abs(s.y - 30.5));
    }
    expect(maxOff).toBeGreaterThan(0.1);
    expect(Math.hypot(s.x - game.player.x, s.y - game.player.y)).toBeLessThanOrEqual(2.2);
  });
});

describe('Corpse Collector link', () => {
  it('emits the link from the Collector to the corpse it takes', () => {
    const { game } = wallScenario();
    const events: { fromX: number; toX: number }[] = [];
    game.events.on('collector:collected', (e) => events.push(e));
    game.gain({ flesh: 10 });
    const c = game.placeBuilding('collector', 40, 40);
    if (typeof c === 'string') throw new Error(c);
    c.cooldown = 0;
    game.damageEnemy(game.spawnEnemy('imp', 41.5, 42.5, false), 1e6);
    game.tick(DT, idle);
    expect(events).toHaveLength(1);
    expect(events[0]!.fromX).toBe(40.5);
    expect(events[0]!.toX).toBeCloseTo(41.5);
  });
});

describe('build ghost info', () => {
  it('has a one-line description for every hotbar choice', () => {
    for (const choice of HOTBAR) {
      const d = choiceInfo(choice).description;
      expect(d.length).toBeGreaterThan(10);
      expect(d.length).toBeLessThan(60);
    }
  });

  it('shows reach circles for the Totem (6), Corpse Collector (3), and Grave Lantern aura (4) only', () => {
    expect(choiceInfo('totem').range).toBe(6);
    expect(choiceInfo('collector').range).toBe(3);
    expect(choiceInfo('lantern').range).toBe(4);
    expect(choiceInfo('wall').range).toBeUndefined();
  });
});
