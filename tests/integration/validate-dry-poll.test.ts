import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { runValidateDryPoll } from '../../src/cli/commands/validate.js';
import type { FetchFn } from '../../src/news/rss-poller.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = join(projectRoot, 'data/test-dry-poll.db');
const coindeskFixture = join(projectRoot, 'tests/fixtures/rss/coindesk-sample.xml');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const createMockFetch = (fixturePath: string): FetchFn => async () =>
  readFileSync(fixturePath, 'utf8');

describe('validate dry-poll', () => {
  beforeEach(() => {
    mkdirSync(join(projectRoot, 'data'), { recursive: true });
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    process.env.SQLITE_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.SQLITE_PATH;
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('polls enabled feeds once and reports stats', async () => {
    const baseConfig = loadConfig(defaultConfigPath);
    const config: AppConfig = {
      ...baseConfig,
      storage: { ...baseConfig.storage, sqlitePath: dbPath },
      logging: { ...baseConfig.logging, pretty: false },
      feeds: [
        {
          id: 'coindesk-test',
          url: 'https://fixture.local/coindesk-sample.xml',
          pollIntervalSec: 90,
          enabled: true,
        },
      ],
    };

    const configPath = join(projectRoot, 'data/dry-poll-config.yaml');
    writeFileSync(configPath, stringify(config));

    const result = await runValidateDryPoll(configPath, createMockFetch(coindeskFixture));

    expect(result.itemsFetched).toBeGreaterThan(0);
    expect(result.signalsCreated).toBe(1);
  });
});
