// Particles (M10): enemy death bursts, hit sparks, building debris, and harvest motes.
// Purely visual, like Effects: they age with simulation time (advance() is called from the
// tick), use their own RNG, and never feed back into the simulation.
// Stored as flat typed arrays in a ring, so a big fight allocates nothing.

import { ENEMIES } from '../data/enemies';
import { PARTICLES, type BurstDef, type Range } from '../data/fx';
import { BUILDINGS, PHYLACTERY } from '../data/buildings';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { EventBus, GameEvents } from '../core/events';
import { Rng } from '../core/rng';
import type { Camera } from './camera';

export class Particles {
  private readonly max = PARTICLES.max;
  private readonly x = new Float32Array(this.max);
  private readonly y = new Float32Array(this.max);
  private readonly vx = new Float32Array(this.max);
  private readonly vy = new Float32Array(this.max);
  private readonly age = new Float32Array(this.max);
  private readonly life = new Float32Array(this.max);
  private readonly size = new Float32Array(this.max);
  private readonly rise = new Float32Array(this.max);
  private readonly color: string[] = new Array<string>(this.max).fill('#fff');
  /** Next slot to write; wraps, replacing the oldest. */
  private next = 0;
  private readonly rng = new Rng(0x9a271c);
  private unsubscribe: (() => void)[] = [];

  /** Number of live particles (for tests and the debug readout). */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this.age[i]! < this.life[i]!) n++;
    return n;
  }

  attach(events: EventBus<GameEvents>): void {
    this.detach();
    this.unsubscribe = [
      events.on('enemy:died', (e) => {
        const def = ENEMIES[e.type];
        this.burst(e.x, e.y, PARTICLES.death[def.corpseSize], def.color);
        if (e.elite) this.burst(e.x, e.y, PARTICLES.eliteBurst, PARTICLES.eliteColor);
      }),
      events.on('enemy:damaged', (e) => {
        if (e.hp > 0) this.burst(e.x, e.y, PARTICLES.hit, PARTICLES.hitColor);
      }),
      events.on('building:destroyed', (e) => this.burst(e.x, e.y, PARTICLES.debris, BUILDINGS[e.kind].color)),
      events.on('corpse:harvested', (e) => this.burst(e.x, e.y, PARTICLES.harvest, PARTICLES.harvestColor)),
      events.on('phylactery:damaged', () => {
        const fp = PHYLACTERY.footprint;
        this.burst(fp.x + fp.w / 2, fp.y + fp.h / 2, PARTICLES.phylactery, PARTICLES.phylacteryColor);
      }),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.age.fill(0);
    this.life.fill(0);
  }

  /** Emits `def.count` particles at a world point, in random directions. */
  burst(wx: number, wy: number, def: BurstDef, color: string): void {
    for (let n = 0; n < def.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.roll(def.speed);
      this.x[i] = wx;
      this.y[i] = wy;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.age[i] = 0;
      this.life[i] = this.roll(def.life);
      this.size[i] = this.roll(def.size);
      this.rise[i] = def.rise;
      this.color[i] = color;
    }
  }

  advance(dt: number): void {
    const keep = Math.max(0, 1 - PARTICLES.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i]! >= this.life[i]!) continue;
      this.age[i]! += dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += (this.vy[i]! - this.rise[i]!) * dt;
      this.vx[i]! *= keep;
      this.vy[i]! *= keep;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (let i = 0; i < this.max; i++) {
      const life = this.life[i]!;
      const age = this.age[i]!;
      if (age >= life) continue;
      const s = camera.worldToScreen(this.x[i]!, this.y[i]!);
      if (s.x < -10 || s.y < -10 || s.x > VIEW_WIDTH + 10 || s.y > VIEW_HEIGHT + 10) continue;
      const t = age / life;
      const size = this.size[i]! * (1 - t * 0.5);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = this.color[i]!;
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private roll(range: Range): number {
    return range[0] + (range[1] - range[0]) * this.rng.next();
  }
}

