// Debug panel: testing tools, enabled only with ?debug in the URL. Toggled with backtick.
// GAME_DESIGN.md section 13. Tools so far: M2 (time, seed, stats) and M3 (spawning, overlays).

import { CONTROLS } from '../data/controls';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { RESOURCE_ORDER, RESOURCES, type ResourceId } from '../data/resources';
import { DAY_CYCLE } from '../data/time';
import { TIME_SCALES } from '../data/tuning';
import { keysForAction } from '../core/input';
import type { FixedStepLoop } from '../core/loop';
import type { DayCycle } from '../time/dayCycle';
import type { GoalId } from '../world/flowField';

/** Enemy types the "click to spawn" tool offers. Wraith joins once its attack exists (M9). */
const SPAWNABLE: readonly EnemyId[] = ['imp', 'shambler', 'brute', 'hellhound'];

/** Settings the panel changes and the game reads every frame. */
export interface DebugSettings {
  spawnPaused: boolean;
  /** While on, a left click in the world spawns `spawnType` there instead of doing anything else. */
  clickSpawn: boolean;
  spawnType: EnemyId;
  spawnElite: boolean;
  flowOverlay: 'off' | GoalId;
  spawnOverlay: boolean;
  /** The player and the Phylactery take no damage. */
  godMode: boolean;
}

export interface DebugHooks {
  loop: FixedStepLoop;
  /** The current run's cycle, or undefined when no run is active. */
  cycle(): DayCycle | undefined;
  /** The current run's seed, or undefined. */
  seed(): number | undefined;
  /** Start a new run with a given seed. */
  restartWithSeed(seed: number): void;
  /** Add resources to the current run. */
  grant(id: ResourceId, amount: number): void;
  /** Unlock every gear item. */
  unlockAllGear(): void;
  /** Counts by entity type, for the stats readout. */
  entityCounts(): Record<string, number>;
  /** Extra readout lines (HP, spawn budget, ...). */
  extraReadout(): string[];
}

/** Refresh the text readouts this often, in milliseconds. */
const READOUT_INTERVAL = 250;

const STYLE = `
.ng-debug { position: fixed; top: 8px; left: 8px; z-index: 10; width: 240px; max-height: calc(100vh - 16px);
  overflow-y: auto; padding: 8px 10px; background: rgba(10, 8, 14, 0.88); color: #ddd6c8;
  border: 1px solid #3a3346; border-radius: 6px; font: 12px/1.45 ui-monospace, Consolas, monospace; user-select: none; }
.ng-debug[hidden] { display: none; }
.ng-debug h2 { margin: 0 0 6px; font-size: 12px; color: #b9a3ea; letter-spacing: 0.05em; }
.ng-debug .row { display: flex; gap: 4px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.ng-debug .label { color: #8f8799; width: 100%; margin-top: 6px; }
.ng-debug button, .ng-debug select { font: inherit; padding: 1px 6px; background: #241f2c; color: #ddd6c8;
  border: 1px solid #4a4158; border-radius: 3px; cursor: pointer; }
.ng-debug button:hover { background: #312a3c; }
.ng-debug button.active { background: #5b4785; border-color: #8a72c2; color: #fff; }
.ng-debug input[type=text], .ng-debug input[type=number] { font: inherit; width: 90px; padding: 1px 4px;
  background: #15121a; color: #ddd6c8; border: 1px solid #4a4158; border-radius: 3px; }
.ng-debug label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
.ng-debug pre { margin: 6px 0 0; font: inherit; white-space: pre; color: #c9c1b4; }
`;

export class DebugPanel {
  readonly settings: DebugSettings = {
    spawnPaused: false,
    clickSpawn: false,
    spawnType: 'imp',
    spawnElite: false,
    flowOverlay: 'off',
    spawnOverlay: false,
    godMode: false,
  };

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

