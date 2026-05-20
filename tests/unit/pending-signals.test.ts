import { describe, it, expect } from 'vitest';
import type { NewsSignal } from '../../src/core/types.js';
import { PendingSignalStore } from '../../src/strategy/pending-signals.js';

const makeSignal = (expiresAt: Date): NewsSignal => ({
  id: 'sig-1',
  newsId: 'news-1',
  symbols: ['BTCUSDT'],
  direction: 'long',
  strength: 0.8,
  expiresAt,
  source: 'rule',
  createdAt: new Date('2026-05-20T10:00:00Z'),
});

describe('PendingSignalStore', () => {
  it('expire removes pending', () => {
    const store = new PendingSignalStore();
    const expiredAt = new Date('2026-05-20T11:00:00Z');
    store.set('BTCUSDT', makeSignal(expiredAt));

    expect(store.has('BTCUSDT')).toBe(true);

    store.pruneExpired(new Date('2026-05-20T12:00:00Z'));

    expect(store.has('BTCUSDT')).toBe(false);
    expect(store.get('BTCUSDT')).toBeUndefined();
  });
});
