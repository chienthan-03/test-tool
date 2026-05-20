import { describe, it, expect, beforeEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { SimBroker } from '../../src/execution/sim-broker.js';
import type { Candle, OrderPlan } from '../../src/core/types.js';
import type { AppConfig } from '../../src/config/schema.js';

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../config/default.yaml');

const makeCandle = (
  symbol: string,
  high: number,
  low: number,
  close: number,
): Candle => ({
  symbol,
  interval: '15m',
  openTime: new Date('2026-01-01T00:00:00Z'),
  closeTime: new Date('2026-01-01T00:15:00Z'),
  open: close,
  high,
  low,
  close,
  volume: 100,
  isClosed: true,
});

describe('SimBroker', () => {
  let broker: SimBroker;
  let config: AppConfig;

  beforeEach(async () => {
    config = loadConfig(CONFIG_PATH);
    broker = new SimBroker(config);
    await broker.connect();
  });

  const openLong = async (entryPrice: number, sl: number, tp: number) => {
    broker.onPriceUpdate('BTCUSDT', makeCandle('BTCUSDT', entryPrice, entryPrice, entryPrice));

    const plan: OrderPlan = {
      intentId: 'intent-1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.1,
      entryType: 'MARKET',
      stopLoss: sl,
      takeProfit: tp,
      notionalUsdt: entryPrice * 0.1,
    };

    await broker.placeEntry(plan);
    await broker.placeStopLoss('BTCUSDT', 'SELL', sl, 0.1);
    await broker.placeTakeProfit('BTCUSDT', 'SELL', tp, 0.1);
  };

  it('open and close long TP increases balance', async () => {
    const entry = 100;
    const sl = 95;
    const tp = 110;
    const balanceBefore = (await broker.getBalance()).available;

    await openLong(entry, sl, tp);

    broker.checkIntrabar(makeCandle('BTCUSDT', tp + 1, entry, tp));

    const balanceAfter = (await broker.getBalance()).available;
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
    expect(await broker.getPosition('BTCUSDT')).toBeNull();
  });

  it('SL hit closes long at loss', async () => {
    const entry = 100;
    const sl = 95;
    const tp = 110;
    const balanceBefore = (await broker.getBalance()).available;

    await openLong(entry, sl, tp);

    broker.checkIntrabar(makeCandle('BTCUSDT', entry, sl - 1, sl));

    const balanceAfter = (await broker.getBalance()).available;
    expect(balanceAfter).toBeLessThan(balanceBefore);
    expect(await broker.getPosition('BTCUSDT')).toBeNull();
  });
});
