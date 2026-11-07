// Fixed-timestep simulation loop and pause state.
// GAME_DESIGN.md sections 8.3 and 15.

/** Absorbs floating-point drift so 0.25 s at 60 Hz runs exactly 15 ticks. */
const EPSILON = 1e-9;

export interface LoopConfig {
  /** Simulation ticks per second. */
  readonly tickRate: number;
  /** Cap on real elapsed time per frame, in seconds, applied before time scale. */
  readonly maxFrameTime: number;
}

export class FixedStepLoop {
  /** Seconds per tick. Never changes, even under time scale. */
  readonly dt: number;
  /** Debug time scale: runs more fixed steps per frame (section 13). */
  timeScale = 1;
  private accumulator = 0;

  constructor(private readonly config: LoopConfig) {
    this.dt = 1 / config.tickRate;
  }

  /**
   * Adds real elapsed time and runs as many fixed ticks as it covers.
   * The real time is capped first, then multiplied by the time scale.
   * Returns the number of ticks run.
   */
  advance(realElapsed: number, tick: (dt: number) => void): number {
    const capped = Math.min(Math.max(realElapsed, 0), this.config.maxFrameTime);
    this.accumulator += capped * this.timeScale;
    let ticks = 0;
    while (this.accumulator + EPSILON >= this.dt) {
      tick(this.dt);
      this.accumulator = Math.max(0, this.accumulator - this.dt);
      ticks++;
    }
    return ticks;
  }

  /** How far into the next tick the accumulator is (0–1), for render interpolation. */
  get alpha(): number {
    return Math.min(this.accumulator / this.dt, 1);
  }
}

/** Why the simulation is paused. Menus add their own reasons in later milestones. */
export type PauseReason = 'auto';

/** The simulation is paused while any reason is active. */
export class PauseState {
  private readonly reasons = new Set<PauseReason>();

  get isPaused(): boolean {
    return this.reasons.size > 0;
  }

  has(reason: PauseReason): boolean {
    return this.reasons.has(reason);
  }

  /** Returns true if this reason was not already active. */
  pause(reason: PauseReason): boolean {
    if (this.reasons.has(reason)) return false;
    this.reasons.add(reason);
    return true;
  }

  /** Returns true if this reason was active. */
  resume(reason: PauseReason): boolean {
    return this.reasons.delete(reason);
  }
}
