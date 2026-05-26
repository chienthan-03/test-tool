import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../../src/storage/migrate.js';
import { TradeRepository } from '../../src/storage/repositories/trade-repo.js';

describe('TradeRepository entry_path', () => {
  let db: Database.Database;
  let repo: TradeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    repo = new TradeRepository(db);
  });

  it('persists entryPath on insertOpen', () => {
    repo.insertOpen({
      id: 'trade-1',
      mode: 'sim',
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.1,
      entryPrice: 100,
      stopLoss: 95,
      takeProfit: 110,
      entryPath: 'breakout',
    });

    const row = db
      .prepare('SELECT entry_path FROM trades WHERE id = ?')
      .get('trade-1') as { entry_path: string };

    expect(row.entry_path).toBe('breakout');
  });
});
