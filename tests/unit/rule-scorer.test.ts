import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { RuleScorer, type RuleScoreDiscard } from '../../src/sentiment/rule-scorer.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { NewsItem } from '../../src/core/types.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const isDiscard = (result: unknown): result is RuleScoreDiscard =>
  result !== null && typeof result === 'object' && 'discard' in result && result.discard === true;

const makeNewsItem = (overrides: Partial<NewsItem> & Pick<NewsItem, 'title'>): NewsItem => ({
  id: 'news-test-1',
  sourceId: 'coindesk',
  title: overrides.title,
  summary: overrides.summary,
  url: 'https://example.com/article',
  publishedAt: new Date('2026-05-20T12:00:00Z'),
  fetchedAt: new Date('2026-05-20T12:01:00Z'),
  symbols: overrides.symbols ?? ['BTCUSDT'],
  tags: overrides.tags ?? [],
  ...overrides,
});

describe('RuleScorer', () => {
  let rules: AppConfig['sentiment']['rules'];
  let scorer: RuleScorer;

  beforeAll(() => {
    rules = loadConfig(defaultConfigPath).sentiment.rules;
    scorer = new RuleScorer(rules);
  });

  it('blacklist discards', () => {
    const result = scorer.score(
      makeNewsItem({
        title: 'New token offers guaranteed returns for early buyers',
        symbols: ['BTCUSDT'],
      }),
    );

    expect(isDiscard(result)).toBe(true);
  });

  it('hack keywords → ruleSentiment -1, tag hack', () => {
    const result = scorer.score(
      makeNewsItem({
        title: 'Bridge protocol hack drains millions in BTC',
        summary: 'Exploiters breached the contract overnight.',
      }),
    );

    expect(isDiscard(result)).toBe(false);
    if (isDiscard(result) || result === null) {
      throw new Error('expected scored result');
    }

    expect(result.ruleSentiment).toBe(-1);
    expect(result.tags).toContain('hack');
  });

  it('needsLlm true for high impact ambiguous (macro headline fixture text)', () => {
    const result = scorer.score(
      makeNewsItem({
        title: 'Fed and CPI in focus as FOMC holds rates; crypto markets watch Powell',
        summary: 'Traders await guidance with no clear risk-on or risk-off bias.',
      }),
    );

    expect(isDiscard(result)).toBe(false);
    if (isDiscard(result) || result === null) {
      throw new Error('expected scored result');
    }

    expect(result.priority).toBe('high');
    expect(result.ruleSentiment).toBe(0);
    expect(result.needsLlm).toBe(true);
    expect(result.needsLlmReason).toBe('high_priority_neutral_sentiment');
  });

  it('macro tag → priority high', () => {
    const result = scorer.score(
      makeNewsItem({
        title: 'Powell remarks on interest rates after CPI print',
        summary: 'Macro traders reposition ahead of the next Fed meeting.',
      }),
    );

    expect(isDiscard(result)).toBe(false);
    if (isDiscard(result) || result === null) {
      throw new Error('expected scored result');
    }

    expect(result.tags).toContain('macro');
    expect(result.priority).toBe('high');
  });
});
