import type { AppConfig } from '../config/schema.js';

export type CircuitBreakerConfig = AppConfig['binance']['circuitBreaker'];

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private failureTimestamps: number[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  recordFailure(): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    this.failureTimestamps.push(now);
    this.pruneOldFailures(now);
  }

  recordSuccess(): void {
    this.failureTimestamps = [];
  }

  isOpen(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const now = Date.now();
    this.pruneOldFailures(now);
    return this.failureTimestamps.length >= this.config.maxFailures;
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts >= cutoff);
  }
}
