import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { Game, type PlayerCommand } from '../src/game';

const idle: PlayerCommand = { move: { up: false, down: false, left: false, right: false }, aim: { x: 0, y: 0 }, bolt: false, chain: false };

function quietGame(seed = 1): Game {
  const game = new Game(seed, new EventBus<GameEvents>());
  game.director.paused = true;
  // Let both flow fields build.
  game.tick(1 / 60, idle);
  game.tick(1 / 60, idle);
  return game;
}

describe('Game (M3)', () => {
  it('lets an enemy in melee range damage the player', () => {
    const game = quietGame();
    const { player } = game;
    // Away from the Phylactery, so the player is clearly the closer target.
    player.x = player.prevX = 12.5;
    player.y = player.prevY = 12.5;
    game.tick(1 / 60, idle);
    game.tick(1 / 60, idle);
    const imp = game.spawnEnemy('imp', player.x + 3, player.y + 2, false);
    for (let i = 0; i < 120; i++) game.tick(1 / 60, idle);
    expect(imp.target).toBe('player');
    expect(player.hp).toBeLessThan(player.maxHp);
  });

  it('sends an enemy closer to the Phylactery after it, and it damages the Phylactery', () => {
    const game = quietGame(2);
    // Move the player far away first.
    game.player.x = game.player.prevX = 30.5;
    game.player.y = game.player.prevY = 30.5;
    game.tick(1 / 60, idle);
    game.tick(1 / 60, idle);
    const imp = game.spawnEnemy('imp', 6.5, 0.5, false);
    for (let i = 0; i < 240; i++) game.tick(1 / 60, idle);
    expect(imp.target).toBe('phylactery');
    expect(game.phylactery.hp).toBeLessThan(game.phylactery.maxHp);
  });

  it('applies the elite multipliers', () => {
    const game = quietGame();
    const elite = game.spawnEnemy('brute', 20, 20, true);
    expect(elite.maxHp).toBe(90 * 2.5);
    expect(elite.damage).toBe(18 * 1.5);
  });

  it('removes enemies far from both the player and the Phylactery', () => {
    const game = quietGame();
    const far = game.spawnEnemy('shambler', 80, 80, false);
    game.tick(1 / 60, idle);
    expect(game.enemies).not.toContain(far);
  });

  it('keeps the Phylactery out of spawning: its tiles and 3 tiles around are no-spawn', () => {
    const game = quietGame();
    expect(game.noSpawn.isBlocked(0, 0)).toBe(true);
    expect(game.noSpawn.isBlocked(4, 4)).toBe(true);
    expect(game.noSpawn.isBlocked(5, 0)).toBe(false);
  });

  it('spawns on its own and stays deterministic for a seed', () => {
    const a = new Game(42, new EventBus<GameEvents>());
    const b = new Game(42, new EventBus<GameEvents>());
    for (let i = 0; i < 60 * 20; i++) {
      a.tick(1 / 60, idle);
      b.tick(1 / 60, idle);
    }
    expect(a.enemies.length).toBeGreaterThan(5);
    expect(a.enemies.map((e) => [e.type, e.x.toFixed(4), e.y.toFixed(4)])).toEqual(
      b.enemies.map((e) => [e.type, e.x.toFixed(4), e.y.toFixed(4)]),
    );
  });
});
