// Screen shake (M10), trauma model: big hits add trauma (0–1), which decays at a fixed rate.
// The view offset is maxOffset × trauma² times a smooth wobble, so small hits barely move
// the view and big ones jolt it. Purely visual: it moves the camera only while drawing.

import { SHAKE } from '../data/fx';
import type { EventBus, GameEvents } from '../core/events';
import type { Point } from '../core/input';

export class ScreenShake {
  trauma = 0;
  /** Settings → Screen shake. When off, the offset is always zero. */
  enabled = true;
  private time = 0;
  private unsubscribe: (() => void)[] = [];

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  advance(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - SHAKE.decay * dt);
  }

  /** Pixel offset for the view this frame. */
  offset(): Point {
    if (!this.enabled || this.trauma <= 0) return { x: 0, y: 0 };
    const mag = SHAKE.maxOffset * this.trauma * this.trauma;
    const t = this.time * SHAKE.frequency * Math.PI * 2;
    return {
      x: mag * (Math.sin(t) * 0.6 + Math.sin(t * 1.7 + 1.3) * 0.4),
      y: mag * (Math.cos(t * 1.3 + 0.7) * 0.6 + Math.sin(t * 2.1 + 2.1) * 0.4),
    };
  }

  /**
   * Listen to a run's events. `onScreen` says whether a world point is in view (buildings and
   * the Phylactery only shake the view when the player can see them get hit).
   */
  attach(events: EventBus<GameEvents>, onScreen: (x: number, y: number) => boolean): void {
    this.detach();
    this.unsubscribe = [
      events.on('player:damaged', (e) => {
        if (e.amount >= SHAKE.playerHit.minDamage) this.add(SHAKE.playerHit.trauma);
      }),
      events.on('player:died', () => this.add(SHAKE.playerDied)),
      events.on('run:lost', (e) => {
        if (e.cause === 'player') this.add(SHAKE.playerDied);
      }),
      events.on('building:destroyed', (e) => {
        if (onScreen(e.x, e.y)) this.add(SHAKE.buildingDestroyed);
      }),
      events.on('phylactery:damaged', (e) => {
        if (e.amount >= SHAKE.phylacteryHit.minDamage && onScreen(0.5, 0.5)) this.add(SHAKE.phylacteryHit.trauma);
      }),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.trauma = 0;
  }
}
