import { describe, expect, it } from 'vitest';

import { CircuitBreakerTracker } from '../../../src/engine/builder/circuit-breaker';

describe('CircuitBreakerTracker', () => {
  it('should retry until max attempts then skip', () => {
    const tracker = new CircuitBreakerTracker();

    const first = tracker.recordFailure('atom-1', 'first error');
    expect(first.action).toBe('retry');
    expect(first.breaker.attempts).toBe(1);
    expect(first.breaker.state).toBe('half-open');
    expect(first.remainingAttempts).toBe(2);

    const second = tracker.recordFailure('atom-1', 'second error');
    expect(second.action).toBe('retry');
    expect(second.breaker.attempts).toBe(2);
    expect(second.breaker.state).toBe('half-open');
    expect(second.remainingAttempts).toBe(1);

    const third = tracker.recordFailure('atom-1', 'third error');
    expect(third.action).toBe('skip');
    expect(third.breaker.attempts).toBe(3);
    expect(third.breaker.state).toBe('open');
    expect(third.remainingAttempts).toBe(0);
  });

  it('should reset breaker on success', () => {
    const tracker = new CircuitBreakerTracker();
    tracker.recordFailure('atom-2', 'failure');

    const reset = tracker.recordSuccess('atom-2');
    expect(reset.state).toBe('closed');
    expect(reset.attempts).toBe(0);
    expect(reset.lastError).toBe('');
  });

  it('should track attempts per atom independently', () => {
    const tracker = new CircuitBreakerTracker();
    tracker.recordFailure('atom-a', 'error a1');
    tracker.recordFailure('atom-a', 'error a2');
    tracker.recordFailure('atom-b', 'error b1');

    const atomA = tracker.get('atom-a');
    const atomB = tracker.get('atom-b');

    expect(atomA?.attempts).toBe(2);
    expect(atomA?.state).toBe('half-open');
    expect(atomB?.attempts).toBe(1);
    expect(atomB?.state).toBe('half-open');
  });
});
