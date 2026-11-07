// Debug panel: testing tools, enabled only with ?debug in the URL. Toggled with backtick.
// GAME_DESIGN.md section 13. M2 tools: time scale, skip phase, jump to day, seed, stats.

import { CONTROLS } from '../data/controls';
import { DAY_CYCLE } from '../data/time';
import { TIME_SCALES } from '../data/tuning';
import { keysForAction } from '../core/input';
import type { FixedStepLoop } from '../core/loop';
import type { DayCycle } from '../time/dayCycle';

export interface DebugHooks {
  loop: FixedStepLoop;
  cycle: DayCycle;
  seed: number;
  /** Restart the run with a given seed. */
  restartWithSeed(seed: number): void;
  /** Counts by entity type, for the stats readout. */
  entityCounts(): Record<string, number>;
}

/** Refresh the text readouts this often, in milliseconds. */
const READOUT_INTERVAL = 250;

const STYLE = `
.ng-debug { position: fixed; top: 8px; left: 8px; z-index: 10; width: 230px; padding: 8px 10px;
  background: rgba(10, 8, 14, 0.88); color: #ddd6c8; border: 1px solid #3a3346; border-radius: 6px;
  font: 12px/1.45 ui-monospace, Consolas, monospace; user-select: none; }
.ng-debug[hidden] { display: none; }
.ng-debug h2 { margin: 0 0 6px; font-size: 12px; color: #b9a3ea; letter-spacing: 0.05em; }
.ng-debug .row { display: flex; gap: 4px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.ng-debug .label { color: #8f8799; width: 100%; margin-top: 6px; }
.ng-debug button { font: inherit; padding: 1px 6px; background: #241f2c; color: #ddd6c8;
  border: 1px solid #4a4158; border-radius: 3px; cursor: pointer; }
.ng-debug button:hover { background: #312a3c; }
.ng-debug button.active { background: #5b4785; border-color: #8a72c2; color: #fff; }
.ng-debug input { font: inherit; width: 90px; padding: 1px 4px; background: #15121a; color: #ddd6c8;
  border: 1px solid #4a4158; border-radius: 3px; }
.ng-debug pre { margin: 6px 0 0; font: inherit; white-space: pre; color: #c9c1b4; }
`;

export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly readout: HTMLPreElement;
  private readonly scaleButtons = new Map<number, HTMLButtonElement>();

  private frames = 0;
  private tickCount = 0;
  private tickTimeTotal = 0;
  private windowStart = performance.now();
  private lastReadout = 0;
  private fps = 0;
  private msPerTick = 0;

  constructor(private readonly hooks: DebugHooks) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);

    this.root = document.createElement('div');
    this.root.className = 'ng-debug';
    this.root.innerHTML = `
      <h2>DEBUG  <span style="color:#6f6779">(\` to hide)</span></h2>
      <div class="label">Time scale</div>
      <div class="row" data-scales></div>
      <div class="label">Time</div>
      <div class="row">
        <button data-skip>Skip phase</button>
      </div>
      <div class="row">
        <input data-day type="number" min="1" value="${DAY_CYCLE.winDay}" />
        <button data-jump>Jump to day</button>
      </div>
      <div class="label">Seed</div>
      <div class="row">
        <input data-seed type="text" inputmode="numeric" value="${hooks.seed}" />
        <button data-restart>Restart</button>
      </div>
      <pre data-readout></pre>`;
    document.body.append(this.root);
    this.readout = this.query<HTMLPreElement>('[data-readout]');

    const scales = this.query<HTMLDivElement>('[data-scales]');
    for (const scale of TIME_SCALES) {
      const button = document.createElement('button');
      button.textContent = `${scale}×`;
      button.addEventListener('click', () => this.setTimeScale(scale));
      scales.append(button);
      this.scaleButtons.set(scale, button);
    }
    this.setTimeScale(hooks.loop.timeScale);

    this.query('[data-skip]').addEventListener('click', () => hooks.cycle.skipPhase());
    const dayInput = this.query<HTMLInputElement>('[data-day]');
    this.query('[data-jump]').addEventListener('click', () => {
      const day = Number(dayInput.value);
      if (Number.isFinite(day) && day >= 1) hooks.cycle.jumpToDay(day);
    });
    const seedInput = this.query<HTMLInputElement>('[data-seed]');
    this.query('[data-restart]').addEventListener('click', () => {
      if (/^\d+$/.test(seedInput.value.trim())) hooks.restartWithSeed(Number(seedInput.value.trim()) >>> 0);
    });

    // Buttons keep focus after a click; drop it so game keys never land on them.
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });

    const toggleKeys = new Set(keysForAction(CONTROLS, 'debug'));
    window.addEventListener('keydown', (e) => {
      if (toggleKeys.has(e.code) && !e.repeat) this.root.hidden = !this.root.hidden;
    });
  }

  /** Call once per rendered frame. */
  recordFrame(now: number): void {
    this.frames++;
    const windowLength = now - this.windowStart;
    if (windowLength >= 1000) {
      this.fps = (this.frames * 1000) / windowLength;
      this.msPerTick = this.tickCount > 0 ? this.tickTimeTotal / this.tickCount : 0;
      this.frames = 0;
      this.tickCount = 0;
      this.tickTimeTotal = 0;
      this.windowStart = now;
    }
    if (now - this.lastReadout >= READOUT_INTERVAL && !this.root.hidden) {
      this.lastReadout = now;
      this.updateReadout();
    }
  }

  /** Call once per simulation tick with how long it took, in milliseconds. */
  recordTick(ms: number): void {
    this.tickCount++;
    this.tickTimeTotal += ms;
  }

  private setTimeScale(scale: number): void {
    this.hooks.loop.timeScale = scale;
    for (const [value, button] of this.scaleButtons) button.classList.toggle('active', value === scale);
  }

  private updateReadout(): void {
    const s = this.hooks.cycle.state;
    const label = DAY_CYCLE.phases[s.phaseIndex]!.label;
    const lines = [
      `Day ${s.day}  ${label} ${s.timeInPhase.toFixed(1)} / ${s.phaseLength} s`,
      `Run time  ${this.hooks.cycle.elapsed.toFixed(1)} s`,
      `FPS ${this.fps.toFixed(0)}   tick ${this.msPerTick.toFixed(3)} ms`,
      `Seed ${this.hooks.seed}`,
      ...Object.entries(this.hooks.entityCounts()).map(([name, count]) => `${name.padEnd(10)}${count}`),
    ];
    this.readout.textContent = lines.join('\n');
  }

  private query<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Debug panel is missing ${selector}`);
    return element;
  }
}
