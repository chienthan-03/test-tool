import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../src/core/circuit-breaker.js';

const config = {
  enabled: true,
  maxFailures: 3,
  windowMs: 300_000,
};

describe('circuit-breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trips after 3 failures within the window', () => {
    const breaker = new CircuitBreaker(config);

    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
  });

  it('closes after recordSuccess clears failures', () => {
    const breaker = new CircuitBreaker(config);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
  });

  it('re-opens only when failures in window reach max again', () => {
    const breaker = new CircuitBreaker(config);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    breaker.recordSuccess();
    vi.advanceTimersByTime(config.windowMs + 1);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
  });

  it('stays closed when disabled', () => {
    const breaker = new CircuitBreaker({ ...config, enabled: false });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
  });
});
