import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { CYCLE_LENGTH, cycleStateAt, DayCycle, nightBlend } from '../src/time/dayCycle';
import { ringDayText, ringHandAngle, ringSlices } from '../src/ui/hud';

const DT = 1 / 60;

function recordPhases(seconds: number) {
  const events = new EventBus<GameEvents>();
  const cycle = new DayCycle(events);
  const log: { phase: string; day: number; at: number }[] = [];
  for (const phase of ['day', 'dusk', 'night', 'dawn'] as const) {
    events.on(`phase:${phase}`, ({ day }) => log.push({ phase, day, at: cycle.elapsed }));
  }
  for (let i = 0; i < Math.round(seconds / DT); i++) cycle.advance(DT);
  return { cycle, log };
}

describe('day cycle timing', () => {
  it('is 250 s long', () => {
    expect(CYCLE_LENGTH).toBe(250);
  });

  it('starts at the beginning of day 1', () => {
    const s = cycleStateAt(0);
    expect(s).toMatchObject({ day: 1, phase: 'day', timeInPhase: 0 });
  });

  it('runs day 150 s, dusk 10 s, night 80 s, dawn 10 s, then day 2', () => {
    const { log } = recordPhases(251);
    expect(log.map((e) => [e.phase, e.day])).toEqual([
      ['dusk', 1],
      ['night', 1],
      ['dawn', 1],
      ['day', 2],
    ]);
    const at = log.map((e) => e.at);
    expect(at[0]).toBeCloseTo(150, 1);
    expect(at[1]).toBeCloseTo(160, 1);
    expect(at[2]).toBeCloseTo(240, 1);
    expect(at[3]).toBeCloseTo(250, 1);
  });

  it('starts day 15 at 3,500 s and reaches the end of its day phase at 3,650 s', () => {
    expect(cycleStateAt(3499.9)).toMatchObject({ day: 14, phase: 'dawn' });
    expect(cycleStateAt(3500)).toMatchObject({ day: 15, phase: 'day' });
    expect(cycleStateAt(3650)).toMatchObject({ day: 15, phase: 'dusk' });
  });
});

describe('night blend', () => {
  it('is 0 by day, 1 at night, and blends linearly at dusk and dawn', () => {
    expect(nightBlend(cycleStateAt(10))).toBe(0);
    expect(nightBlend(cycleStateAt(155))).toBeCloseTo(0.5);
    expect(nightBlend(cycleStateAt(200))).toBe(1);
    expect(nightBlend(cycleStateAt(242.5))).toBeCloseTo(0.75);
    expect(nightBlend(cycleStateAt(250))).toBe(0);
  });
});

describe('debug time controls', () => {
  it('skips to the start of the next phase and emits its event', () => {
    const events = new EventBus<GameEvents>();
    const cycle = new DayCycle(events);
    const seen: string[] = [];
    events.on('phase:dusk', () => seen.push('dusk'));
    events.on('phase:night', () => seen.push('night'));
    cycle.advance(40);
    cycle.skipPhase();
    expect(cycle.elapsed).toBe(150);
    cycle.skipPhase();
    expect(cycle.elapsed).toBe(160);
    expect(seen).toEqual(['dusk', 'night']);
  });

  it('jumps to the start of day 15', () => {
    const events = new EventBus<GameEvents>();
    const cycle = new DayCycle(events);
    const days: number[] = [];
    events.on('phase:day', ({ day }) => days.push(day));
    cycle.jumpToDay(15);
    expect(cycle.elapsed).toBe(3500);
    expect(cycle.state).toMatchObject({ day: 15, phase: 'day' });
    expect(days).toEqual([15]);
  });
});

describe('day ring', () => {
  it('splits into 60 / 4 / 32 / 4 percent slices from 12 o\'clock, clockwise', () => {
    const slices = ringSlices();
    const shares = slices.map((s) => (s.end - s.start) / (Math.PI * 2));
    expect(shares.map((x) => +x.toFixed(4))).toEqual([0.6, 0.04, 0.32, 0.04]);
    expect(slices[0]!.start).toBeCloseTo(-Math.PI / 2);
    expect(slices[3]!.end).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('points the hand at the current moment of the cycle', () => {
    expect(ringHandAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(ringHandAngle(0.25)).toBeCloseTo(0);
  });

  it('shows "Day N / 15", or only "Day N" in endless mode', () => {
    expect(ringDayText(7, false)).toEqual(['Day 7', '/ 15']);
    expect(ringDayText(17, true)).toEqual(['Day 17']);
  });
});