    const typeOptions = SPAWNABLE.map((t) => `<option value="${t}">${ENEMIES[t].name}</option>`).join('');
    this.root = document.createElement('div');
    this.root.className = 'ng-debug';
    this.root.innerHTML = `
      <h2>DEBUG  <span style="color:#6f6779">(\` to hide)</span></h2>
      <div class="label">Time scale</div>
      <div class="row" data-scales></div>
      <div class="label">Time</div>
      <div class="row"><button data-skip>Skip phase</button></div>
      <div class="row">
        <input data-day type="number" min="1" value="${DAY_CYCLE.winDay}" />
        <button data-jump>Jump to day</button>
      </div>
      <div class="label">Seed</div>
      <div class="row">
        <input data-seed type="text" inputmode="numeric" value="${hooks.seed() ?? ''}" />
        <button data-restart>Restart</button>
      </div>
      <div class="label">Combat</div>
      <div class="row"><label><input data-god type="checkbox" /> God mode</label></div>
      <div class="label">Resources</div>
      <div class="row">
        <select data-grant-type>${RESOURCE_ORDER.map((id) => `<option value="${id}">${RESOURCES[id].name}</option>`).join('')}</select>
        <button data-grant>+50</button>
        <button data-grant-all>+50 all</button>
      </div>
      <div class="label">Gear</div>
      <div class="row"><button data-unlock-gear>Unlock all gear</button></div>
      <div class="label">Spawning</div>
      <div class="row"><label><input data-spawn-paused type="checkbox" /> Pause spawning</label></div>
      <div class="row">
        <label><input data-click-spawn type="checkbox" /> Click spawns</label>
        <select data-spawn-type>${typeOptions}</select>
        <label><input data-spawn-elite type="checkbox" /> Elite</label>
      </div>
      <div class="label">Overlays</div>
      <div class="row">
        Flow field
        <select data-flow>
          <option value="off">off</option>
          <option value="player">player</option>
          <option value="phylactery">phylactery</option>
        </select>
      </div>
      <div class="row"><label><input data-spawn-overlay type="checkbox" /> Spawn map</label></div>
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

    this.query('[data-skip]').addEventListener('click', () => hooks.cycle()?.skipPhase());
    const dayInput = this.query<HTMLInputElement>('[data-day]');
    this.query('[data-jump]').addEventListener('click', () => {
      const day = Number(dayInput.value);
      if (Number.isFinite(day) && day >= 1) hooks.cycle()?.jumpToDay(day);
    });
    this.bindCheckbox('[data-god]', (on) => (this.settings.godMode = on));
    const grantType = this.query<HTMLSelectElement>('[data-grant-type]');
    this.query('[data-grant]').addEventListener('click', () => hooks.grant(grantType.value as ResourceId, 50));
    this.query('[data-unlock-gear]').addEventListener('click', () => hooks.unlockAllGear());
    this.query('[data-grant-all]').addEventListener('click', () => {
      for (const id of RESOURCE_ORDER) hooks.grant(id, 50);
    });
    const seedInput = this.query<HTMLInputElement>('[data-seed]');
    this.query('[data-restart]').addEventListener('click', () => {
      if (/^\d+$/.test(seedInput.value.trim())) hooks.restartWithSeed(Number(seedInput.value.trim()) >>> 0);
    });

    this.bindCheckbox('[data-spawn-paused]', (on) => (this.settings.spawnPaused = on));
    this.bindCheckbox('[data-click-spawn]', (on) => (this.settings.clickSpawn = on));
    this.bindCheckbox('[data-spawn-elite]', (on) => (this.settings.spawnElite = on));
    this.bindCheckbox('[data-spawn-overlay]', (on) => (this.settings.spawnOverlay = on));
    const typeSelect = this.query<HTMLSelectElement>('[data-spawn-type]');
    typeSelect.addEventListener('change', () => (this.settings.spawnType = typeSelect.value as EnemyId));
    const flowSelect = this.query<HTMLSelectElement>('[data-flow]');
    flowSelect.addEventListener('change', () => (this.settings.flowOverlay = flowSelect.value as DebugSettings['flowOverlay']));

    // Controls keep focus after a click; drop it so game keys never land on them.
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === 'checkbox')) {
        e.target.blur();
      }
    });
    this.root.addEventListener('change', (e) => {
      if (e.target instanceof HTMLSelectElement) e.target.blur();
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

  /** Shows a new run's seed in the seed box. */
  setSeed(seed: number): void {
    this.query<HTMLInputElement>('[data-seed]').value = String(seed);
  }

  private bindCheckbox(selector: string, apply: (on: boolean) => void): void {
    const box = this.query<HTMLInputElement>(selector);
    box.addEventListener('change', () => apply(box.checked));
  }

  private setTimeScale(scale: number): void {
    this.hooks.loop.timeScale = scale;
    for (const [value, button] of this.scaleButtons) button.classList.toggle('active', value === scale);
  }

  private updateReadout(): void {
    const cycle = this.hooks.cycle();
    if (!cycle) {
      this.readout.textContent = `No run active\nFPS ${this.fps.toFixed(0)}`;
      return;
    }
    const s = cycle.state;
    const label = DAY_CYCLE.phases[s.phaseIndex]!.label;
    const lines = [
      `Day ${s.day}  ${label} ${s.timeInPhase.toFixed(1)} / ${s.phaseLength} s`,
      `Run time  ${cycle.elapsed.toFixed(1)} s`,
      `FPS ${this.fps.toFixed(0)}   tick ${this.msPerTick.toFixed(3)} ms`,
      `Seed ${this.hooks.seed()}`,
      ...this.hooks.extraReadout(),
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
