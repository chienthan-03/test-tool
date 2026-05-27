import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

describe('SignalRepository tags', () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => db.close());

  it('round-trips tags_json', () => {
    const repo = new SignalRepository(db);
    const signal = {
      id: 'sig-1',
      newsId: 'news-1',
      symbols: ['BTCUSDT'],
      direction: 'short' as const,
      strength: 0.9,
      source: 'rule' as const,
      expiresAt: new Date('2026-06-01T00:00:00Z'),
      createdAt: new Date('2026-05-31T12:00:00Z'),
      tags: ['macro'],
    };
    repo.insert(signal);
    const loaded = repo.listBetween(new Date('2026-05-01'), new Date('2026-07-01'));
    expect(loaded[0]?.tags).toEqual(['macro']);
  });
});
