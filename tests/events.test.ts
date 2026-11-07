import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';

interface TestEvents {
  ping: { n: number };
}

describe('EventBus', () => {
  it('delivers payloads to subscribers until they unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    const off = bus.on('ping', ({ n }) => seen.push(n));
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1]);
  });

  it('lets a handler unsubscribe while the event is being delivered', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    const offA = bus.on('ping', () => {
      seen.push('a');
      offA();
    });
    bus.on('ping', () => seen.push('b'));
    bus.emit('ping', { n: 0 });
    bus.emit('ping', { n: 0 });
    expect(seen).toEqual(['a', 'b', 'b']);
  });
});
