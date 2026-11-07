import { describe, expect, it } from 'vitest';
import { chainDamage, chainTargets, tryCastChain } from '../src/combat/chain';
import { EventBus, type GameEvents } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { CHAIN } from '../src/data/spells';
import { createPlayer } from '../src/entities/player';
import { Game, type PlayerCommand } from '../src/game';
import { jaggedPath } from '../src/render/effects';

type E = { x: number; y: number; id: string };
const at = (id: string, x: number, y: number): E => ({ id, x, y });

describe('chain damage falloff', () => {
  it('is 18 → 13.5 → 10.125 → 7.59', () => {
    expect([0, 1, 2, 3].map((i) => chainDamage(i))).toEqual([18, 13.5, 10.125, 7.59375]);
  });
});

describe('chainTargets', () => {
  it('hits a pack of 4: the first hit plus 3 jumps', () => {
    const pack = [at('a', 10, 0), at('b', 12, 0), at('c', 14, 0), at('d', 16, 0)];
    expect(chainTargets({ x: 10, y: 0 }, pack).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops after 3 jumps even with more enemies in range', () => {
    const pack = [at('a', 0, 0), at('b', 1, 0), at('c', 2, 0), at('d', 3, 0), at('e', 4, 0), at('f', 5, 0)];
    expect(chainTargets({ x: 0, y: 0 }, pack)).toHaveLength(4);
  });

  it('starts at the enemy nearest the cursor, within 6 tiles', () => {
    const enemies = [at('far', 0, 7), at('near', 4, 0)];
    expect(chainTargets({ x: 0, y: 0 }, enemies)[0]?.id).toBe('near');
    expect(chainTargets({ x: 0, y: 0 }, [at('far', 0, 6.1)])).toEqual([]);
  });

  it('jumps to the nearest unhit enemy within 4 tiles of the last one hit', () => {
    // From a: b is 3 away, c is 3.5 away → b. From b: a is already hit, c is 3 away → c.
    const enemies = [at('a', 0, 0), at('b', 3, 0), at('c', 1.5, 3.17), at('out', 20, 0)];
    expect(chainTargets({ x: 0, y: 0 }, enemies).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('cannot jump farther than 4 tiles', () => {
    const enemies = [at('a', 0, 0), at('b', 4.1, 0)];
    expect(chainTargets({ x: 0, y: 0 }, enemies).map((e) => e.id)).toEqual(['a']);
  });
});

describe('tryCastChain', () => {
  it('costs 15 mana and starts a 1 s cooldown when it hits', () => {
    const player = createPlayer(0, 0);
    expect(tryCastChain(player, { x: 3, y: 0 }, [at('a', 3, 0)])).toHaveLength(1);
    expect(player.mana).toBe(85);
    expect(player.chainCooldown).toBe(CHAIN.cooldown);
    expect(tryCastChain(player, { x: 3, y: 0 }, [at('a', 3, 0)])).toEqual([]);
  });

  it('spends nothing when no enemy is near the cursor', () => {
    const player = createPlayer(0, 0);
    expect(tryCastChain(player, { x: 3, y: 0 }, [at('a', 30, 0)])).toEqual([]);
    expect(player.mana).toBe(100);
    expect(player.chainCooldown).toBe(0);
  });
});

describe('Chain in the game', () => {
  it('damages a pack of 4 with falloff, ignoring rock between them', () => {
    const events = new EventBus<GameEvents>();
    const game = new Game(3, events);
    game.director.paused = true;
    game.player.x = game.player.prevX = 20.5;
    game.player.y = game.player.prevY = 20.5;
    const pack = [0, 1, 2, 3].map((i) => game.spawnEnemy('brute', 25.5 + i * 1.5, 20.5, false));
    // A rock wall between the player and the pack does not matter: Chain is hitscan.
    for (let y = 18; y <= 23; y++) game.map.setTile(23, y, 2 as never);
    const hits: number[] = [];
    let links = 0;
    events.on('enemy:damaged', (e) => hits.push(e.amount));
    events.on('chain:cast', (e) => (links = e.points.length));
    const cmd: PlayerCommand = { move: { up: false, down: false, left: false, right: false }, aim: { x: 25.5, y: 20.5 }, bolt: false, chain: true };
    game.tick(1 / 60, cmd);
    expect(hits).toEqual([18, 13.5, 10.125, 7.59375]);
    expect(links).toBe(5); // necromancer + 4 enemies
    expect(pack.map((b) => b.hp)).toEqual([72, 76.5, 79.875, 82.40625]);
  });
});

describe('jaggedPath', () => {
  it('keeps the link ends on the points and wanders sideways within the jitter', () => {
    const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
    const path = jaggedPath(points, new Rng(1));
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 3 });
    expect(path).toContainEqual({ x: 4, y: 0 });
    for (const p of path.slice(1, 9)) expect(Math.abs(p.y)).toBeLessThanOrEqual(CHAIN.jitter + 1e-9);
    expect(path.length).toBeGreaterThan(10);
  });
});
