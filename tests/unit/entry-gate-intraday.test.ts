import { describe, it, expect, beforeAll, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { buildContextGate } from '../../src/strategy/context/build-context-gate.js';
import { buildIntradayEntryChain } from '../../src/strategy/entries/intraday-chain.js';
import { buildEntryPathRegistry } from '../../src/strategy/entries/registry.js';
import { EntryGate } from '../../src/strategy/entry-gate.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const TF_MS: Record<string, number> = {
  '1h': 3_600_000,
  '15m': 900_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  high: number,
  low: number,
): Candle => {
  const tfMs = TF_MS[interval] ?? 900_000;
  const openTime = new Date(Date.UTC(2026, 0, 1) + index * tfMs);
  return {
    symbol,
    interval,
    openTime,
    closeTime: new Date(openTime.getTime() + tfMs),
    open: close,
    high,
    low,
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
    store.update(
      symbol,
      tf,
      makeCandle(symbol, tf, i, close, close + range / 2, close - range / 2),
    );
  }
};

const seedLongBreakoutCandles = (
  store: KlineStore,
  symbol: string,
  tf: string,
  barCount: number,
  rangeHigh: number,
  breakoutClose: number,
): void => {
  const rangeLow = rangeHigh - 20;
  for (let i = 0; i < barCount - 1; i++) {
    store.update(
      symbol,
      tf,
      makeCandle(symbol, tf, i, rangeHigh, rangeHigh, rangeLow),
    );
  }
  const lastIndex = barCount - 1;
  store.update(
    symbol,
    tf,
    makeCandle(
      symbol,
      tf,
      lastIndex,
      breakoutClose,
      breakoutClose + 10,
      breakoutClose - 5,
    ),
  );
};

describe('EntryGate intraday profile', () => {
  let baseConfig: AppConfig;
  const symbol = 'BTCUSDT';

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  const buildIntradayConfig = (): AppConfig => ({
    ...baseConfig,
    entryGates: { ...baseConfig.entryGates, enabled: true },
    timeframes: { context: '1h', entry: '15m' },
    strategy: {
      ...baseConfig.strategy,
      entryProfile: 'intraday',
    },
  });

  const createIntradayGate = (cfg: AppConfig, store: KlineStore): EntryGate => {
    const mtf = new MtfEngine(cfg, store);
    const registry = buildEntryPathRegistry(cfg, mtf, store);
    const intradayChain = buildIntradayEntryChain(cfg);
    const contextGate = buildContextGate(cfg, mtf);
    return new EntryGate(cfg, mtf, registry, intradayChain, contextGate, store);
  };

  it('confirms breakout on bullish EMA context without calling fib', () => {
    const config = buildIntradayConfig();
    const store = new KlineStore();
    seedTrendCandles(store, symbol, config.timeframes.context, 60, 10_000, 50, 80);

    const lookback = config.strategy.alternateEntries.breakout.lookbackBars;
    const buffer = config.strategy.alternateEntries.breakout.bufferPercent;
    const rangeHigh = 10_000;
    const breakoutClose = rangeHigh * (1 + buffer) + 50;
    seedLongBreakoutCandles(store, symbol, config.timeframes.entry, lookback + 5, rangeHigh, breakoutClose);

    const mtf = new MtfEngine(config, store);
    const registry = buildEntryPathRegistry(config, mtf, store);
    const fibEvaluate = vi.spyOn(registry.primary, 'evaluate');
    const intradayChain = buildIntradayEntryChain(config);
    const contextGate = buildContextGate(config, mtf);
    const gate = new EntryGate(config, mtf, registry, intradayChain, contextGate, store);

    const result = gate.evaluate(symbol, 'long', 0.5);

    expect(result.allow).toBe(true);
    expect(result.entryPath).toBe('breakout');
    expect(result.entry?.confirm).toBe(true);
    expect(fibEvaluate).not.toHaveBeenCalled();
  });

  it('skips context when entryGates.enabled is false and still uses intraday chain', () => {
    const config: AppConfig = {
      ...buildIntradayConfig(),
      entryGates: { enabled: false, logRejects: false },
    };
    const store = new KlineStore();
    seedTrendCandles(store, symbol, config.timeframes.context, 60, 10_000, -50, 80);

    const lookback = config.strategy.alternateEntries.breakout.lookbackBars;
    const buffer = config.strategy.alternateEntries.breakout.bufferPercent;
    const rangeHigh = 10_000;
    const breakoutClose = rangeHigh * (1 + buffer) + 50;
    seedLongBreakoutCandles(store, symbol, config.timeframes.entry, lookback + 5, rangeHigh, breakoutClose);

    const gate = createIntradayGate(config, store);
    const result = gate.evaluate(symbol, 'long', 0.5);

    expect(result.allow).toBe(true);
    expect(result.entryPath).toBe('breakout');
    expect(result.stage).toBeUndefined();
  });

  it('returns intraday_no_entry_path when chain finds no confirm', () => {
    const config = buildIntradayConfig();
    const store = new KlineStore();
    seedTrendCandles(store, symbol, config.timeframes.context, 60, 10_000, 50, 80);

    const gate = createIntradayGate(config, store);
    const result = gate.evaluate(symbol, 'long', 0.5);

    expect(result.allow).toBe(false);
    expect(result.stage).toBe('entry');
    expect(result.reason).toBe('intraday_no_entry_path');
  });
});
