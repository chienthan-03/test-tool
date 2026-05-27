import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../src/config/schema.js';
import type { NewsSignal } from '../../src/core/types.js';
import { NewsVetoStore } from '../../src/strategy/news-veto-store.js';

const baseConfig = {
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

const makeSignal = (over: Partial<NewsSignal>): NewsSignal => ({
  id: 'sig-1',
  newsId: 'news-1',
  symbols: ['BTCUSDT'],
  direction: 'short',
  strength: 0.9,
  tags: ['macro'],
  expiresAt: new Date('2026-01-02T00:00:00Z'),
  source: 'rule',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  ...over,
});

describe('NewsVetoStore', () => {
  it('registers qualifying macro signal', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({}));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(true);
  });

  it('skips signal below minStrength', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ strength: 0.5 }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(false);
  });

  it('skips signal without veto tag', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ tags: ['regulation'] }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(false);
  });

  it('prunes expired signals', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ expiresAt: new Date('2026-01-01T13:00:00Z') }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-02T00:00:00Z'))).toBe(false);
  });
});
