import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { LlmGateway } from '../../src/sentiment/llm-gateway.js';
import type { NewsItem, RuleScoreResult } from '../../src/core/types.js';
import type { LlmRepository } from '../../src/storage/repositories/llm-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');
const validBullishFixture = JSON.parse(
  readFileSync(join(projectRoot, 'tests/fixtures/llm/valid-bullish.json'), 'utf8'),
);

const makeNewsItem = (): NewsItem => ({
  id: 'news-llm-test-1',
  sourceId: 'coindesk',
  title: 'Bitcoin ETF sees record inflows',
  summary: 'Institutional demand continues to build.',
  url: 'https://example.com/btc-etf',
  publishedAt: new Date('2026-05-20T12:00:00Z'),
  fetchedAt: new Date('2026-05-20T12:01:00Z'),
  symbols: ['BTCUSDT'],
  tags: ['etf'],
});

const makeRule = (): RuleScoreResult => ({
  newsId: 'news-llm-test-1',
  impactScore: 3,
  ruleSentiment: 0,
  priority: 'high',
  tags: ['etf', 'macro'],
  needsLlm: true,
  needsLlmReason: 'high priority ambiguous sentiment',
});

const makeLlmRepo = (countLastHour = 0): LlmRepository =>
  ({
    countLastHour: vi.fn(() => countLastHour),
    insertCall: vi.fn(() => 1),
  }) as unknown as LlmRepository;

describe('LlmGateway', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
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
  });

  it('parses valid JSON', async () => {
    const config = loadConfig(defaultConfigPath);
    const llmRepo = makeLlmRepo();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => validBullishFixture,
    })) as unknown as typeof fetch;

    vi.stubGlobal('fetch', fetchMock);

    const gateway = new LlmGateway(config.sentiment.llm, llmRepo);
    const result = await gateway.analyze(makeNewsItem(), makeRule(), ['BTCUSDT', 'ETHUSDT']);

    expect(result).toEqual({
      sentiment: 1,
      confidence: 0.85,
      affectedSymbols: ['BTCUSDT'],
      rationale: 'ETF inflows and risk-on macro support BTC futures.',
      ttlMinutes: 60,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(llmRepo.insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        newsId: 'news-llm-test-1',
        model: config.sentiment.llm.model,
        success: true,
        promptTokens: 312,
        completionTokens: 48,
      }),
    );
  });

  it('rate limit blocks', async () => {
    const config = loadConfig(defaultConfigPath);
    const llmRepo = makeLlmRepo(config.sentiment.llm.maxCallsPerHour);
    const fetchMock = vi.fn() as unknown as typeof fetch;

    vi.stubGlobal('fetch', fetchMock);

    const gateway = new LlmGateway(config.sentiment.llm, llmRepo);
    const result = await gateway.analyze(makeNewsItem(), makeRule(), ['BTCUSDT']);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(llmRepo.insertCall).not.toHaveBeenCalled();
  });
});
