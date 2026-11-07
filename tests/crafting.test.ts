import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { baseStats, computeStats } from '../src/core/stats';
import { modifierText, effectsText } from '../src/crafting/crafting';
import { GEAR, type Modifier } from '../src/data/recipes';
import { TILE } from '../src/data/terrain';
import { Game, type PlayerCommand } from '../src/game';
import { EquipmentScreen } from '../src/ui/equipmentScreen';
import { CraftMenu } from '../src/ui/craftMenu';

const DT = 1 / 60;
const still = { up: false, down: false, left: false, right: false };
const cmd = (over: Partial<PlayerCommand> = {}): PlayerCommand => ({ move: still, aim: { x: 0, y: 0 }, bolt: false, chain: false, ...over });

/** A rich game with an Altar next to the player, on open ground away from the Phylactery. */
function richGame(withAltar = true): { game: Game; events: EventBus<GameEvents> } {
  const events = new EventBus<GameEvents>();
  const game = new Game(6, events, { startingBase: false });
  game.director.paused = true;
  for (let x = 4; x <= 40; x++) for (let y = 4; y <= 40; y++) game.map.setTile(x, y, TILE.grass);
  game.player.x = game.player.prevX = 20.5;
  game.player.y = game.player.prevY = 20.5;
  for (let i = 0; i < 3; i++) game.tick(DT, cmd());
  game.gain({ bone: 200, flesh: 200, soulShard: 50, ichor: 50 });
  // Altar's footprint (21..22, 20..21): the player at x = 20.5 touches its west edge.
  if (withAltar) game.placeBuilding('altar', 21, 20);
  return { game, events };
}

describe('stat modifiers', () => {
  it('apply every add first, then every mul', () => {
    const mods: Modifier[] = [
      { stat: 'boltDamage', op: 'mul', value: 1.2 },
      { stat: 'boltDamage', op: 'add', value: 4 },
      { stat: 'boltDamage', op: 'add', value: 14 },
    ];
    expect(computeStats(baseStats(), mods).boltDamage).toBeCloseTo((12 + 4 + 14) * 1.2);
  });

  it('stack across slots', () => {
    const lich = GEAR.find((g) => g.id === 'lichStaff')!.modifiers;
    const heart = GEAR.find((g) => g.id === 'heartOfAsh')!.modifiers;
    const s = computeStats(baseStats(), [...lich, ...heart]);
    expect(s.boltDamage).toBeCloseTo((12 + 14) * 1.2);
    expect(s.boltManaCost).toBe(3);
    expect(s.chainDamage).toBeCloseTo(22.5);
    expect(s.manaRegen).toBe(14);
  });

  it('read as effect text', () => {
    expect(modifierText({ stat: 'boltDamage', op: 'add', value: 4 })).toBe('Bolt damage +4');
    expect(modifierText({ stat: 'boltCooldown', op: 'add', value: -0.05 })).toBe('Bolt cooldown −0.05 s');
    expect(modifierText({ stat: 'chainDamage', op: 'mul', value: 1.25 })).toBe('Chain damage ×1.25');
    expect(effectsText('graveVestments')).toBe('Max HP +40, Max Mana +30, Mana regen +2');
  });
});

describe('crafting', () => {
  it('crafts all ten items once each, then swaps freely between them', () => {
    const { game } = richGame();
    expect(game.atAltar()).toBe(true);
    // The full set needs 57 Soul Shards, more than the 50 cap, so top up between crafts (as play would).
    for (const g of GEAR) {
      game.gain({ bone: 50, flesh: 50, soulShard: 50, ichor: 50 });
      expect(game.craft(g.id)).toBeUndefined();
    }
    expect(game.gear.unlocked.size).toBe(10);
    for (const g of GEAR) expect(game.craft(g.id)).toBe('Already unlocked');
    for (const g of GEAR) {
      expect(game.equip(g.id)).toBe(true);
      expect(game.gear.equipped[g.slot]).toBe(g.id);
    }
    // Swapping back costs nothing.
    const before = game.resources.snapshot();
    game.equip('boneStaff');
    game.equip('lichStaff');
    expect(game.resources.snapshot()).toEqual(before);
  });

  it('pays the recipe once', () => {
    const { game } = richGame();
    const before = game.resources.snapshot();
    game.craft('graveVestments');
    expect(game.resources.snapshot()).toEqual({ ...before, bone: before.bone - 6, flesh: before.flesh - 8, soulShard: before.soulShard - 4 });
  });

  it('needs an Altar for Altar recipes, but not for the basic ones', () => {
    const { game } = richGame(false);
    expect(game.atAltar()).toBe(false);
    expect(game.craft('gravewoodStaff')).toBe('Needs an Altar');
    expect(game.craft('boneStaff')).toBeUndefined();
    expect(game.craft('shroudOfRot')).toBeUndefined();
  });

  it('counts as at the Altar only when standing against it (within 0.5 tile)', () => {
    const { game } = richGame();
    // Altar edge at x = 21; the player's edge (radius 0.5) must be within 0.5 of it.
    game.player.x = 20.0;
    expect(game.atAltar()).toBe(true);
    game.player.x = 19.9;
    expect(game.atAltar()).toBe(false);
  });

  it('refuses when the player cannot pay', () => {
    const events = new EventBus<GameEvents>();
    const game = new Game(6, events, { startingBase: false });
    expect(game.craft('boneStaff')).toBe('Not enough resources');
    expect(game.gear.unlocked.size).toBe(0);
  });

  it('cannot equip what is not unlocked', () => {
    const { game } = richGame();
    expect(game.equip('lichStaff')).toBe(false);
    expect(game.gear.equipped.weapon).toBeUndefined();
  });

  it('equips a crafted item automatically when its slot is empty', () => {
    const { game } = richGame();
    game.craft('boneStaff');
    expect(game.gear.equipped.weapon).toBe('boneStaff');
    game.craft('gravewoodStaff');
    expect(game.gear.equipped.weapon).toBe('boneStaff');
  });
});

