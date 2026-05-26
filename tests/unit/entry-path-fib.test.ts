import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { FibEntryEvaluator } from '../../src/strategy/entries/fib-entry.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';

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
  const tfMs = TF_MS[interval] ?? 3_600_000;
  const openTime = new Date(Date.UTC(2026, 0, 1, index % 24, 0, 0));
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

const pushZigzagPivots = (
  store: KlineStore,
  symbol: string,
  tf: string,
  pivots: Array<{ price: number; type: 'high' | 'low' }>,
  barsBetween = 9,
): void => {
  let index = 0;
  for (const pivot of pivots) {
    for (let b = 0; b < barsBetween; b++) {
      const isPivot = b === Math.floor(barsBetween / 2);
      const spread = 0.6;
      let high = pivot.price + spread;
      let low = pivot.price - spread;
      let close = pivot.price;

      if (isPivot && pivot.type === 'high') {
        high = pivot.price + spread * 2;
        low = pivot.price - spread * 0.4;
        close = pivot.price + spread * 1.5;
      } else if (isPivot && pivot.type === 'low') {
        low = pivot.price - spread * 2;
        high = pivot.price + spread * 0.4;
        close = pivot.price - spread * 1.5;
      }

      store.update(symbol, tf, makeCandle(symbol, tf, index, close, high, low));
      index += 1;
    }
  }
};

const bullishImpulsePivots = (): Array<{ price: number; type: 'high' | 'low' }> => [
  { price: 100, type: 'low' },
  { price: 108, type: 'high' },
  { price: 104, type: 'low' },
  { price: 118, type: 'high' },
  { price: 110, type: 'low' },
];

const seedEntryFibStore = (store: KlineStore, config: AppConfig, latestClose: number): void => {
  pushZigzagPivots(
    store,
    'BTCUSDT',
    config.timeframes.entry,
    bullishImpulsePivots().slice(0, 4),
    9,
  );
  const tf = config.timeframes.entry;
  store.update(
    'BTCUSDT',
    tf,
    makeCandle('BTCUSDT', tf, 999, latestClose, latestClose + 1.5, latestClose - 1.5),
  );
};

describe('FibEntryEvaluator', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('delegates to MtfEngine and confirms in fib retrace zone', () => {
    const store = new KlineStore();
    seedEntryFibStore(store, config, 111);

    const mtf = new MtfEngine(config, store);
    const evaluator = new FibEntryEvaluator(mtf);
    const result = evaluator.evaluate({
      symbol: 'BTCUSDT',
      direction: 'long',
      strength: 0.5,
      config,
      store,
    });

    expect(result.confirm).toBe(true);
    expect(result.stopLoss).toBeDefined();
    expect(result.takeProfit).toBeDefined();
    expect(result.close).toBe(111);
    expect(result.atr).toBeGreaterThan(0);
  });

  it('returns outside_fib_zone when price is outside retrace zone', () => {
    const store = new KlineStore();
    seedEntryFibStore(store, config, 100);

    const mtf = new MtfEngine(config, store);
    const evaluator = new FibEntryEvaluator(mtf);
    const result = evaluator.evaluate({
      symbol: 'BTCUSDT',
      direction: 'long',
      strength: 0.5,
      config,
      store,
    });

    expect(result.confirm).toBe(false);
    expect(result.reason).toBe('outside_fib_zone');
    expect(result.close).toBe(100);
  });
});
