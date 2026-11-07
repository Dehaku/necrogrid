import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { STARFALL } from '../src/data/fx';
import { TILE } from '../src/data/terrain';
import { Game } from '../src/game';
import { phylacteryPulse } from '../src/render/sprites';
import { Starfall } from '../src/render/starfall';
import { COMPLETION_TIME, FINAL_DAY_START } from '../src/time/dayCycle';
import { dropRateLines, galleryLayout } from '../src/ui/killGallery';
import { arrivalBanners, Warnings } from '../src/ui/warnings';

describe('kill gallery', () => {
  it('counts kills by enemy type', () => {
    const game = new Game(2, new EventBus<GameEvents>(), { startingBase: false });
    game.director.paused = true;
    for (let x = 10; x <= 20; x++) for (let y = 10; y <= 20; y++) game.map.setTile(x, y, TILE.grass);
    game.damageEnemy(game.spawnEnemy('imp', 12.5, 12.5, false), 1e6);
    game.damageEnemy(game.spawnEnemy('imp', 13.5, 12.5, false), 1e6);
    game.damageEnemy(game.spawnEnemy('brute', 15.5, 15.5, true), 1e6);
    expect(game.killsByType).toEqual({ imp: 2, shambler: 0, brute: 1, wraith: 0, hellhound: 0 });
  });

  it('shows only slain types, in roster order, centered', () => {
    const entries = galleryLayout({ imp: 3, shambler: 0, brute: 1, wraith: 2, hellhound: 0 });
    expect(entries.map((e) => [e.type, e.count])).toEqual([['imp', 3], ['brute', 1], ['wraith', 2]]);
    const left = entries[0]!.rect.x;
    const right = entries.at(-1)!.rect.x + entries.at(-1)!.rect.w;
    expect(left + right).toBeCloseTo(1280);
    expect(galleryLayout({ imp: 0, shambler: 0, brute: 0, wraith: 0, hellhound: 0 })).toEqual([]);
  });

  it('lists drop rates from the loot table', () => {
    expect(dropRateLines('imp')).toEqual(['Bone: 1–2', 'Soul Shard: 1 (15% chance)', 'Elite: ×4 amounts, +1 Soul Shard']);
    expect(dropRateLines('brute')).toContain('Ichor: 1');
  });
});

describe('new enemy banners', () => {
  it('announce Brutes on day 3 and Hellhounds on day 5 only', () => {
    expect(arrivalBanners(1)).toEqual([]);
    expect(arrivalBanners(2)).toEqual([]);
    expect(arrivalBanners(3)).toEqual(['Day 3. Brutes have entered the battlefield']);
    expect(arrivalBanners(5)).toEqual(['Day 5. Hellhounds have awoken']);
    expect(arrivalBanners(6)).toEqual([]);
  });

  it('show when the day starts', () => {
    const events = new EventBus<GameEvents>();
    const w = new Warnings();
    w.attach(events);
    events.emit('phase:day', { day: 3 });
    expect(w.banners.map((b) => b.text)).toEqual(['Day 3. Brutes have entered the battlefield']);
  });
});

describe('endless starfall', () => {
  const step = (s: Starfall, seconds: number, active: boolean, night: number, track?: (n: number) => void) => {
    for (let i = 0; i < seconds * 60; i++) {
      s.advance(1 / 60, active, night, { x: 0, y: 0 });
      track?.(s.stars.length);
    }
  };

  it('only falls at night in endless mode, a few at a time', () => {
    const s = new Starfall();
    step(s, 20, false, 1);
    expect(s.stars).toHaveLength(0);
    step(s, 20, true, 0);
    expect(s.stars).toHaveLength(0);
    let most = 0;
    step(s, 30, true, 1, (n) => (most = Math.max(most, n)));
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(STARFALL.maxStars);
  });

  it('lives in the world: a star keeps its world position when the view moves', () => {
    const s = new Starfall();
    step(s, 3, true, 1);
    const star = s.stars[0]!;
    const before = { x: star.x, y: star.y };
    s.advance(1 / 60, true, 1, { x: 500, y: 500 });
    expect(star.x).toBeCloseTo(before.x + star.vx / 60);
    expect(star.y).toBeCloseTo(before.y + star.vy / 60);
  });

  it('falls down and to the left', () => {
    const s = new Starfall();
    step(s, 3, true, 1);
    for (const star of s.stars) {
      expect(star.vx).toBeLessThan(0);
      expect(star.vy).toBeGreaterThan(0);
    }
  });
});

describe('Phylactery pulse', () => {
  const peaks = (from: number, to: number, completed = false) => {
    let n = 0;
    let prev = phylacteryPulse(from, FINAL_DAY_START, COMPLETION_TIME, completed);
    let rising = false;
    for (let t = from + 0.01; t <= to; t += 0.01) {
      const v = phylacteryPulse(t, FINAL_DAY_START, COMPLETION_TIME, completed);
      if (rising && v < prev) n++;
      rising = v > prev;
      prev = v;
    }
    return n;
  };

  it('completes at the end of day 7’s day phase', () => {
    expect(COMPLETION_TIME).toBe(885);
  });

  it('is still before the final day', () => {
    for (let t = 0; t <= FINAL_DAY_START; t += 3.7) expect(phylacteryPulse(t, FINAL_DAY_START, COMPLETION_TIME, false)).toBe(0);
    expect(FINAL_DAY_START).toBe(810);
  });

  it('stays between 0 and 1 and quickens through the final day', () => {
    for (let t = FINAL_DAY_START; t < 900; t += 0.73) {
      const v = phylacteryPulse(t, FINAL_DAY_START, COMPLETION_TIME, false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const early = peaks(FINAL_DAY_START, FINAL_DAY_START + 15);
    const late = peaks(COMPLETION_TIME - 15, COMPLETION_TIME);
    expect(early).toBeLessThanOrEqual(8);
    expect(late).toBeGreaterThan(early * 2.5);
  });

  it('settles to a calm pulse once bound', () => {
    expect(peaks(1000, 1060, true)).toBeLessThanOrEqual(22);
    expect(peaks(1000, 1060, true)).toBeGreaterThanOrEqual(19);
  });
});
