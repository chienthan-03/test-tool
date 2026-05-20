import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { LlmGateway } from '../../src/sentiment/llm-gateway.js';
import { NewsPipeline } from '../../src/sentiment/news-pipeline.js';
import { RuleScorer } from '../../src/sentiment/rule-scorer.js';
import { SignalMerger } from '../../src/sentiment/signal-merger.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { FeedRepository } from '../../src/storage/repositories/feed-repo.js';
import { LlmRepository } from '../../src/storage/repositories/llm-repo.js';
import { NewsRepository } from '../../src/storage/repositories/news-repo.js';
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = join(projectRoot, 'data/test-llm-pipeline.db');
const macroFixture = join(projectRoot, 'tests/fixtures/rss/macro-ambiguous.xml');
const coindeskFixture = join(projectRoot, 'tests/fixtures/rss/coindesk-sample.xml');
const validBullishFixture = JSON.parse(
  readFileSync(join(projectRoot, 'tests/fixtures/llm/valid-bullish.json'), 'utf8'),
);
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const createRssFetch = (fixturePath: string): FetchFn => async () =>
  readFileSync(fixturePath, 'utf8');

const buildTestContext = (
  config: AppConfig,
  rssFetchFn: FetchFn,
  llmFetchMock?: typeof fetch,
) => {
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

  const llmGateway = config.sentiment.llm.enabled
    ? new LlmGateway(config.sentiment.llm, new LlmRepository(db), llmFetchMock ?? fetch)
    : null;

  const pipeline = new NewsPipeline({
    mapper,
    scorer,
    merger,
    llmGateway,
    newsRepo: new NewsRepository(db),
    signalRepo: new SignalRepository(db),
    bus,
    config,
    log,
  });

  const poller = new RssPoller(rssFetchFn);
  const manager = new RssPollerManager({
    config,
    poller,
    pipeline,
    feedRepo: new FeedRepository(db),
    bus,
    log,
  });

  return { db, bus, manager };
};

describe('news-llm-pipeline integration', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('uses LLM for ambiguous macro headline and emits llm or merged signal', async () => {
    const baseConfig = loadConfig(defaultConfigPath);
    const config: AppConfig = {
      ...baseConfig,
      sentiment: {
        ...baseConfig.sentiment,
        llm: { ...baseConfig.sentiment.llm, enabled: true },
      },
      feeds: [
        {
          id: 'macro-test',
          url: 'https://fixture.local/macro-ambiguous.xml',
          pollIntervalSec: 90,
          enabled: true,
        },
      ],
    };

    const llmFetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => validBullishFixture,
    })) as unknown as typeof fetch;

    vi.stubGlobal('fetch', llmFetchMock);

    const signals: NewsSignal[] = [];
    const { db, bus, manager } = buildTestContext(
      config,
      createRssFetch(macroFixture),
      llmFetchMock,
    );

    bus.on('news:signal', (signal) => {
      signals.push(signal);
    });

    await manager.pollFeed(config.feeds[0]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.symbols).toEqual(['BTCUSDT']);
    expect(signals[0]?.direction).toBe('long');
    expect(['llm', 'merged']).toContain(signals[0]?.source);
    expect(llmFetchMock).toHaveBeenCalledOnce();

    db.close();
  });

  it('runs rule-only when llm is disabled', async () => {
    const baseConfig = loadConfig(defaultConfigPath);
    const config: AppConfig = {
      ...baseConfig,
      sentiment: {
        ...baseConfig.sentiment,
        llm: { ...baseConfig.sentiment.llm, enabled: false },
      },
      feeds: [
        {
          id: 'coindesk-test',
          url: 'https://fixture.local/coindesk-sample.xml',
          pollIntervalSec: 90,
          enabled: true,
        },
      ],
    };

    const llmFetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', llmFetchMock);

    const signals: NewsSignal[] = [];
    const { db, bus, manager } = buildTestContext(
      config,
      createRssFetch(coindeskFixture),
      llmFetchMock,
    );

    bus.on('news:signal', (signal) => {
      signals.push(signal);
    });

    await manager.pollFeed(config.feeds[0]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('rule');
    expect(llmFetchMock).not.toHaveBeenCalled();

    db.close();
  });
});
