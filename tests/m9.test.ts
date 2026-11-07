import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { TILE } from '../src/data/terrain';
import { Game, type PlayerCommand } from '../src/game';
import { formatCountdown } from '../src/ui/hud';
import { Warnings } from '../src/ui/warnings';
import { cycleStateAt } from '../src/time/dayCycle';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const cmd = (over: Partial<PlayerCommand> = {}): PlayerCommand => ({ move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false, ...over });
const ticks = (game: Game, seconds: number, c: PlayerCommand = cmd()) => {
  for (let i = 0; i < Math.round(seconds / DT) && !game.outcome; i++) game.tick(DT, c);
};

/** Open ground, no starting base, spawning off, player at (30.5, 30.5). */
function arena(seed = 9): { game: Game; events: EventBus<GameEvents> } {
  const events = new EventBus<GameEvents>();
  const game = new Game(seed, events, { startingBase: false });
  game.director.paused = true;
  for (let x = 10; x <= 50; x++) for (let y = 10; y <= 50; y++) game.map.setTile(x, y, TILE.grass);
  game.player.x = game.player.prevX = 30.5;
  game.player.y = game.player.prevY = 30.5;
  ticks(game, 3 * DT);
  game.gain({ bone: 200, flesh: 200, ichor: 50 });
  return { game, events };
}

describe('Wraiths', () => {
  it('fade in for 2 s: no moving, no attacking, and bolts pass through', () => {
    const { game } = arena();
    const w = game.spawnEnemy('wraith', 34.5, 30.5, false);
    const hp = w.hp;
    // Fire straight through it while it fades in.
    ticks(game, 1.5, cmd({ aim: { x: 40, y: 30.5 }, bolt: true }));
    expect(w.hp).toBe(hp);
    expect(w.x).toBe(34.5);
    expect(game.enemyShots).toHaveLength(0);
    // Once faded in, it can be hit.
    ticks(game, 1.2, cmd({ aim: { x: w.x, y: w.y }, bolt: true }));
    expect(w.hp).toBeLessThan(hp);
  });

  it('stop within 6 tiles and fire slow shots (3 tiles/s) that hit the player', () => {
    const { game, events } = arena();
    let hits = 0;
    events.on('player:damaged', () => hits++);
    const w = game.spawnEnemy('wraith', 42.5, 30.5, false);
    w.fadeIn = 0;
    ticks(game, 4);
    expect(Math.hypot(w.x - game.player.x, w.y - game.player.y)).toBeLessThanOrEqual(6.05);
    expect(Math.hypot(w.x - game.player.x, w.y - game.player.y)).toBeGreaterThan(5.5);
    const shot = game.enemyShots[0];
    if (shot) expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(3);
    ticks(game, 3);
    expect(hits).toBeGreaterThan(0);
  });

  it('have their shots blocked by the first building in the way, which takes the damage', () => {
    const { game } = arena();
    game.godMode = true;
    const wall = game.placeBuilding('wall', 33, 30);
    if (typeof wall === 'string') throw new Error(wall);
    const w = game.spawnEnemy('wraith', 36.5, 30.5, false);
    w.fadeIn = 0;
    ticks(game, 3);
    expect(wall.hp).toBeLessThan(150);
  });

  it('fly over walls and rock', () => {
    const { game } = arena();
    game.godMode = true;
    for (let y = 20; y <= 40; y++) game.placeBuilding('wall', 36, y);
    for (let y = 20; y <= 40; y++) game.map.setTile(38, y, TILE.rock);
    const w = game.spawnEnemy('wraith', 44.5, 30.5, false);
    w.fadeIn = 0;
    ticks(game, 5);
    expect(w.x).toBeLessThan(36.5);
  });

  it('go for a Grave Lantern before a slightly closer player (Lantern distance counts half)', () => {
    const { game } = arena();
    game.godMode = true;
    game.placeBuilding('lantern', 40, 37); // ~9.2 from the Wraith → scores 4.6
    const w = game.spawnEnemy('wraith', 40.5, 28.5, false); // ~10.1 from the player
    w.fadeIn = 0;
    game.tick(DT, cmd());
    expect(w.target).toBe('lantern');
  });

  it('cannot be targeted by Totems or Chain while fading in', () => {
    const { game, events } = arena();
    game.placeBuilding('totem', 33, 33);
    let damaged = 0;
    events.on('enemy:damaged', () => damaged++);
    game.spawnEnemy('wraith', 35.5, 34.5, false);
    ticks(game, 1.5, cmd({ aim: { x: 35.5, y: 34.5 }, chain: true }));
    expect(damaged).toBe(0);
  });
});

