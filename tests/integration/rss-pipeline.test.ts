import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import { createLogger } from '../../src/core/logger.js';
import type { NewsSignal } from '../../src/core/types.js';
import { RssPoller, type FetchFn } from '../../src/news/rss-poller.js';
import { RssPollerManager } from '../../src/news/rss-poller-manager.js';
import { SymbolMapper } from '../../src/news/symbol-mapper.js';
import { NewsPipeline } from '../../src/sentiment/news-pipeline.js';
import { RuleScorer } from '../../src/sentiment/rule-scorer.js';
import { SignalMerger } from '../../src/sentiment/signal-merger.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { FeedRepository } from '../../src/storage/repositories/feed-repo.js';
import { NewsRepository } from '../../src/storage/repositories/news-repo.js';
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = join(projectRoot, 'data/test-trader.db');
const coindeskFixture = join(projectRoot, 'tests/fixtures/rss/coindesk-sample.xml');
const dogeFixture = join(projectRoot, 'tests/fixtures/rss/doge-only.xml');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const createMockFetch = (fixturePath: string): FetchFn => async () =>
  readFileSync(fixturePath, 'utf8');

const buildTestContext = (config: AppConfig, fetchFn: FetchFn) => {
  mkdirSync(join(projectRoot, 'data'), { recursive: true });

  const db = openDatabase(dbPath);
  migrate(db);

  const bus = new AppEventBus();
  const log = createLogger({ level: 'silent', pretty: false });
  const mapper = new SymbolMapper(config.symbols);
  const scorer = new RuleScorer(config.sentiment.rules);
  const merger = new SignalMerger({
    symbols: config.symbols,
    rules: { minStrength: config.sentiment.rules.minStrength },
    llm: {
      minConfidence: config.sentiment.llm.minConfidence,
      defaultTtlMinutes: config.sentiment.llm.defaultTtlMinutes,
    },
  });

  const pipeline = new NewsPipeline({
    mapper,
    scorer,
    merger,
    newsRepo: new NewsRepository(db),
    signalRepo: new SignalRepository(db),
    bus,
    config,
    log,
  });

  const poller = new RssPoller(fetchFn);
  const manager = new RssPollerManager({
    config,
    poller,
    pipeline,
    feedRepo: new FeedRepository(db),
    log,
  });

  return { db, bus, manager };
};

describe('rss-pipeline integration', () => {
  beforeEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('emits one BTCUSDT signal from coindesk fixture', async () => {
    const baseConfig = loadConfig(defaultConfigPath);
    const config: AppConfig = {
      ...baseConfig,
      feeds: [
        {
          id: 'coindesk-test',
          url: 'https://fixture.local/coindesk-sample.xml',
          pollIntervalSec: 90,
          enabled: true,
        },
      ],
    };

    const signals: NewsSignal[] = [];
    const { db, bus, manager } = buildTestContext(config, createMockFetch(coindeskFixture));

    bus.on('news:signal', (signal) => {
      signals.push(signal);
    });

    await manager.pollFeed(config.feeds[0]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.symbols).toEqual(['BTCUSDT']);
    expect(signals[0]?.direction).toBe('long');

    db.close();
  });

  it('emits zero signals from dogecoin-only fixture', async () => {
    const baseConfig = loadConfig(defaultConfigPath);
    const config: AppConfig = {
      ...baseConfig,
      feeds: [
        {
          id: 'doge-test',
          url: 'https://fixture.local/doge-only.xml',
          pollIntervalSec: 90,
          enabled: true,
        },
      ],
    };

    const signals: NewsSignal[] = [];
    const { db, bus, manager } = buildTestContext(config, createMockFetch(dogeFixture));

    bus.on('news:signal', (signal) => {
      signals.push(signal);
    });

    await manager.pollFeed(config.feeds[0]);

    expect(signals).toHaveLength(0);

    db.close();
  });
});
