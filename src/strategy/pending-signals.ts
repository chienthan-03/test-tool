import type { NewsSignal } from '../core/types.js';

export interface PendingSignalEntry {
  signal: NewsSignal;
  receivedAt: Date;
}

export class PendingSignalStore {
  private readonly pending = new Map<string, PendingSignalEntry>();

  set(symbol: string, signal: NewsSignal): void {
    this.pending.set(symbol, { signal, receivedAt: new Date() });
  }

  get(symbol: string): PendingSignalEntry | undefined {
    return this.pending.get(symbol);
  }

  remove(symbol: string): void {
    this.pending.delete(symbol);
  }

  has(symbol: string): boolean {
    return this.pending.has(symbol);
  }

  pruneExpired(now: Date = new Date()): void {
    for (const [symbol, entry] of this.pending) {
      if (now > entry.signal.expiresAt) {
        this.pending.delete(symbol);
      }
    }
  }
}
