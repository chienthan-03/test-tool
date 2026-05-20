import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { Candle } from '../../src/core/types.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  spread = 2,
): Candle => {
  const openTime = new Date(`2026-05-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`);
  return {
    symbol,
    interval,
    openTime,
    closeTime: new Date(openTime.getTime() + 3_600_000),
    open: close - spread * 0.25,
    high: close + spread,
    low: close - spread,
    close,
    volume: 100,
    isClosed: true,
  };
};

const pushTrend = (
  store: KlineStore,
  symbol: string,
  tf: string,
  count: number,
  startClose: number,
  step: number,
  spread = 2,
): void => {
  for (let i = 0; i < count; i++) {
    const close = startClose + step * i;
    store.update(symbol, tf, makeCandle(symbol, tf, i, close, spread));
  }
};

describe('MtfEngine', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('bullish context allows long', () => {
    const store = new KlineStore();
    pushTrend(store, 'BTCUSDT', config.timeframes.context, 60, 100, 2, 3);

    const engine = new MtfEngine(config, store);
    const result = engine.evaluateContext('BTCUSDT', 'long', 0.5);

    expect(result.allow).toBe(true);
  });

  it('bearish blocks long', () => {
    const store = new KlineStore();
    pushTrend(store, 'BTCUSDT', config.timeframes.context, 60, 300, -2, 3);

    const engine = new MtfEngine(config, store);
    const result = engine.evaluateContext('BTCUSDT', 'long', 0.9);

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('mtf_context_conflict');
  });

  it('entry confirm long when conditions met', () => {
    const store = new KlineStore();
    pushTrend(store, 'BTCUSDT', config.timeframes.entry, 30, 100, 1.5, 4);

    const engine = new MtfEngine(config, store);
    const result = engine.evaluateEntry('BTCUSDT', 'long');

    expect(result.confirm).toBe(true);
    expect(result.close).toBeGreaterThan(0);
    expect(result.atr).toBeGreaterThan(0);
  });
});
