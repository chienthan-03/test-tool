import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { BreakoutEntryEvaluator } from '../../src/strategy/entries/breakout-entry.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const TF_MS: Record<string, number> = {
  '4h': 14_400_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  high: number,
  low: number,
): Candle => {
  const tfMs = TF_MS[interval] ?? 14_400_000;
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

/** Flat range then final bar closing above rangeHigh * (1 + buffer). */
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

describe('BreakoutEntryEvaluator', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('confirms long breakout with stop below entry and take profit above', () => {
    const symbol = 'BTCUSDT';
    const tf = config.timeframes.entry;
    const lookback = config.strategy.alternateEntries.breakout.lookbackBars;
    const buffer = config.strategy.alternateEntries.breakout.bufferPercent;
    const rangeHigh = 10_000;
    const breakoutClose = rangeHigh * (1 + buffer) + 50;

    const store = new KlineStore();
    seedLongBreakoutCandles(store, symbol, tf, 25, rangeHigh, breakoutClose);

    const evaluator = new BreakoutEntryEvaluator();
    const result = evaluator.evaluate({
      symbol,
      direction: 'long',
      strength: 0.8,
      config,
      store,
    });

    expect(result.confirm).toBe(true);
    expect(result.close).toBe(breakoutClose);
    expect(result.atr).toBeGreaterThan(0);
    expect(result.stopLoss).toBeDefined();
    expect(result.takeProfit).toBeDefined();
    expect(result.stopLoss!).toBeLessThan(result.close);
    expect(result.takeProfit!).toBeGreaterThan(result.close);

    const rangeCandles = store.getCandles(symbol, tf).slice(-(lookback + 1), -1);
    const priorRangeHigh = Math.max(...rangeCandles.map((c) => c.high));
    expect(priorRangeHigh).toBe(rangeHigh);
    expect(breakoutClose).toBeGreaterThan(priorRangeHigh * (1 + buffer));
  });
});
