import { describe, expect, it } from 'vitest';
import { CONTROLS } from '../src/data/controls';
import { swipeSlices } from '../src/render/effects';
import { EndScreen } from '../src/ui/endScreen';
import { healthBarColor } from '../src/ui/healthBars';
import { crescentArcs } from '../src/ui/hud';
import { controlsPanelRows, introLength, letterSink, TitleScreen } from '../src/ui/titleScreen';

const DEG = Math.PI / 180;

describe('crescents', () => {
  it('puts health on the west and mana on the east, each spanning 150°', () => {
    const health = crescentArcs('health', 1);
    expect(health.background.start).toBeCloseTo(105 * DEG);
    expect(health.background.end).toBeCloseTo(255 * DEG);
    const mana = crescentArcs('mana', 1);
    expect(mana.background.start).toBeCloseTo(75 * DEG);
    expect(mana.background.end).toBeCloseTo(-75 * DEG);
  });

  it('fills from the bottom end, so losing value drains downward', () => {
    const half = crescentArcs('health', 0.5);
    expect(half.fill.start).toBeCloseTo(105 * DEG);
    expect(half.fill.end).toBeCloseTo(180 * DEG);
    const manaHalf = crescentArcs('mana', 0.5);
    expect(manaHalf.fill.start).toBeCloseTo(75 * DEG);
    expect(manaHalf.fill.end).toBeCloseTo(0);
    expect(crescentArcs('health', 0).fill.end).toBeCloseTo(105 * DEG);
  });
});

describe('attack swipe', () => {
  const head = (t: number) => Math.max(...swipeSlices(t).map((s) => s.to));
  const brightest = (t: number) => swipeSlices(t).reduce((a, b) => (b.opacity > a.opacity ? b : a));

  it('sweeps its bright leading edge forward across the 100° span', () => {
    expect(head(0.1)).toBeLessThan(head(0.3));
    expect(head(0.3)).toBeLessThan(head(0.6));
    expect(head(0.65)).toBeCloseTo(50 * DEG);
  });

  it('keeps the brightest slice at the front and fades the trail behind it', () => {
    for (const t of [0.2, 0.4, 0.6]) {
      const slices = swipeSlices(t);
      expect(brightest(t).to).toBeCloseTo(head(t));
      for (let i = 1; i < slices.length; i++) expect(slices[i]!.opacity).toBeGreaterThan(slices[i - 1]!.opacity);
    }
  });

  it('fades out entirely after the edge reaches the far side', () => {
    expect(brightest(0.65).opacity).toBeCloseTo(0.9);
    expect(brightest(0.85).opacity).toBeLessThan(0.5);
    expect(brightest(1).opacity).toBeCloseTo(0);
  });
});

describe('health bar color', () => {
  it('steps green → yellow → red at thirds', () => {
    expect(healthBarColor(1)).toBe('#4caf50');
    expect(healthBarColor(0.67)).toBe('#4caf50');
    expect(healthBarColor(0.66)).toBe('#e8c547');
    expect(healthBarColor(0.34)).toBe('#e8c547');
    expect(healthBarColor(0.33)).toBe('#d23a3a');
  });
});

describe('title letters', () => {
  const n = 9;
  it('start buried and rise one after another', () => {
    expect(letterSink(0, n, 0, false)).toBe(1);
    expect(letterSink(0, n, 0.6, false)).toBeCloseTo(0);
    expect(letterSink(8, n, 0.6, false)).toBe(1);
    expect(letterSink(8, n, introLength(n), false)).toBeCloseTo(0);
  });

  it('then bob, never sinking more than 40%', () => {
    let deepest = 0;
    for (let t = introLength(n); t < introLength(n) + 10; t += 0.01) {
      for (let i = 0; i < n; i++) deepest = Math.max(deepest, letterSink(i, n, t, false));
    }
    expect(deepest).toBeGreaterThan(0.39);
    expect(deepest).toBeLessThanOrEqual(0.4);
  });

  it('skip the intro on the pause screen', () => {
    expect(letterSink(0, n, 0, true)).toBe(0);
    expect(letterSink(0, n, 1.5, true)).toBeCloseTo(0.4);
  });
});

describe('controls panel', () => {
  it('merges W A S D into one row and leaves out menu keys', () => {
    const rows = controlsPanelRows(CONTROLS);
    expect(rows[0]).toEqual({ keys: 'W A S D', action: 'Move' });
    expect(rows.some((r) => r.action.includes('menu'))).toBe(false);
    expect(rows.find((r) => r.keys === 'Esc')?.action).toBe('Pause');
  });
});

describe('TitleScreen', () => {
  it('has no Resume on the title screen, and New Game starts at once', () => {
    const screen = new TitleScreen();
    screen.open('title', 0);
    expect(screen.buttons()).toEqual(['newGame', 'settings']);
    expect(screen.handle({ kind: 'confirm' })).toBe('newGame');
  });

  it('puts Resume on top in pause mode, and Esc resumes', () => {
    const screen = new TitleScreen();
    screen.open('pause', 0);
    expect(screen.buttons()[0]).toBe('resume');
    expect(screen.handle({ kind: 'confirm' })).toBe('resume');
    expect(screen.handle({ kind: 'back' })).toBe('resume');
  });

  it('asks before abandoning a run, with Cancel focused and Esc meaning Cancel', () => {
    const screen = new TitleScreen();
    screen.open('pause', 0);
    screen.handle({ kind: 'next' });
    expect(screen.handle({ kind: 'confirm' })).toBeUndefined();
    expect(screen.view).toBe('confirm');
    expect(screen.confirmFocus).toBe(1);
    expect(screen.handle({ kind: 'confirm' })).toBeUndefined();
    expect(screen.view).toBe('menu');

    screen.handle({ kind: 'confirm' });
    expect(screen.handle({ kind: 'back' })).toBeUndefined();
    expect(screen.view).toBe('menu');

    screen.handle({ kind: 'confirm' });
    screen.handle({ kind: 'prev' });
    expect(screen.handle({ kind: 'confirm' })).toBe('abandon');
  });

  it('works with the mouse', () => {
    const screen = new TitleScreen();
    screen.open('title', 0);
    const [newGame] = screen.buttonRects();
    expect(screen.handle({ kind: 'click', at: { x: newGame!.x + 5, y: newGame!.y + 5 } })).toBe('newGame');
    expect(screen.handle({ kind: 'click', at: { x: 5, y: 5 } })).toBeUndefined();
  });

  it('opens a Settings placeholder and returns with Esc', () => {
    const screen = new TitleScreen();
    screen.open('title', 0);
    screen.handle({ kind: 'next' });
    screen.handle({ kind: 'confirm' });
    expect(screen.view).toBe('settings');
    screen.handle({ kind: 'back' });
    expect(screen.view).toBe('menu');
  });
});

describe('EndScreen', () => {
  it('returns to the title on Enter or a click on its button', () => {
    const end = new EndScreen();
    end.open({ cause: 'player', day: 3, kills: 40, corpsesHarvested: 0, score: 380 });
    expect(end.handle({ kind: 'prev' })).toBeUndefined();
    expect(end.handle({ kind: 'confirm' })).toBe('title');
    const b = end.buttonRect();
    expect(end.handle({ kind: 'click', at: { x: b.x + 1, y: b.y + 1 } })).toBe('title');
  });
});
