import { describe, it, expect } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { detectSwings, findImpulseLegForEntry, lastImpulseLeg } from '../../src/market/swing-detector.js';

const makeCandle = (index: number, high: number, low: number, close: number): Candle => ({
  symbol: 'BTCUSDT',
  interval: '1h',
  openTime: new Date(Date.UTC(2026, 0, 1, index, 0, 0)),
  closeTime: new Date(Date.UTC(2026, 0, 1, index + 1, 0, 0)),
  open: close,
  high,
  low,
  close,
  volume: 1,
  isClosed: true,
});

describe('swing-detector', () => {
  it('detects alternating swing highs and lows', () => {
    const candles: Candle[] = [];
    const pivots = [
      { high: 12, low: 8, close: 10 },
      { high: 11, low: 9, close: 10 },
      { high: 10, low: 6, close: 8 },
      { high: 11, low: 9, close: 10 },
      { high: 18, low: 14, close: 16 },
      { high: 17, low: 15, close: 16 },
      { high: 16, low: 12, close: 14 },
    ];

    for (let i = 0; i < 25; i++) {
      const pivot = pivots[i % pivots.length]!;
      candles.push(makeCandle(i, pivot.high, pivot.low, pivot.close));
    }

    const swings = detectSwings(candles, 3);
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(swings.some((s) => s.type === 'high')).toBe(true);
    expect(swings.some((s) => s.type === 'low')).toBe(true);
  });

  it('finds impulse leg during active pullback', () => {
    const leg = findImpulseLegForEntry(
      [
        { index: 1, price: 100, type: 'low', time: new Date() },
        { index: 10, price: 120, type: 'high', time: new Date() },
      ],
      'long',
      110,
    );

    expect(leg?.direction).toBe('up');
    expect(leg?.range).toBe(20);
  });

  it('returns last up impulse leg from low-high swings', () => {
    const leg = lastImpulseLeg([
      { index: 1, price: 100, type: 'low', time: new Date() },
      { index: 10, price: 120, type: 'high', time: new Date() },
    ]);

    expect(leg?.direction).toBe('up');
    expect(leg?.range).toBe(20);
  });
});
