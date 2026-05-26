import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { EmaTrendContextGate } from '../../src/strategy/context/ema-trend-context-gate.js';
import type { EntryEvalContext } from '../../src/strategy/entries/types.js';

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

describe('EmaTrendContextGate', () => {
  let baseConfig: AppConfig;
  const gate = new EmaTrendContextGate();
  const symbol = 'BTCUSDT';
  const contextTf = '1h';

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  const buildConfig = (overrides?: Partial<AppConfig['strategy']['profiles']['intraday']['contextEma']>): AppConfig => ({
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

  const buildCtx = (
    store: KlineStore,
    direction: 'long' | 'short',
    strength = 0.5,
    config = buildConfig(),
  ): EntryEvalContext => ({
    symbol,
    direction,
    strength,
    config,
    store,
  });

  const evaluate = (
    store: KlineStore,
    direction: 'long' | 'short',
    strength = 0.5,
    config = buildConfig(),
  ) => gate.evaluate(symbol, direction, strength, buildCtx(store, direction, strength, config));

  it('allows long when fast EMA is above slow on rising closes', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 50, 80);

    const result = evaluate(store, 'long');

    expect(result).toEqual({ allow: true });
  });

  it('allows short when fast EMA is below slow on falling closes', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 12_000, -50, 80);

    const result = evaluate(store, 'short');

    expect(result).toEqual({ allow: true });
  });

  it('rejects long with ema_context_conflict when trend is bearish', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 12_000, -50, 80);

    const result = evaluate(store, 'long');

    expect(result).toEqual({ allow: false, reason: 'ema_context_conflict' });
  });

  it('rejects with ema_context_flat when EMAs converge and strength is weak', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 0, 1);

    const result = evaluate(store, 'long', 0.5);

    expect(result).toEqual({ allow: false, reason: 'ema_context_flat' });
  });

  it('allows flat EMA when strength meets strongNewsThreshold', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 60, 10_000, 0, 1);
    const strongThreshold = baseConfig.sentiment.rules.strongNewsThreshold;

    const result = evaluate(store, 'long', strongThreshold);

    expect(result).toEqual({ allow: true });
  });

  it('rejects with ema_context_insufficient_data when bars are too few', () => {
    const store = new KlineStore();
    seedTrendCandles(store, symbol, contextTf, 10, 10_000, 50, 80);

    const result = evaluate(store, 'long');

    expect(result).toEqual({ allow: false, reason: 'ema_context_insufficient_data' });
  });
});
