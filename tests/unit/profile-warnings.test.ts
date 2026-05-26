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
});
