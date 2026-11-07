// Typed event bus. Systems talk through this instead of importing each other's internals.
// GAME_DESIGN.md section 15.

import type { PauseReason } from './loop';

export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Subscribes to an event. Returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler<never>>();
    this.handlers.set(type, set);
    set.add(handler as Handler<never>);
    return () => {
      set.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers can unsubscribe while the event is being delivered.
    for (const handler of [...set]) {
      (handler as Handler<Events[K]>)(payload);
    }
  }
}

/** Every event in the game. Later milestones add to this list. */
export interface GameEvents {
  'game:paused': { reason: PauseReason };
  'game:resumed': { reason: PauseReason };
}
