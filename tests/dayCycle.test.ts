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
  it('is 135 s long', () => {
    expect(CYCLE_LENGTH).toBe(135);
  });

  it('starts at the beginning of day 1', () => {
    const s = cycleStateAt(0);
    expect(s).toMatchObject({ day: 1, phase: 'day', timeInPhase: 0 });
  });

  it('runs day 75 s, dusk 10 s, night 40 s, dawn 10 s, then day 2', () => {
    const { log } = recordPhases(136);
    expect(log.map((e) => [e.phase, e.day])).toEqual([
      ['dusk', 1],
      ['night', 1],
      ['dawn', 1],
      ['day', 2],
    ]);
    const at = log.map((e) => e.at);
    expect(at[0]).toBeCloseTo(75, 1);
    expect(at[1]).toBeCloseTo(85, 1);
    expect(at[2]).toBeCloseTo(125, 1);
    expect(at[3]).toBeCloseTo(135, 1);
  });

  it('starts day 7 at 810 s and reaches the end of its day phase at 885 s', () => {
    expect(cycleStateAt(809.9)).toMatchObject({ day: 6, phase: 'dawn' });
    expect(cycleStateAt(810)).toMatchObject({ day: 7, phase: 'day' });
    expect(cycleStateAt(885)).toMatchObject({ day: 7, phase: 'dusk' });
  });
});

describe('night blend', () => {
  it('is 0 by day, 1 at night, and blends linearly at dusk and dawn', () => {
    expect(nightBlend(cycleStateAt(10))).toBe(0);
    expect(nightBlend(cycleStateAt(80))).toBeCloseTo(0.5);
    expect(nightBlend(cycleStateAt(100))).toBe(1);
    expect(nightBlend(cycleStateAt(127.5))).toBeCloseTo(0.75);
    expect(nightBlend(cycleStateAt(135))).toBe(0);
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
    expect(cycle.elapsed).toBe(75);
    cycle.skipPhase();
    expect(cycle.elapsed).toBe(85);
    expect(seen).toEqual(['dusk', 'night']);
  });

  it('jumps to the start of day 7', () => {
    const events = new EventBus<GameEvents>();
    const cycle = new DayCycle(events);
    const days: number[] = [];
    events.on('phase:day', ({ day }) => days.push(day));
    cycle.jumpToDay(7);
    expect(cycle.elapsed).toBe(810);
    expect(cycle.state).toMatchObject({ day: 7, phase: 'day' });
    expect(days).toEqual([7]);
  });
});

describe('day ring', () => {
  it('splits into 75 / 10 / 40 / 10 parts of 135 from 12 o\'clock, clockwise', () => {
    const slices = ringSlices();
    const shares = slices.map((s) => (s.end - s.start) / (Math.PI * 2));
    expect(shares.map((x) => +x.toFixed(4))).toEqual([0.5556, 0.0741, 0.2963, 0.0741]);
    expect(slices[0]!.start).toBeCloseTo(-Math.PI / 2);
    expect(slices[3]!.end).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('points the hand at the current moment of the cycle', () => {
    expect(ringHandAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(ringHandAngle(0.25)).toBeCloseTo(0);
  });

  it('shows "Day N / 7", or only "Day N" in endless mode', () => {
    expect(ringDayText(3, false)).toEqual(['Day 3', '/ 7']);
    expect(ringDayText(17, true)).toEqual(['Day 17']);
  });
});
