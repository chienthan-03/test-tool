import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { NewsRepository } from '../../src/storage/repositories/news-repo.js';
import type { NewsItem } from '../../src/core/types.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = join(projectRoot, 'data/test-trader.db');

describe('news-repo', () => {
  afterEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('insert and exists', () => {
    mkdirSync(join(projectRoot, 'data'), { recursive: true });

    const db = openDatabase(dbPath);
    migrate(db);
    const repo = new NewsRepository(db);

    const item: NewsItem = {
      id: 'abc123def4567890abcdef12345678',
      sourceId: 'coindesk',
      title: 'Bitcoin hits new high',
      url: 'https://example.com/btc',
      publishedAt: new Date('2026-05-20T10:00:00.000Z'),
      fetchedAt: new Date('2026-05-20T10:00:05.000Z'),
      symbols: ['BTCUSDT'],
      tags: ['macro'],
    };

    expect(repo.exists(item.id)).toBe(false);
    repo.insertRaw(item);
    expect(repo.exists(item.id)).toBe(true);

    db.close();
  });
});
