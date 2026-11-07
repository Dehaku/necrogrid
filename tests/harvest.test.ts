import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { Game, type PlayerCommand } from '../src/game';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const cmd = (over: Partial<PlayerCommand> = {}): PlayerCommand => ({ move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false, ...over });

function quietGame(): { game: Game; events: EventBus<GameEvents> } {
  const events = new EventBus<GameEvents>();
  const game = new Game(4, events);
  game.director.paused = true;
  game.player.x = game.player.prevX = 12.5;
  game.player.y = game.player.prevY = 12.5;
  for (let i = 0; i < 3; i++) game.tick(DT, cmd());
  return { game, events };
}

/** Kills an enemy right next to the player so it leaves a corpse there. */
function corpseNextToPlayer(game: Game, type: 'imp' | 'shambler' | 'brute' = 'shambler', elite = false, dx = 0.6) {
  const e = game.spawnEnemy(type, game.player.x + dx, game.player.y, elite);
  game.damageEnemy(e, 1e6);
  return game.corpses[game.corpses.length - 1]!;
}

function ticks(game: Game, seconds: number, c: PlayerCommand): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.tick(DT, c);
}

describe('corpses and harvesting', () => {
  it('leaves a corpse with rolled loot when an enemy dies', () => {
    const { game } = quietGame();
    const corpse = corpseNextToPlayer(game, 'brute');
    expect(corpse.size).toBe('large');
    expect(corpse.loot.ichor).toBe(1);
    expect(game.corpses).toHaveLength(1);
  });

  it('harvests a medium corpse in 1.0 s and adds its loot', () => {
    const { game, events } = quietGame();
    const corpse = corpseNextToPlayer(game, 'shambler');
    const popups: unknown[] = [];
    events.on('corpse:harvested', (e) => popups.push(e.loot));
    game.tick(DT, cmd({ harvest: true }));
    ticks(game, 0.9, cmd());
    expect(game.corpses).toContain(corpse);
    ticks(game, 0.15, cmd());
    expect(game.corpses).not.toContain(corpse);
    expect(game.resources.get('bone')).toBe(corpse.loot.bone);
    expect(game.corpsesHarvested).toBe(1);
    expect(popups).toEqual([corpse.loot]);
  });

  it('gives an elite corpse 4× loot plus 1 Soul Shard', () => {
    const { game } = quietGame();
    const corpse = corpseNextToPlayer(game, 'imp', true);
    expect([4, 8]).toContain(corpse.loot.bone);
    ticks(game, 0.7, cmd({ harvest: true }));
    expect([1, 5]).toContain(game.resources.get('soulShard'));
  });

  it('is interrupted by taking damage', () => {
    const { game, events } = quietGame();
    corpseNextToPlayer(game, 'brute');
    const reasons: string[] = [];
    events.on('harvest:interrupted', (e) => reasons.push(e.reason));
    game.tick(DT, cmd({ harvest: true }));
    expect(game.harvest).toBeDefined();
    game.spawnEnemy('brute', game.player.x - 1.5, game.player.y, false);
    game.tick(DT, cmd());
    expect(reasons).toEqual(['damage']);
    expect(game.harvest).toBeUndefined();
    expect(game.corpses).toHaveLength(1);
  });

  it('is interrupted by moving more than 1 tile away', () => {
    const { game, events } = quietGame();
    corpseNextToPlayer(game, 'brute', false, 0.2);
    const reasons: string[] = [];
    events.on('harvest:interrupted', (e) => reasons.push(e.reason));
    game.tick(DT, cmd({ harvest: true }));
    ticks(game, 0.5, cmd({ move: { ...still, left: true } }));
    expect(reasons).toEqual(['moved']);
  });

  it('keeps harvesting corpse after corpse while the key is held', () => {
    const { game } = quietGame();
    corpseNextToPlayer(game, 'imp', false, 0.5);
    corpseNextToPlayer(game, 'imp', false, -0.5);
    ticks(game, 1.3, cmd({ harvest: true }));
    expect(game.corpses).toHaveLength(0);
    expect(game.corpsesHarvested).toBe(2);
  });

  it('does nothing with no corpse in range', () => {
    const { game } = quietGame();
    corpseNextToPlayer(game, 'imp', false, 2);
    game.tick(DT, cmd({ harvest: true }));
    expect(game.harvest).toBeUndefined();
  });

  it('removes corpses once they have faded', () => {
    const { game } = quietGame();
    const corpse = corpseNextToPlayer(game, 'imp', false, 3);
    game.cycle.jumpToDay(2);
    game.tick(DT, cmd());
    expect(game.corpses).toContain(corpse);
    game.cycle.skipPhase(); // to dusk of day 2: day 2's day phase is over
    game.tick(DT, cmd());
    expect(game.corpses).not.toContain(corpse);
  });
});

describe('Mend', () => {
  it('heals 25 HP over 1 s for 5 Flesh, with a 4 s cooldown', () => {
    const { game } = quietGame();
    game.gain({ flesh: 12 });
    game.player.hp = 50;
    game.tick(DT, cmd({ mend: true }));
    expect(game.resources.get('flesh')).toBe(7);
    ticks(game, 0.5, cmd());
    expect(game.player.hp).toBeGreaterThan(60);
    expect(game.player.hp).toBeLessThan(65);
    ticks(game, 0.6, cmd());
    expect(game.player.hp).toBeCloseTo(75);
    // Cooldown: a second press now does nothing.
    game.tick(DT, cmd({ mend: true }));
    expect(game.resources.get('flesh')).toBe(7);
    ticks(game, 3, cmd());
    game.tick(DT, cmd({ mend: true }));
    expect(game.resources.get('flesh')).toBe(2);
  });

  it('cannot be used at full HP or with less than 5 Flesh', () => {
    const { game } = quietGame();
    game.gain({ flesh: 20 });
    game.tick(DT, cmd({ mend: true }));
    expect(game.resources.get('flesh')).toBe(20);
    const poor = quietGame().game;
    poor.gain({ flesh: 4 });
    poor.player.hp = 10;
    poor.tick(DT, cmd({ mend: true }));
    expect(poor.player.hp).toBe(10);
    expect(poor.resources.get('flesh')).toBe(4);
  });

  it('is not interrupted by taking damage, and never heals past max', () => {
    const { game } = quietGame();
    game.gain({ flesh: 5 });
    game.player.hp = 90;
    game.tick(DT, cmd({ mend: true }));
    game.spawnEnemy('imp', game.player.x + 1.5, game.player.y, false);
    ticks(game, 1.2, cmd());
    expect(game.player.mendHealLeft).toBe(0);
    expect(game.player.hp).toBeLessThanOrEqual(100);
  });
});
