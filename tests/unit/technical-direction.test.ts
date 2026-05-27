import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { resolveEmaContextDirection } from '../../src/strategy/technical-direction.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const TF_MS: Record<string, number> = {
  '1h': 3_600_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  range: number,
): Candle => {
  const tfMs = TF_MS[interval] ?? 3_600_000;
  const openTime = new Date(Date.UTC(2026, 0, 1, index % 24, 0, 0));
  return {
    symbol,
    interval,
    openTime,
    closeTime: new Date(openTime.getTime() + tfMs),
    open: close,
    high: close + range / 2,
    low: close - range / 2,
    close,
    volume: 100,
    isClosed: true,
  };
};

const seedTrendCandles = (
  store: KlineStore,
  symbol: string,
  tf: string,
  count: number,
  startClose: number,
  step: number,
  range: number,
): void => {
  for (let i = 0; i < count; i++) {
    const close = startClose + i * step;
    store.update(symbol, tf, makeCandle(symbol, tf, i, close, range));
  }
};

describe('resolveEmaContextDirection', () => {
  let baseConfig: AppConfig;
  const symbol = 'BTCUSDT';
  const contextTf = '1h';

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  const buildConfig = (
    overrides?: Partial<AppConfig['strategy']['profiles']['intraday']['contextEma']>,
  ): AppConfig => ({
    ...baseConfig,
    timeframes: { context: contextTf, entry: '15m' },
    strategy: {
      ...baseConfig.strategy,
      entryProfile: 'intraday',
      profiles: {
        ...baseConfig.strategy.profiles,
        intraday: {
          ...baseConfig.strategy.profiles.intraday,
          contextEma: {
            ...baseConfig.strategy.profiles.intraday.contextEma,
            ...overrides,
          },
        },
      },
    },
  });

  it('returns long when closes rise (aligned with computeEmaTrendState uptrend)', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 50, 80);
    const config = buildConfig();

    expect(resolveEmaContextDirection(symbol, store, config)).toBe('long');
  });

  it('returns short when closes fall (aligned with computeEmaTrendState downtrend)', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 12_000, -50, 80);
    const config = buildConfig();

    expect(resolveEmaContextDirection(symbol, store, config)).toBe('short');
  });

  it('returns null when EMAs converge (ema_context_flat)', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 0, 1);
    const config = buildConfig();

    expect(resolveEmaContextDirection(symbol, store, config)).toBeNull();
  });

  it('returns null when bars are too few (ema_context_insufficient_data)', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 10, 10_000, 50, 80);
    const config = buildConfig();

    expect(resolveEmaContextDirection(symbol, store, config)).toBeNull();
  });
});
