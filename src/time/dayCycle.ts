// The day/night cycle: phase, day counter, night blend, and phase events.
// GAME_DESIGN.md section 5.

import { DAY_CYCLE, type PhaseId } from '../data/time';
import type { EventBus, GameEvents } from '../core/events';

/** Seconds in one full cycle (250 s with the starting values). */
export const CYCLE_LENGTH = DAY_CYCLE.phases.reduce((sum, p) => sum + p.length, 0);

/** Seconds from the start of a cycle to the start of each phase. */
const PHASE_STARTS: readonly number[] = DAY_CYCLE.phases.map((_, i) =>
  DAY_CYCLE.phases.slice(0, i).reduce((sum, p) => sum + p.length, 0),
);

export interface CycleState {
  /** Day counter, starting at 1. Increments at the start of each day phase. */
  day: number;
  phase: PhaseId;
  /** Index into DAY_CYCLE.phases. */
  phaseIndex: number;
  /** Seconds since the current phase started. */
  timeInPhase: number;
  phaseLength: number;
  /** 0 at the start of day, approaching 1 at the end of dawn. */
  cycleFraction: number;
}

/** Cycle state at a given number of seconds since the run started. */
export function cycleStateAt(elapsed: number): CycleState {
  const cycleIndex = Math.floor(elapsed / CYCLE_LENGTH);
  const inCycle = elapsed - cycleIndex * CYCLE_LENGTH;
  let phaseIndex = DAY_CYCLE.phases.length - 1;
  for (let i = 0; i < PHASE_STARTS.length; i++) {
    const next = PHASE_STARTS[i + 1] ?? CYCLE_LENGTH;
    if (inCycle < next) {
      phaseIndex = i;
      break;
    }
  }
  const phase = DAY_CYCLE.phases[phaseIndex]!;
  return {
    day: cycleIndex + 1,
    phase: phase.id,
    phaseIndex,
    timeInPhase: inCycle - PHASE_STARTS[phaseIndex]!,
    phaseLength: phase.length,
    cycleFraction: inCycle / CYCLE_LENGTH,
  };
}

/** 0 during day, rising to 1 across dusk, 1 at night, falling back to 0 across dawn. */
export function nightBlend(state: CycleState): number {
  const t = state.timeInPhase / state.phaseLength;
  switch (state.phase) {
    case 'day':
      return 0;
    case 'dusk':
      return t;
    case 'night':
      return 1;
    case 'dawn':
      return 1 - t;
  }
}

export class DayCycle {
  /** Simulation seconds since the run started. */
  private elapsedSeconds = 0;
  private current: CycleState = cycleStateAt(0);

  constructor(private readonly events?: EventBus<GameEvents>) {}

  get elapsed(): number {
    return this.elapsedSeconds;
  }

  get state(): CycleState {
    return this.current;
  }

  get nightBlend(): number {
    return nightBlend(this.current);
  }

  /** One simulation tick. Emits a phase event when a phase starts. */
  advance(dt: number): void {
    this.setElapsed(this.elapsedSeconds + dt);
  }

  /** Debug: jump to the start of the next phase. */
  skipPhase(): void {
    const s = this.current;
    this.setElapsed(this.elapsedSeconds - s.timeInPhase + s.phaseLength);
  }

  /** Debug: jump to the start of day N. */
  jumpToDay(day: number): void {
    this.setElapsed((Math.max(1, Math.floor(day)) - 1) * CYCLE_LENGTH);
  }

  private setElapsed(elapsed: number): void {
    const before = this.current;
    this.elapsedSeconds = elapsed;
    this.current = cycleStateAt(elapsed);
    const after = this.current;
    if (after.day !== before.day || after.phaseIndex !== before.phaseIndex) {
      this.events?.emit(`phase:${after.phase}`, { day: after.day });
    }
  }
}