describe('gear in play', () => {
  it('Bone Staff adds 4 to Bolt damage', () => {
    const { game, events } = richGame(false);
    game.craft('boneStaff');
    expect(game.stats.boltDamage).toBe(16);
    const hits: number[] = [];
    events.on('enemy:damaged', (e) => hits.push(e.amount));
    const brute = game.spawnEnemy('brute', 26.5, 20.5, false);
    for (let i = 0; i < 40 && hits.length === 0; i++) game.tick(DT, cmd({ aim: { x: brute.x, y: brute.y }, bolt: true }));
    expect(hits[0]).toBe(16);
  });

  it('Lich Staff makes Bolt cost 3 mana and Chain hit for 22.5', () => {
    const { game, events } = richGame();
    game.craft('lichStaff');
    game.player.mana = 100;
    game.tick(DT, cmd({ aim: { x: 30, y: 20.5 }, bolt: true }));
    // Mana was full, so this tick's regen added nothing before the cast.
    expect(game.player.mana).toBe(97);
    const hits: number[] = [];
    events.on('enemy:damaged', (e) => hits.push(e.amount));
    game.spawnEnemy('brute', 25.5, 25.5, false);
    game.tick(DT, cmd({ aim: { x: 25.5, y: 25.5 }, chain: true }));
    expect(hits).toContain(22.5);
  });

  it('Chain Focus adds a fifth link', () => {
    const { game } = richGame();
    game.craft('chainFocus');
    const pack = [0, 1, 2, 3, 4].map((i) => game.spawnEnemy('brute', 25.5 + i * 1.5, 26.5, false));
    game.tick(DT, cmd({ aim: { x: 25.5, y: 26.5 }, chain: true }));
    expect(pack.filter((b) => b.hp < b.maxHp)).toHaveLength(5);
    expect(game.player.chainCooldown).toBeCloseTo(0.8, 1);
  });

  it('raising max HP keeps current HP; lowering it clamps', () => {
    const { game } = richGame();
    game.player.hp = 90;
    game.craft('shroudOfTheUndying');
    expect(game.player.maxHp).toBe(160);
    expect(game.player.hp).toBe(90);
    game.player.hp = 150;
    game.unequip('robe');
    expect(game.player.maxHp).toBe(100);
    expect(game.player.hp).toBe(100);
  });

  it('Ring of Marrow adds 3 mana/s', () => {
    const { game } = richGame(false);
    game.craft('ringOfMarrow');
    game.player.mana = 0;
    for (let i = 0; i < 60; i++) game.tick(DT, cmd());
    expect(game.player.mana).toBeCloseTo(11, 0);
  });
});

describe('menus', () => {
  it('craft menu crafts the focused recipe on Enter and closes on Esc', () => {
    const menu = new CraftMenu();
    menu.open();
    menu.handle({ kind: 'next' });
    expect(menu.handle({ kind: 'confirm' })).toEqual({ craft: 'gravewoodStaff' });
    expect(menu.handle({ kind: 'back' })).toBe('close');
  });

  it('equipment screen offers None plus unlocked items per slot', () => {
    const { game } = richGame();
    game.craft('boneStaff');
    game.craft('lichStaff');
    game.craft('ringOfMarrow');
    const screen = new EquipmentScreen();
    screen.open();
    const entries = screen.entries(game.gear);
    expect(entries.map((e) => `${e.slot}:${e.id ?? 'none'}`)).toEqual([
      'weapon:none', 'weapon:boneStaff', 'weapon:lichStaff', 'robe:none', 'charm:none', 'charm:ringOfMarrow',
    ]);
    screen.handle({ kind: 'next' }, game.gear);
    screen.handle({ kind: 'next' }, game.gear);
    expect(screen.handle({ kind: 'confirm' }, game.gear)).toEqual({ equip: 'lichStaff' });
    screen.handle({ kind: 'right' }, game.gear);
    expect(screen.handle({ kind: 'confirm' }, game.gear)).toEqual({ unequip: 'robe' });
  });
});
