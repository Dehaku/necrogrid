import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { computeScore, Game, type PlayerCommand } from '../src/game';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };

function quietGame(seed = 1): { game: Game; events: EventBus<GameEvents> } {
  const events = new EventBus<GameEvents>();
  const game = new Game(seed, events);
  game.director.paused = true;
  // Move away from the Phylactery so it never draws enemies or blocks shots.
  game.player.x = game.player.prevX = 12.5;
  game.player.y = game.player.prevY = 12.5;
  for (let i = 0; i < 3; i++) game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
  return { game, events };
}

describe('Bolt combat', () => {
  it('kills an enemy with bolts, counts the kill, and removes it', () => {
    const { game, events } = quietGame();
    const died: string[] = [];
    events.on('enemy:died', (e) => died.push(e.type));
    const shambler = game.spawnEnemy('shambler', game.player.x + 6, game.player.y, false);
    const shoot: PlayerCommand = { move: still, aim: { x: shambler.x, y: shambler.y }, bolt: true, chain: false };
    for (let i = 0; i < 90 && shambler.alive; i++) {
      shoot.aim = { x: shambler.x, y: shambler.y };
      game.tick(DT, shoot);
    }
    expect(shambler.alive).toBe(false);
    expect(died).toEqual(['shambler']);
    expect(game.kills).toBe(1);
    expect(game.enemies).not.toContain(shambler);
  });

  it('takes three 12-damage bolts to kill a 25 HP Shambler', () => {
    const { game, events } = quietGame();
    let hits = 0;
    events.on('enemy:damaged', () => hits++);
    const shambler = game.spawnEnemy('shambler', game.player.x + 4, game.player.y, false);
    for (let i = 0; i < 120 && shambler.alive; i++) {
      game.tick(DT, { move: still, aim: { x: shambler.x, y: shambler.y }, bolt: true, chain: false });
    }
    expect(hits).toBe(3);
  });
});

describe('player damage and death', () => {
  it('ignores further hits for 0.5 s after taking one', () => {
    const { game } = quietGame();
    const idle: PlayerCommand = { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false };
    // Two brutes in range at once: 18 damage each, but only one lands inside the window.
    game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    game.spawnEnemy('brute', game.player.x - 1.5, game.player.y, false);
    game.tick(DT, idle);
    expect(game.player.hp).toBe(100 - 18);
    for (let i = 0; i < 20; i++) game.tick(DT, idle);
    expect(game.player.hp).toBe(100 - 18);
  });

  it('ends the run when the player reaches 0 HP and stops the simulation', () => {
    const { game, events } = quietGame();
    const lost: string[] = [];
    events.on('run:lost', (o) => lost.push(o.cause));
    game.player.hp = 5;
    game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(game.player.hp).toBe(0);
    expect(game.outcome?.cause).toBe('player');
    expect(lost).toEqual(['player']);
    const elapsed = game.cycle.elapsed;
    game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(game.cycle.elapsed).toBe(elapsed);
  });

  it('does not end the run on Phylactery destruction until that rule is turned on (M9)', () => {
    const { game } = quietGame();
    game.phylactery.hp = 1;
    game.spawnEnemy('imp', 3.5, 0.5, false);
    for (let i = 0; i < 120; i++) game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(game.phylactery.hp).toBe(0);
    expect(game.outcome).toBeUndefined();
  });

  it('ends the run when the Phylactery is destroyed, once enabled', () => {
    const { game } = quietGame();
    game.phylacteryLossEnabled = true;
    game.phylactery.hp = 1;
    game.spawnEnemy('imp', 3.5, 0.5, false);
    for (let i = 0; i < 120 && !game.outcome; i++) game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(game.outcome?.cause).toBe('phylactery');
  });

  it('takes no damage in god mode', () => {
    const { game } = quietGame();
    game.godMode = true;
    game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    for (let i = 0; i < 180; i++) game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(game.player.hp).toBe(100);
  });

  it('emits a swipe event for each landed hit, aimed at the target', () => {
    const { game, events } = quietGame();
    const swipes: { angle: number; elite: boolean }[] = [];
    events.on('enemy:attacked', (e) => swipes.push(e));
    game.spawnEnemy('imp', game.player.x + 1.5, game.player.y, true);
    game.tick(DT, { move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false });
    expect(swipes).toHaveLength(1);
    // The imp is east of the player, so it swipes west (angle ±π).
    expect(Math.abs(swipes[0]!.angle)).toBeCloseTo(Math.PI);
    expect(swipes[0]!.elite).toBe(true);
  });
});

describe('score', () => {
  it('is day × 100 + kills × 2 − 10 per building lost', () => {
    expect(computeScore(1, 0, 0)).toBe(100);
    expect(computeScore(7, 50, 3)).toBe(700 + 100 - 30);
  });
});
