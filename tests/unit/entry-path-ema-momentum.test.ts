import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { calcSlTp } from '../../src/risk/sl-tp-calculator.js';
import { EmaMomentumEntryEvaluator } from '../../src/strategy/entries/ema-momentum-entry.js';
import type { EntryEvalContext } from '../../src/strategy/entries/types.js';

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

describe('EmaMomentumEntryEvaluator', () => {
  let config: AppConfig;
  const evaluator = new EmaMomentumEntryEvaluator();
  const symbol = 'BTCUSDT';

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  const buildCtx = (store: KlineStore, direction: 'long' | 'short'): EntryEvalContext => ({
    symbol,
    direction,
    strength: 1,
    config,
    store,
  });

  it('confirms long when fast EMA is above slow on rising closes', () => {
    const store = new KlineStore();
    const tf = config.timeframes.entry;
    seedTrendCandles(store, symbol, tf, 40, 10_000, 25, 80);

    const result = evaluator.evaluate(buildCtx(store, 'long'));

    expect(result.confirm).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.close).toBeGreaterThan(0);
    expect(result.atr).toBeGreaterThan(0);

    const { stopLoss, takeProfit } = calcSlTp({
      side: 'BUY',
      entryPrice: result.close,
      atr: result.atr,
      slMult: config.risk.slAtrMultiplier,
      tpMult: config.risk.tpAtrMultiplier,
    });
    expect(result.stopLoss).toBe(stopLoss);
    expect(result.takeProfit).toBe(takeProfit);
    expect(result.stopLoss!).toBeLessThan(result.close);
    expect(result.takeProfit!).toBeGreaterThan(result.close);
  });

  it('rejects long with ema_not_aligned when fast EMA is below slow', () => {
    const store = new KlineStore();
    const tf = config.timeframes.entry;
    seedTrendCandles(store, symbol, tf, 40, 12_000, -25, 80);

    const result = evaluator.evaluate(buildCtx(store, 'long'));

    expect(result.confirm).toBe(false);
    expect(result.reason).toBe('ema_not_aligned');
    expect(result.stopLoss).toBeUndefined();
    expect(result.takeProfit).toBeUndefined();
  });
});
