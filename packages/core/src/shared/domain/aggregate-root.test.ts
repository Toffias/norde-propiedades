import { describe, expect, it } from 'vitest';

import { AggregateRoot } from './aggregate-root';
import type { DomainEvent } from './domain-event';

type CounterIncremented = DomainEvent<'CounterIncremented', { readonly value: number }>;

class Counter extends AggregateRoot<string, CounterIncremented> {
  #value = 0;

  static create(id: string): Counter {
    return new Counter(id);
  }

  increment(at: Date): void {
    this.#value += 1;
    this.record({
      type: 'CounterIncremented',
      aggregateId: this.id,
      occurredAt: at,
      payload: { value: this.#value },
    });
  }
}

describe('AggregateRoot', () => {
  const at = new Date('2026-01-01T00:00:00Z');

  it('records events in order', () => {
    const counter = Counter.create('c-1');
    counter.increment(at);
    counter.increment(at);

    expect(counter.pullEvents().map((e) => e.payload.value)).toEqual([1, 2]);
  });

  it('clears pending events after pulling them', () => {
    const counter = Counter.create('c-1');
    counter.increment(at);
    counter.pullEvents();

    expect(counter.pullEvents()).toEqual([]);
  });
});