describe('completion and respawn', () => {
  function onDay15(): { game: Game; events: EventBus<GameEvents> } {
    const r = arena();
    r.game.cycle.jumpToDay(15);
    return r;
  }

  it('counts down 150 s on day 15 and wins when the day phase ends', () => {
    const { game, events } = onDay15();
    const won: number[] = [];
    events.on('run:won', (s) => won.push(s.day));
    game.godMode = true;
    expect(game.completionRemaining()).toBeCloseTo(150);
    ticks(game, 100);
    expect(game.completionRemaining()).toBeCloseTo(50, 0);
    expect(game.completed).toBe(false);
    ticks(game, 51);
    expect(game.completed).toBe(true);
    expect(won).toEqual([15]);
    expect(game.outcome).toBeUndefined();
    expect(game.completionRemaining()).toBeUndefined();
  });

  it('does not count down on other days', () => {
    const { game } = arena();
    game.cycle.jumpToDay(14);
    expect(game.completionRemaining()).toBeUndefined();
  });

  it('after completion, death costs the Phylactery 30 HP and respawns the player at (0, 2) after 3 s', () => {
    const { game, events } = onDay15();
    ticks(game, 151);
    expect(game.completed).toBe(true);
    const respawned: number[] = [];
    events.on('player:respawned', () => respawned.push(game.cycle.elapsed));
    game.player.hp = 1;
    game.player.boltCooldown = 0.2;
    const brute = game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    game.tick(DT, cmd());
    expect(game.playerDead).toBe(true);
    expect(game.outcome).toBeUndefined();
    expect(game.phylactery.hp).toBe(570);
    brute.alive = false;
    // The view pans to the Phylactery over the first second.
    ticks(game, 1.1);
    expect(Math.hypot(game.viewCenter().x - 0.5, game.viewCenter().y - 0.5)).toBeLessThan(0.01);
    ticks(game, 2);
    expect(game.playerDead).toBe(false);
    expect(respawned).toHaveLength(1);
    expect(game.player.x).toBe(0.5);
    expect(game.player.y).toBe(2.5);
    expect(game.player.hp).toBe(game.player.maxHp);
    expect(game.player.invulnerable).toBeGreaterThan(2.8);
    expect(game.player.boltCooldown).toBe(0);
  });

  it('enemies ignore a dead necromancer', () => {
    const { game } = onDay15();
    ticks(game, 151);
    game.player.hp = 1;
    const imp = game.spawnEnemy('imp', game.player.x + 1.5, game.player.y, false);
    game.tick(DT, cmd());
    expect(game.playerDead).toBe(true);
    game.tick(DT, cmd());
    expect(imp.target).toBe('phylactery');
  });

  it('a death that drains the Phylactery to 0 ends the run', () => {
    const { game } = onDay15();
    ticks(game, 151);
    game.phylactery.hp = 20;
    game.player.hp = 1;
    game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    game.tick(DT, cmd());
    expect(game.outcome?.cause).toBe('phylactery');
  });

  it('player death before completion still ends the run', () => {
    const { game } = arena();
    game.player.hp = 1;
    game.spawnEnemy('brute', game.player.x + 1.5, game.player.y, false);
    game.tick(DT, cmd());
    expect(game.outcome?.cause).toBe('player');
  });
});

describe('Phylactery countdown text', () => {
  it('reads 2:30 down to 0:00', () => {
    expect(formatCountdown(150)).toBe('2:30');
    expect(formatCountdown(61)).toBe('1:01');
    expect(formatCountdown(0.4)).toBe('0:01');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('warnings', () => {
  function run(events: EventBus<GameEvents>, warnings: Warnings, from: number, to: number, hp = 600) {
    for (let t = from; t < to; t += DT) warnings.update(DT, { cycle: cycleStateAt(t), phylacteryHp: hp, phylacteryMaxHp: 600 });
    void events;
  }

  it('warn 10 s before dusk and before dawn, once each', () => {
    const events = new EventBus<GameEvents>();
    const w = new Warnings();
    w.attach(events);
    run(events, w, 130, 142);
    expect(w.banners.map((b) => b.text)).toEqual(['Dusk approaching']);
    run(events, w, 225, 232);
    expect(w.banners.map((b) => b.text)).toEqual(['Dawn approaching. The swarm returns']);
  });

  it('show "under attack" at most once per 15 s', () => {
    const events = new EventBus<GameEvents>();
    const w = new Warnings();
    w.attach(events);
    events.emit('phylactery:damaged', { amount: 4, hp: 596 });
    events.emit('phylactery:damaged', { amount: 4, hp: 592 });
    expect(w.banners).toHaveLength(1);
    run(events, w, 10, 26);
    events.emit('phylactery:damaged', { amount: 4, hp: 588 });
    expect(w.banners.filter((b) => b.text === 'Phylactery under attack!')).toHaveLength(1);
    expect(w.banners.at(-1)?.text).toBe('Phylactery under attack!');
  });

  it('show "critical" below 25%, and again only after a repair above 25%', () => {
    const events = new EventBus<GameEvents>();
    const w = new Warnings();
    w.attach(events);
    const critical = () => w.banners.filter((b) => b.text === 'Phylactery critical!').length;
    run(events, w, 10, 10.5, 140);
    expect(critical()).toBe(1);
    run(events, w, 10.5, 14, 100);
    expect(critical()).toBe(0); // the first banner expired, and no new one while still low
    run(events, w, 14, 14.5, 200);
    run(events, w, 14.5, 15, 120);
    expect(critical()).toBe(1);
  });

  it('announce day 15 and completion', () => {
    const events = new EventBus<GameEvents>();
    const w = new Warnings();
    w.attach(events);
    events.emit('phase:day', { day: 15 });
    events.emit('run:won', { day: 15, kills: 0, corpsesHarvested: 0, score: 0 });
    expect(w.banners.map((b) => b.text)).toEqual(['Day 15. The binding begins', 'The Phylactery is complete']);
  });
});
