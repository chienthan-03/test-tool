import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { collectProfileWarnings } from '../../src/config/profile-warnings.js';

const defaultConfigPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/default.yaml',
);

describe('collectProfileWarnings', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('returns no warnings for swing with swing timeframes', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1d', entry: '4h' },
      strategy: { ...baseConfig.strategy, entryProfile: 'swing' },
    };

    expect(collectProfileWarnings(config)).toEqual([]);
  });

  it('returns no warnings for intraday with intraday timeframes', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1h', entry: '15m' },
      strategy: { ...baseConfig.strategy, entryProfile: 'intraday' },
    };

    expect(collectProfileWarnings(config)).toEqual([]);
  });

  it('warns when intraday profile uses swing timeframes', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1d', entry: '4h' },
      strategy: { ...baseConfig.strategy, entryProfile: 'intraday' },
    };

    expect(collectProfileWarnings(config)).toEqual([
      'entryProfile intraday with swing timeframes (1d/4h); use 1h/15m recommended',
    ]);
  });

  it('warns when intraday profile uses 4h entry only', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1h', entry: '4h' },
      strategy: { ...baseConfig.strategy, entryProfile: 'intraday' },
    };

    expect(collectProfileWarnings(config)).toEqual([
      'entryProfile intraday with swing timeframes (1d/4h); use 1h/15m recommended',
    ]);
  });

  it('warns when swing profile uses intraday entry timeframes', () => {
    for (const entry of ['15m', '5m', '3m', '1m'] as const) {
      const config: AppConfig = {
        ...baseConfig,
        timeframes: { context: '1h', entry },
        strategy: { ...baseConfig.strategy, entryProfile: 'swing' },
      };

      expect(collectProfileWarnings(config)).toEqual([
        'entryProfile swing with intraday entry TF; use 4h entry recommended',
      ]);
    }
  });

  it('warns intraday recommended when technical triggerMode uses swing entryProfile', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1d', entry: '4h' },
      strategy: { ...baseConfig.strategy, triggerMode: 'technical', entryProfile: 'swing' },
    };

    expect(collectProfileWarnings(config)).toContain(
      'triggerMode technical with entryProfile swing; intraday entryProfile recommended',
    );
  });

  it('warns feeds ignored when technical triggerMode has any feed enabled', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1d', entry: '4h' },
      strategy: { ...baseConfig.strategy, triggerMode: 'technical', entryProfile: 'intraday' },
    };

    expect(collectProfileWarnings(config)).toContain(
      'triggerMode technical: RSS feeds are enabled in config but ignored at runtime',
    );
  });

  it('does not warn feeds ignored for technical when all feeds are disabled', () => {
    const disabledFeeds = baseConfig.feeds.map((f) => ({ ...f, enabled: false }));
    const config: AppConfig = {
      ...baseConfig,
      feeds: disabledFeeds,
      timeframes: { context: '1h', entry: '15m' },
      strategy: { ...baseConfig.strategy, triggerMode: 'technical', entryProfile: 'intraday' },
    };

    expect(
      collectProfileWarnings(config).some((w) => w.includes('RSS feeds') && w.includes('ignored')),
    ).toBe(false);
  });

  it('does not add technical-only warnings when triggerMode is news', () => {
    const config: AppConfig = {
      ...baseConfig,
      timeframes: { context: '1d', entry: '4h' },
      strategy: { ...baseConfig.strategy, triggerMode: 'news', entryProfile: 'swing' },
    };

    const w = collectProfileWarnings(config);
    expect(w.some((x) => x.includes('triggerMode technical'))).toBe(false);
  });

  it('warns feeds active for veto when technical + newsVeto.enabled', () => {
    const config: AppConfig = {
      ...baseConfig,
      strategy: {
        ...baseConfig.strategy,
        triggerMode: 'technical',
        entryProfile: 'intraday',
        newsVeto: { ...baseConfig.strategy.newsVeto, enabled: true },
      },
    };
    expect(collectProfileWarnings(config)).toContain(
      'newsVeto enabled: RSS feeds active for macro veto; trades remain technical',
    );
    expect(
      collectProfileWarnings(config).some((w) => w.includes('RSS feeds') && w.includes('ignored')),
    ).toBe(false);
  });

  it('warns when leaderSymbol not in symbols', () => {
    const config: AppConfig = {
      ...baseConfig,
      symbols: ['ETHUSDT'],
      strategy: {
        ...baseConfig.strategy,
        triggerMode: 'technical',
        newsVeto: {
          ...baseConfig.strategy.newsVeto,
          enabled: true,
          leaderSymbol: 'BTCUSDT',
        },
      },
    };
    expect(collectProfileWarnings(config)).toContain(
      'newsVeto.leaderSymbol BTCUSDT not in symbols; BTC leader rule inactive',
    );
  });

  it('warns when llm.enabled with newsVeto', () => {
    const config: AppConfig = {
      ...baseConfig,
      strategy: {
        ...baseConfig.strategy,
        triggerMode: 'technical',
        newsVeto: { ...baseConfig.strategy.newsVeto, enabled: true },
      },
      sentiment: {
        ...baseConfig.sentiment,
        llm: { ...baseConfig.sentiment.llm, enabled: true },
      },
    };
    expect(collectProfileWarnings(config)).toContain(
      'newsVeto phase 1 expects rule-only sentiment; llm.enabled should be false',
    );
  });
});
