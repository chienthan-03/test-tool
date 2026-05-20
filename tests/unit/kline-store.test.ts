import { describe, it, expect, vi } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { KlineStore } from '../../src/market/kline-store.js';

const makeCandle = (index: number, isClosed: boolean): Candle => {
  const openTime = new Date(`2026-05-20T10:${String(index).padStart(2, '0')}:00.000Z`);
  return {
    symbol: 'BTCUSDT',
    interval: '15m',
    openTime,
    closeTime: new Date(openTime.getTime() + 900_000),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 10,
    isClosed,
  };
};

describe('KlineStore', () => {
  it('fires onCandleClose when a candle closes', () => {
    const store = new KlineStore();
    const onClose = vi.fn();
    store.onCandleClose(onClose);

    for (let i = 0; i < 19; i++) {
      store.update('BTCUSDT', '15m', makeCandle(i, false));
    }
    store.update('BTCUSDT', '15m', makeCandle(19, true));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('BTCUSDT', '15m', expect.objectContaining({ isClosed: true }));
  });

  it('getCandles returns full buffer and respects count', () => {
    const store = new KlineStore();

    for (let i = 0; i < 20; i++) {
      store.update('BTCUSDT', '15m', makeCandle(i, i === 19));
    }

    expect(store.getCandles('BTCUSDT', '15m')).toHaveLength(20);
    expect(store.getCandles('BTCUSDT', '15m', 5)).toHaveLength(5);
    expect(store.getCandles('ETHUSDT', '15m')).toHaveLength(0);
  });

  it('updates last candle when openTime matches', () => {
    const store = new KlineStore();
    const forming = makeCandle(0, false);
    store.update('BTCUSDT', '15m', forming);
    store.update('BTCUSDT', '15m', { ...forming, close: 200, isClosed: true });

    const candles = store.getCandles('BTCUSDT', '15m');
    expect(candles).toHaveLength(1);
    expect(candles[0]?.close).toBe(200);
    expect(candles[0]?.isClosed).toBe(true);
  });

  it('getLatestClose and getLatestAtr return latest values', () => {
    const store = new KlineStore();
    for (let i = 0; i < 20; i++) {
      store.update('BTCUSDT', '15m', makeCandle(i, true));
    }

    expect(store.getLatestClose('BTCUSDT', '15m')).toBeCloseTo(100.5 + 19, 5);
    expect(store.getLatestAtr('BTCUSDT', '15m', 14)).toBeGreaterThan(0);
  });
});
