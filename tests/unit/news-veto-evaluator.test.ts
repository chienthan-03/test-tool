import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../src/config/schema.js';
import type { NewsSignal } from '../../src/core/types.js';
import { NewsVetoEvaluator } from '../../src/strategy/news-veto-evaluator.js';
import { NewsVetoStore } from '../../src/strategy/news-veto-store.js';

const config = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  strategy: {
    newsVeto: {
      enabled: true,
      minStrength: 0.75,
      vetoTags: ['macro', 'hack', 'etf'],
      leaderSymbol: 'BTCUSDT',
    },
  },
} as unknown as AppConfig;

const register = (store: NewsVetoStore, signal: Partial<NewsSignal>) => {
  store.register({
    id: 'sig-1',
    newsId: 'news-1',
    symbols: ['BTCUSDT'],
    direction: 'short',
    strength: 0.9,
    tags: ['macro'],
    expiresAt: new Date('2026-01-02T00:00:00Z'),
    source: 'rule',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    ...signal,
  });
};

describe('NewsVetoEvaluator', () => {
  it('vetoes ETH long when BTC macro bearish', () => {
    const store = new NewsVetoStore(config);
    register(store, { symbols: ['BTCUSDT'], direction: 'short' });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(true);
  });

  it('does not veto BTC long when only ETH bearish hack', () => {
    const store = new NewsVetoStore(config);
    register(store, { symbols: ['ETHUSDT'], direction: 'short', tags: ['hack'] });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('BTCUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(false);
  });

  it('does not veto same-direction macro', () => {
    const store = new NewsVetoStore(config);
    register(store, { direction: 'long' });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(false);
  });
});
