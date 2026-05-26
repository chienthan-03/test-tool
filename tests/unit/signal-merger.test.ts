import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { SignalMerger, type SignalMergerConfig } from '../../src/sentiment/signal-merger.js';
import type { NewsItem, RuleScoreResult } from '../../src/core/types.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const makeNewsItem = (overrides?: Partial<NewsItem>): NewsItem => ({
  id: 'news-test-1',
  sourceId: 'coindesk',
  title: 'Bitcoin rally lifts BTC after ETF approval',
  summary: 'Traders cite strong inflows.',
  url: 'https://example.com/article',
  publishedAt: new Date('2026-05-20T12:00:00Z'),
  fetchedAt: new Date('2026-05-20T12:01:00Z'),
  symbols: ['BTCUSDT'],
  tags: ['etf'],
  ...overrides,
});

const makeRule = (overrides?: Partial<RuleScoreResult>): RuleScoreResult => ({
  newsId: 'news-test-1',
  impactScore: 3,
  ruleSentiment: 1,
  priority: 'medium',
  tags: ['etf'],
  needsLlm: false,
  ...overrides,
});

describe('SignalMerger', () => {
  let merger: SignalMerger;
  let mergerConfig: SignalMergerConfig;

  beforeAll(() => {
    const config = loadConfig(defaultConfigPath);
    mergerConfig = {
      symbols: config.symbols,
      rules: { minStrength: config.sentiment.rules.minStrength },
      llm: {
        minConfidence: config.sentiment.llm.minConfidence,
        defaultTtlMinutes: config.sentiment.llm.defaultTtlMinutes,
      },
    };
    merger = new SignalMerger(mergerConfig);
  });

  it('rule long', () => {
    const signal = merger.build(makeRule(), makeNewsItem());

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('long');
    expect(signal?.source).toBe('rule');
    expect(signal?.symbols).toEqual(['BTCUSDT']);
    expect(signal?.newsId).toBe('news-test-1');
    expect(signal?.strength).toBeGreaterThanOrEqual(mergerConfig.rules.minStrength);
  });

  it('below minStrength', () => {
    const signal = merger.build(
      makeRule({ impactScore: 1, ruleSentiment: 1 }),
      makeNewsItem(),
    );

    expect(signal).toBeNull();
  });

  it('neutral rule sentiment yields null without llm', () => {
    const signal = merger.build(
      makeRule({ ruleSentiment: 0, impactScore: 5 }),
      makeNewsItem(),
    );

    expect(signal).toBeNull();
  });

  it('filters symbols to whitelist intersection', () => {
    const signal = merger.build(
      makeRule(),
      makeNewsItem({ symbols: ['BTCUSDT', 'DOGEUSDT'] }),
    );

    expect(signal?.symbols).toEqual(['BTCUSDT']);
  });
});
