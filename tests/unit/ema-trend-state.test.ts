import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { computeEmaTrendState } from '../../src/strategy/context/ema-trend-state.js';

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

describe('computeEmaTrendState', () => {
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

  it('returns uptrend with direction long when closes rise', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 50, 80);
    const config = buildConfig();

    const state = computeEmaTrendState(symbol, store, config);

    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.direction).toBe('long');
      expect(state.isFlat).toBe(false);
      expect(state.fast).toBeGreaterThan(state.slow);
    }
  });

  it('returns downtrend with direction short when closes fall', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 12_000, -50, 80);
    const config = buildConfig();

    const state = computeEmaTrendState(symbol, store, config);

    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.direction).toBe('short');
      expect(state.isFlat).toBe(false);
      expect(state.fast).toBeLessThan(state.slow);
    }
  });

  it('returns ema_context_flat when EMAs converge', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 0, 1);
    const config = buildConfig();

    const state = computeEmaTrendState(symbol, store, config);

    expect(state).toEqual({ ok: false, reason: 'ema_context_flat' });
  });

  it('returns ema_context_insufficient_data when bars are too few', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 10, 10_000, 50, 80);
    const config = buildConfig();

    const state = computeEmaTrendState(symbol, store, config);

    expect(state).toEqual({ ok: false, reason: 'ema_context_insufficient_data' });
  });
});
