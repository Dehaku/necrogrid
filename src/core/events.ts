// Typed event bus. Systems talk through this instead of importing each other's internals.
// GAME_DESIGN.md section 15.

import type { CorpseSize, EnemyId } from '../data/enemies';
import type { ResourceAmounts, ResourceId } from '../data/resources';
import type { TileId } from '../data/terrain';
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
  /** A chunk was generated. Flow fields listen for this from M3. */
  'chunk:generated': { chunkX: number; chunkY: number };
  /** A terrain edit changed a tile (player-made marsh, or marsh filled to dirt). */
  'tile:changed': { tileX: number; tileY: number; tile: TileId };
  /** A phase started. `phase:day` also marks the day counter going up. */
  'phase:day': { day: number };
  'phase:dusk': { day: number };
  'phase:night': { day: number };
  'phase:dawn': { day: number };
  'enemy:spawned': { id: number; type: EnemyId; elite: boolean };
  'player:damaged': { amount: number; hp: number };
  'phylactery:damaged': { amount: number; hp: number };
  'enemy:damaged': { id: number; x: number; y: number; amount: number; hp: number };
  'enemy:died': { id: number; type: EnemyId; elite: boolean; x: number; y: number };
  /** A melee enemy landed a hit; drives the swipe visual. `size` is the enemy's draw size. */
  'enemy:attacked': { x: number; y: number; angle: number; size: number; elite: boolean };
  'resources:changed': { id: ResourceId; delta: number; total: number };
  'corpse:spawned': { id: number; x: number; y: number; size: CorpseSize; elite: boolean };
  /** A corpse was harvested; `loot` is what was actually added after caps. */
  'corpse:harvested': { id: number; x: number; y: number; loot: ResourceAmounts };
  'harvest:started': { id: number };
  'harvest:interrupted': { id: number; reason: 'damage' | 'moved' | 'faded' };
  'mend:cast': Record<string, never>;
  /** Chain was cast. `points` runs from the necromancer through each enemy hit, in order. */
  'chain:cast': { points: { x: number; y: number }[] };
  'run:lost': { cause: 'player' | 'phylactery'; day: number; kills: number; corpsesHarvested: number; score: number };
}
