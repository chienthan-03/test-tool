import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { ema } from '../../src/market/indicators.js';
import { KlineStore } from '../../src/market/kline-store.js';

type FixtureCandle = Omit<Candle, 'openTime' | 'closeTime'> & {
  openTime: string;
  closeTime: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../fixtures/klines/btcusdt_15m_sample.json');

const loadFixture = (): Candle[] => {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureCandle[];
  return raw.map((row) => ({
    ...row,
    openTime: new Date(row.openTime),
    closeTime: new Date(row.closeTime),
  }));
};

describe('KlineStore fixture', () => {
  it('loads btcusdt_15m_sample.json and computes ATR and EMA', () => {
    const candles = loadFixture();
    expect(candles).toHaveLength(100);
    expect(candles.every((c) => c.isClosed)).toBe(true);
    expect(candles.every((c) => typeof c.close === 'number' && !Number.isNaN(c.close))).toBe(true);

    const store = new KlineStore();
    for (const candle of candles) {
      store.update('BTCUSDT', '15m', candle);
    }

    const atr = store.getLatestAtr('BTCUSDT', '15m', 14);
    expect(atr).toBeDefined();
    expect(atr).toBeGreaterThan(0);

    const closes = store.getCandles('BTCUSDT', '15m').map((c) => c.close);
    const emaSeries = ema(closes, 20);
    const lastEma = emaSeries[emaSeries.length - 1];
    expect(lastEma).toBeDefined();
    expect(Number.isNaN(lastEma)).toBe(false);
    expect(lastEma).toBeGreaterThan(0);
  });
});
