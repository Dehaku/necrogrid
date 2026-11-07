import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { BUILDINGS, PHYLACTERY } from '../src/data/buildings';
import { TILE } from '../src/data/terrain';
import { phylacteryRingTiles } from '../src/entities/phylactery';
import { planStartingBase, ringAround } from '../src/entities/startingBase';
import { repairCostToFull, stepRepair, type Repairable } from '../src/economy/repair';
import { Game, type PlayerCommand } from '../src/game';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const cmd = (over: Partial<PlayerCommand> = {}): PlayerCommand => ({ move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false, ...over });
const ticks = (game: Game, seconds: number, c: PlayerCommand = cmd()) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.tick(DT, c);
};

/** A game with no starting base and the player away from the Phylactery, on cleared ground. */
function openGame(seed = 5): { game: Game; events: EventBus<GameEvents> } {
  const events = new EventBus<GameEvents>();
  const game = new Game(seed, events, { startingBase: false });
  game.director.paused = true;
  for (let x = 4; x <= 40; x++) for (let y = 4; y <= 40; y++) game.map.setTile(x, y, TILE.grass);
  game.player.x = game.player.prevX = 15.5;
  game.player.y = game.player.prevY = 15.5;
  ticks(game, 3 * DT);
  game.gain({ bone: 200, flesh: 200, ichor: 50, soulShard: 50 });
  return { game, events };
}

/** A square ring of walls `half` tiles out from (cx, cy), optionally with a door, around the player. */
function boxAround(game: Game, cx: number, cy: number, half: number, door?: { x: number; y: number }) {
  const placed = [];
  for (let y = cy - half; y <= cy + half; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== half) continue;
      const kind = door && door.x === x && door.y === y ? 'door' : 'wall';
      const b = game.placeBuilding(kind, x, y);
      if (typeof b === 'string') throw new Error(`${kind} at ${x},${y}: ${b}`);
      placed.push(b);
    }
  }
  return placed;
}

describe('starting base', () => {
  const fp = PHYLACTERY.footprint;
  const ring = ringAround(fp, 2);
  const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;

  it('uses the 24-tile ring 2 tiles out from the Phylactery', () => {
    expect(ring).toHaveLength(24);
    for (const t of ring) expect(Math.max(Math.abs(t.x), Math.abs(t.y))).toBe(3);
  });

  it('always leaves at least one gap, places exactly one Totem on the inner ring, and varies by seed', () => {
    const patterns = new Set<string>();
    const inner = new Set(phylacteryRingTiles(fp).map(key));
    for (let seed = 1; seed <= 300; seed++) {
      const plan = planStartingBase(new Rng(seed), fp, { x: 0, y: 2 }, () => true);
      expect(plan.walls.length).toBeLessThan(24);
      expect(plan.walls.every((w) => ring.some((r) => r.x === w.x && r.y === w.y))).toBe(true);
      expect(plan.totem).toBeDefined();
      expect(inner.has(key(plan.totem!))).toBe(true);
      expect(key(plan.totem!)).not.toBe('0,2');
      patterns.add(plan.walls.map(key).sort().join('|'));
    }
    expect(patterns.size).toBeGreaterThan(290);
  });

  it('removes one wall when every tile rolled a wall', () => {
    const always = { chance: () => true, int: () => 0, pick: <T>(a: readonly T[]) => a[0]! } as unknown as Rng;
    const plan = planStartingBase(always, fp, { x: 0, y: 2 }, () => true);
    expect(plan.walls).toHaveLength(23);
  });

  it('builds free walls and one free Totem in a real game', () => {
    for (const seed of [1, 2, 3, 77, 1234]) {
      const game = new Game(seed, new EventBus<GameEvents>());
      const buildings = [...game.buildingsById.values()];
      const totems = buildings.filter((b) => b.kind === 'totem');
      const walls = buildings.filter((b) => b.kind === 'wall');
      expect(totems).toHaveLength(1);
      expect(walls.length).toBeGreaterThan(0);
      expect(walls.length).toBeLessThan(24);
      expect(buildings.every((b) => b.free)).toBe(true);
    }
  });
});

