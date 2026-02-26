import type {
  CircuitBreaker,
  CircuitBreakerDecision,
  CircuitBreakerAction,
} from '../../types/build';

const DEFAULT_MAX_ATTEMPTS = 3;

export class CircuitBreakerTracker {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultMaxAttempts: number;

  constructor(defaultMaxAttempts = DEFAULT_MAX_ATTEMPTS) {
    this.defaultMaxAttempts = sanitizeMaxAttempts(
      defaultMaxAttempts,
      DEFAULT_MAX_ATTEMPTS,
    );
  }

  get(atomId: string): CircuitBreaker | null {
    const breaker = this.breakers.get(atomId);
    return breaker ? cloneBreaker(breaker) : null;
  }

  canAttempt(atomId: string): boolean {
    const breaker = this.breakers.get(atomId);
    return breaker ? breaker.state !== 'open' : true;
  }

  recordFailure(
    atomId: string,
    error: string,
    maxAttempts?: number,
  ): CircuitBreakerDecision {
    const breaker = this.ensureBreaker(atomId, maxAttempts);

    if (breaker.state === 'open') {
      return {
        action: 'skip',
        breaker: cloneBreaker(breaker),
        remainingAttempts: 0,
      };
    }

    const nextAttempts = breaker.attempts + 1;
    const reachedMax = nextAttempts >= breaker.maxAttempts;
    const nextState = reachedMax ? 'open' : 'half-open';
    const action: CircuitBreakerAction = reachedMax ? 'skip' : 'retry';
    const remainingAttempts = Math.max(0, breaker.maxAttempts - nextAttempts);

    const updated: CircuitBreaker = {
      atomId: breaker.atomId,
      attempts: nextAttempts,
      maxAttempts: breaker.maxAttempts,
      lastError: error,
      state: nextState,
    };

    this.breakers.set(atomId, updated);

    return {
      action,
      breaker: cloneBreaker(updated),
      remainingAttempts,
    };
  }

  recordSuccess(atomId: string, maxAttempts?: number): CircuitBreaker {
    const breaker = this.ensureBreaker(atomId, maxAttempts);
    const updated: CircuitBreaker = {
      atomId: breaker.atomId,
      attempts: 0,
      maxAttempts: breaker.maxAttempts,
      lastError: '',
      state: 'closed',
    };

    this.breakers.set(atomId, updated);
    return cloneBreaker(updated);
  }

  reset(atomId: string, maxAttempts?: number): CircuitBreaker {
    return this.recordSuccess(atomId, maxAttempts);
  }

  clear(): void {
    this.breakers.clear();
  }

  private ensureBreaker(atomId: string, maxAttempts?: number): CircuitBreaker {
    const fallback = this.defaultMaxAttempts;
    const sanitizedMax = sanitizeMaxAttempts(maxAttempts, fallback);
    const existing = this.breakers.get(atomId);

    if (existing) {
      if (existing.maxAttempts !== sanitizedMax) {
        const updated: CircuitBreaker = {
          ...existing,
          maxAttempts: sanitizedMax,
        };
        this.breakers.set(atomId, updated);
        return updated;
      }
      return existing;
    }

    const created: CircuitBreaker = {
      atomId,
      attempts: 0,
      maxAttempts: sanitizedMax,
      lastError: '',
      state: 'closed',
    };
    this.breakers.set(atomId, created);
    return created;
  }
}

function sanitizeMaxAttempts(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : fallback;
}

function cloneBreaker(breaker: CircuitBreaker): CircuitBreaker {
  return {
    atomId: breaker.atomId,
    attempts: breaker.attempts,
    maxAttempts: breaker.maxAttempts,
    lastError: breaker.lastError,
    state: breaker.state,
  };
}
