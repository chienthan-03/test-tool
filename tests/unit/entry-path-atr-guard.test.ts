import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import { atr, last } from '../../src/market/indicators.js';
import { checkEntryAtrBounds } from '../../src/strategy/entries/atr-guard.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const makeCandle = (openTime: number, close: number, range: number): Candle => ({
  symbol: 'BTCUSDT',
  interval: '15m',
  openTime: new Date(openTime),
  closeTime: new Date(openTime + 60_000),
  open: close,
  high: close + range / 2,
  low: close - range / 2,
  close,
  volume: 1,
  isClosed: true,
});

describe('checkEntryAtrBounds', () => {
  it('returns atr_below_minimum when atrPercent is below minAtrPercent', () => {
    const config = loadConfig(defaultConfigPath);
    const close = 10_000;
    const range = 5;
    const barCount = config.strategy.atrPeriod + 6;
    const candles: Candle[] = Array.from({ length: barCount }, (_, i) =>
      makeCandle(i * 60_000, close, range),
    );

    const latestAtr = last(atr(candles, config.strategy.atrPeriod))!;
    const atrPercent = (latestAtr / close) * 100;
    expect(atrPercent).toBeCloseTo(0.05, 2);
    expect(atrPercent).toBeLessThan(config.strategy.minAtrPercent);

    const result = checkEntryAtrBounds(candles, config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('atr_below_minimum');
      expect(result.close).toBe(close);
      expect(result.atr).toBe(latestAtr);
    }
  });
});