describe('repair cost', () => {
  const at = (hp: number, maxHp: number): Repairable => ({ hp, maxHp, repairCredit: {} });

  it('is ceil(cost × missing / max) per resource', () => {
    expect(repairCostToFull(at(75, 150), { bone: 4 })).toEqual({ bone: 2 });
    expect(repairCostToFull(at(74, 150), { bone: 4 })).toEqual({ bone: 3 });
    expect(repairCostToFull(at(40, 80), { bone: 10, ichor: 5 })).toEqual({ bone: 5, ichor: 3 });
    expect(repairCostToFull(at(150, 150), { bone: 4 })).toEqual({});
  });

  it('charges exactly that when repairing step by step at 50 HP/s', () => {
    const wall = at(75, 150);
    const paid: string[] = [];
    let ticksTaken = 0;
    while (wall.hp < wall.maxHp && ticksTaken < 1000) {
      stepRepair(wall, { bone: 4 }, 50, DT, (id) => (paid.push(id), true));
      ticksTaken++;
    }
    expect(wall.hp).toBe(150);
    expect(paid).toEqual(['bone', 'bone']);
    expect(ticksTaken).toBeGreaterThanOrEqual(89);
    expect(ticksTaken).toBeLessThanOrEqual(91);
  });

  it('never overcharges across stops and restarts', () => {
    const wall = at(75, 150);
    let paid = 0;
    for (let i = 0; i < 200 && wall.hp < 150; i++) {
      stepRepair(wall, { bone: 4 }, 50, DT, () => (paid++, true));
      if (i % 7 === 0) stepRepair(wall, { bone: 4 }, 50, 0, () => (paid++, true));
    }
    expect(paid).toBe(2);
  });

  it('stops when the player cannot pay', () => {
    const wall = at(0.001, 150);
    let budget = 1;
    for (let i = 0; i < 600; i++) stepRepair(wall, { bone: 4 }, 50, DT, () => (budget > 0 ? (budget--, true) : false));
    expect(wall.hp).toBeCloseTo(150 / 4, 0);
  });

  it('costs the Phylactery 1 Bone per 10 HP', () => {
    expect(repairCostToFull(at(550, 600), PHYLACTERY.repairCost)).toEqual({ bone: 5 });
    expect(repairCostToFull(at(585, 600), PHYLACTERY.repairCost)).toEqual({ bone: 2 });
  });
});

describe('placing and removing', () => {
  it('pays the cost, blocks the tiles, and adds the no-spawn radius', () => {
    const { game } = openGame();
    const totem = game.placeBuilding('totem', 20, 20);
    expect(typeof totem).toBe('object');
    expect(game.resources.snapshot()).toMatchObject({ bone: 190, ichor: 45 });
    expect(game.buildings.has(20, 20)).toBe(true);
    expect(game.noSpawn.isBlocked(25, 25)).toBe(true);
    expect(game.noSpawn.isBlocked(26, 20)).toBe(false);
  });

  it('refuses bad spots: rock, marsh, occupied, no-build zone, units, and too poor', () => {
    const { game } = openGame();
    game.map.setTile(22, 22, TILE.rock);
    game.map.setTile(23, 22, TILE.marsh);
    expect(game.placeBuilding('wall', 22, 22)).toBe('Cannot build on rock');
    expect(game.placeBuilding('wall', 23, 22)).toBe('Cannot build on marsh');
    game.placeBuilding('wall', 24, 22);
    expect(game.placeBuilding('wall', 24, 22)).toBe('Something is already built here');
    expect(game.placeBuilding('altar', 23, 21)).toBe('Cannot build on marsh');
    expect(game.placeBuilding('wall', 0, 2)).toBe('Too close to the Phylactery');
    expect(game.placeBuilding('wall', 15, 15)).toBe('Something is standing there');
    // Adjacent to the player is fine (the player's circle only touches the edge).
    expect(typeof game.placeBuilding('wall', 16, 15)).toBe('object');
    const poor = new Game(9, new EventBus<GameEvents>(), { startingBase: false });
    for (let x = 4; x <= 12; x++) for (let y = 4; y <= 12; y++) poor.map.setTile(x, y, TILE.grass);
    expect(poor.placeBuilding('wall', 8, 8)).toBe('Not enough resources');
  });

  it('refunds 50% (rounded down) on removal, and nothing for free starting buildings', () => {
    const { game } = openGame();
    const door = game.placeBuilding('door', 20, 20);
    if (typeof door === 'string') throw new Error(door);
    const before = game.resources.get('bone');
    game.removeBuilding(door.id);
    expect(game.resources.get('bone')).toBe(before + 6);
    expect(game.buildings.has(20, 20)).toBe(false);
    expect(game.noSpawn.isBlocked(20, 20)).toBe(false);

    const started = new Game(1, new EventBus<GameEvents>());
    const wall = [...started.buildingsById.values()].find((b) => b.kind === 'wall')!;
    started.removeBuilding(wall.id);
    expect(started.resources.get('bone')).toBe(0);
  });
});

