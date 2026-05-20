import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { FeedRepository } from '../../src/storage/repositories/feed-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = join(projectRoot, 'data/test-feed-repo.db');

describe('FeedRepository', () => {
  beforeEach(() => {
    mkdirSync(join(projectRoot, 'data'), { recursive: true });
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('listAll returns statuses ordered by feed id', () => {
    const db = openDatabase(dbPath);
    migrate(db);
    const repo = new FeedRepository(db);

    repo.upsertStatus({
      feedId: 'z-feed',
      lastSuccessAt: new Date('2026-05-20T12:00:00.000Z'),
      consecutiveFailures: 0,
    });
    repo.upsertStatus({
      feedId: 'a-feed',
      lastErrorAt: new Date('2026-05-20T11:00:00.000Z'),
      lastError: 'timeout',
      consecutiveFailures: 2,
    });

    const statuses = repo.listAll();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]?.feedId).toBe('a-feed');
    expect(statuses[1]?.feedId).toBe('z-feed');
    expect(statuses[0]?.lastError).toBe('timeout');
    expect(statuses[0]?.consecutiveFailures).toBe(2);

    db.close();
  });
});
