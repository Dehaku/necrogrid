import { describe, expect, it } from 'vitest';
import { FixedStepLoop, PauseState } from '../src/core/loop';

function makeLoop(): FixedStepLoop {
  return new FixedStepLoop({ tickRate: 60, maxFrameTime: 0.25 });
}

describe('FixedStepLoop', () => {
  it('runs one tick for one tick of real time', () => {
    expect(makeLoop().advance(1 / 60, () => {})).toBe(1);
  });

  it('carries leftover time into the next frame', () => {
    const loop = makeLoop();
    expect(loop.advance(1 / 120, () => {})).toBe(0);
    expect(loop.alpha).toBeCloseTo(0.5);
    expect(loop.advance(1 / 120, () => {})).toBe(1);
  });

  it('caps real elapsed time at 0.25 s, so a stalled tab does not catch up', () => {
    expect(makeLoop().advance(5, () => {})).toBe(15);
  });

  it('applies time scale after the cap and never changes dt', () => {
    const loop = makeLoop();
    loop.timeScale = 20;
    const dts: number[] = [];
    expect(loop.advance(5, (dt) => dts.push(dt))).toBe(300);
    expect(new Set(dts)).toEqual(new Set([1 / 60]));
  });

  it('ignores negative elapsed time', () => {
    expect(makeLoop().advance(-1, () => {})).toBe(0);
  });
});

describe('PauseState', () => {
  it('is paused while any reason is active', () => {
    const pause = new PauseState();
    expect(pause.isPaused).toBe(false);
    expect(pause.pause('auto')).toBe(true);
    expect(pause.pause('auto')).toBe(false);
    expect(pause.isPaused).toBe(true);
    expect(pause.resume('auto')).toBe(true);
    expect(pause.resume('auto')).toBe(false);
    expect(pause.isPaused).toBe(false);
  });
});
