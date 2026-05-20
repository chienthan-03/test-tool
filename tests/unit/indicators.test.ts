import { describe, it, expect } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { atr, ema, emaSlopeUp, sma } from '../../src/market/indicators.js';

const makeCandle = (params: {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}): Candle => ({
  symbol: 'BTCUSDT',
  interval: '15m',
  openTime: new Date(params.openTime),
  closeTime: new Date(params.openTime + 60_000),
  open: params.open,
  high: params.high,
  low: params.low,
  close: params.close,
  volume: 1,
  isClosed: true,
});

describe('indicators', () => {
  it('sma returns average of last period values', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2], 3)).toBeNull();
  });

  it('ema last value matches known snapshot (period 3)', () => {
    const closes = [10, 10.5, 11, 11.5, 12];
    const series = ema(closes, 3);
    const lastEma = series[series.length - 1];

    expect(lastEma).toBeCloseTo(11.5, 5);
    expect(series[2]).toBeCloseTo(10.5, 5);
    expect(series[3]).toBeCloseTo(11, 5);
  });

  it('atr matches manual 3-candle Wilder calculation (period 2)', () => {
    const candles: Candle[] = [
      makeCandle({ openTime: 0, open: 100, high: 105, low: 99, close: 103 }),
      makeCandle({ openTime: 1, open: 103, high: 108, low: 102, close: 106 }),
      makeCandle({ openTime: 2, open: 106, high: 110, low: 104, close: 108 }),
    ];

    const series = atr(candles, 2);
    expect(series[1]).toBeCloseTo(6, 5);
    expect(series[2]).toBeCloseTo(6, 5);
  });

  it('emaSlopeUp is true on rising EMA series', () => {
    const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(emaSlopeUp(rising, 3)).toBe(true);
  });
});