describe('building behavior', () => {
  it('lets the player walk through a Bone Door but not a wall', () => {
    const { game } = openGame();
    // A full wall line at x = 18 with one door at y = 15.
    for (let y = 10; y <= 20; y++) if (y !== 15) game.placeBuilding('wall', 18, y);
    game.placeBuilding('door', 18, 15);
    ticks(game, 2, cmd({ move: { ...still, right: true } }));
    expect(game.player.x).toBeGreaterThan(19.5);

    const { game: g2 } = openGame();
    for (let y = 10; y <= 20; y++) g2.placeBuilding('wall', 18, y);
    ticks(g2, 2, cmd({ move: { ...still, right: true } }));
    expect(g2.player.x).toBeCloseTo(17.5, 1);
  });

  it('blocks enemies at a door: they attack the enclosure instead of walking through', () => {
    const { game } = openGame();
    game.godMode = true;
    // Far from the Phylactery, so the walled-in player is still the closer target.
    game.player.x = game.player.prevX = 30.5;
    game.player.y = game.player.prevY = 30.5;
    ticks(game, 3 * DT);
    const box = boxAround(game, 30, 30, 3, { x: 33, y: 30 });
    const imp = game.spawnEnemy('imp', 36.5, 30.5, false);
    ticks(game, 3);
    expect(imp.target).toBe('player');
    // Still outside the box (more than 2.5 tiles from its center on some axis).
    expect(Math.max(Math.abs(imp.x - 30.5), Math.abs(imp.y - 30.5))).toBeGreaterThan(3);
    expect(box.some((b) => b.hp < b.maxHp)).toBe(true);
  });

  it('Totem fires at the nearest enemy within 6 tiles, 8 damage per second', () => {
    const { game, events } = openGame();
    game.placeBuilding('totem', 22, 15);
    const hits: number[] = [];
    events.on('enemy:damaged', (e) => hits.push(e.amount));
    game.godMode = true;
    const near = game.spawnEnemy('brute', 26.5, 15.5, false);
    game.spawnEnemy('brute', 29.5, 22.5, false);
    ticks(game, 2.05);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h === 8)).toBe(true);
    expect(near.hp).toBeLessThan(90);
  });

  it('Corpse Collector harvests the nearest corpse within 3 tiles, then waits 3–5 s', () => {
    const { game } = openGame();
    const collector = game.placeBuilding('collector', 25, 25);
    if (typeof collector === 'string') throw new Error(collector);
    collector.cooldown = 0;
    const kill = (x: number, y: number) => game.damageEnemy(game.spawnEnemy('imp', x, y, false), 1e6);
    kill(26.5, 27.5);
    kill(27.5, 27.5);
    kill(25.5, 29.6);
    const harvestedBefore = game.corpsesHarvested;
    game.tick(DT, cmd());
    expect(game.corpsesHarvested).toBe(harvestedBefore + 1);
    expect(collector.cooldown).toBeGreaterThanOrEqual(3 - DT);
    expect(collector.cooldown).toBeLessThanOrEqual(5);
    ticks(game, 5.1);
    expect(game.corpsesHarvested).toBe(harvestedBefore + 2);
    expect(game.corpses).toHaveLength(1); // the one 4.1 tiles away stays
  });

  it('Altar adds 4 mana/s within 5 tiles', () => {
    const { game } = openGame();
    game.placeBuilding('altar', 17, 15);
    game.player.mana = 0;
    ticks(game, 1);
    expect(game.player.mana).toBeCloseTo(8 + 4, 0);
    expect(game.nearAltar()).toBe(true);
  });

  it('drops 50% of its cost when destroyed by demons, and counts as lost', () => {
    const { game, events } = openGame();
    game.godMode = true;
    // The player is walled in, so the brute's only way is through a wall.
    game.player.x = game.player.prevX = 30.5;
    game.player.y = game.player.prevY = 30.5;
    ticks(game, 3 * DT);
    const box = boxAround(game, 30, 30, 3);
    for (const b of box) b.hp = 1;
    const drops: unknown[] = [];
    events.on('building:destroyed', (e) => drops.push(e.drop));
    game.spawnEnemy('brute', 36.5, 30.5, false);
    ticks(game, 6);
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0]).toEqual({ bone: 2 });
    expect(game.buildingsLost).toBe(drops.length);
  });

  it('repairs with R at 50 HP/s, paying as it goes', () => {
    const { game } = openGame();
    const wall = game.placeBuilding('wall', 16, 15);
    if (typeof wall === 'string') throw new Error(wall);
    wall.hp = 75;
    const bone = game.resources.get('bone');
    ticks(game, 1, cmd({ repair: true }));
    expect(wall.hp).toBeCloseTo(125, 0);
    ticks(game, 1, cmd({ repair: true }));
    expect(wall.hp).toBe(150);
    expect(game.resources.get('bone')).toBe(bone - 2);
  });

  it('repairs the Phylactery for 1 Bone per 10 HP', () => {
    const { game } = openGame();
    game.player.x = game.player.prevX = 0.5;
    game.player.y = game.player.prevY = 3.2;
    game.phylactery.hp = 550;
    const bone = game.resources.get('bone');
    ticks(game, 2, cmd({ repair: true }));
    expect(game.phylactery.hp).toBe(600);
    expect(game.resources.get('bone')).toBe(bone - 5);
  });

  it('defines all six buildings from the roster', () => {
    expect(Object.keys(BUILDINGS)).toEqual(['wall', 'door', 'totem', 'collector', 'altar', 'lantern']);
  });
});
