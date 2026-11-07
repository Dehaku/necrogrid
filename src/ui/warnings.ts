// Warning banners, top-center under the Phylactery panel. GAME_DESIGN.md section 8.4.
// Event-driven ones (attack, day 15, completion) listen to the run's events; time-based ones
// (dusk, dawn, critical) are checked each tick from the cycle and Phylactery state. Banners age
// with simulation time, like the other effects.

import { WARNINGS } from '../data/ui';
import { VIEW_WIDTH } from '../data/tuning';
import { DAY_CYCLE } from '../data/time';
import type { EventBus, GameEvents } from '../core/events';
import type { CycleState } from '../time/dayCycle';

interface Banner {
  text: string;
  age: number;
}

export interface WarningInputs {
  cycle: CycleState;
  phylacteryHp: number;
  phylacteryMaxHp: number;
}

export class Warnings {
  banners: Banner[] = [];
  private clock = 0;
  private lastAttackBanner = -Infinity;
  private criticalShown = false;
  /** "day:phaseIndex" keys already warned about, so each warning fires once per phase. */
  private warned = new Set<string>();
  private unsubscribe: (() => void)[] = [];

  attach(events: EventBus<GameEvents>): void {
    for (const off of this.unsubscribe) off();
    this.banners = [];
    this.clock = 0;
    this.lastAttackBanner = -Infinity;
    this.criticalShown = false;
    this.warned.clear();
    this.unsubscribe = [
      events.on('phylactery:damaged', () => {
        if (this.clock - this.lastAttackBanner < WARNINGS.attackCooldown) return;
        this.lastAttackBanner = this.clock;
        this.show(WARNINGS.text.underAttack);
      }),
      events.on('phase:day', ({ day }) => {
        if (day === DAY_CYCLE.winDay) this.show(WARNINGS.text.day15);
      }),
      events.on('run:won', () => this.show(WARNINGS.text.complete)),
    ];
  }

  show(text: string): void {
    this.banners.push({ text, age: 0 });
  }

  /** Call once per simulation tick. */
  update(dt: number, s: WarningInputs): void {
    this.clock += dt;
    for (const b of this.banners) b.age += dt;
    this.banners = this.banners.filter((b) => b.age < WARNINGS.duration);

    const remaining = s.cycle.phaseLength - s.cycle.timeInPhase;
    const key = `${s.cycle.day}:${s.cycle.phase}`;
    if (remaining <= WARNINGS.leadTime && !this.warned.has(key)) {
      if (s.cycle.phase === 'day') {
        this.warned.add(key);
        this.show(WARNINGS.text.dusk);
      } else if (s.cycle.phase === 'night') {
        this.warned.add(key);
        this.show(WARNINGS.text.dawn);
      }
    }

    const share = s.phylacteryHp / s.phylacteryMaxHp;
    if (share < WARNINGS.criticalShare && s.phylacteryHp > 0 && !this.criticalShown) {
      this.criticalShown = true;
      this.show(WARNINGS.text.critical);
    } else if (share > WARNINGS.criticalShare) {
      this.criticalShown = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Newest at the top, at most three.
    const shown = this.banners.slice(-3).reverse();
    shown.forEach((b, i) => {
      const fade = Math.min(1, (WARNINGS.duration - b.age) / 0.5);
      const y = 70 + i * 30;
      ctx.globalAlpha = fade;
      ctx.font = '700 17px system-ui, sans-serif';
      const w = ctx.measureText(b.text).width + 28;
      ctx.fillStyle = 'rgba(12, 10, 16, 0.82)';
      ctx.fillRect(VIEW_WIDTH / 2 - w / 2, y - 13, w, 26);
      const urgent = b.text === WARNINGS.text.underAttack || b.text === WARNINGS.text.critical;
      ctx.fillStyle = urgent ? '#ff7070' : '#f2ead8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, VIEW_WIDTH / 2, y + 1);
    });
    ctx.globalAlpha = 1;
  }
}
