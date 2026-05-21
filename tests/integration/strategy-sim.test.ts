import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import type {
  Candle,
  CandleCloseEvent,
  NewsSignal,
  OrderPlan,
  TradeIntent,
} from '../../src/core/types.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { RiskEngine } from '../../src/risk/risk-engine.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';
import { PendingSignalStore } from '../../src/strategy/pending-signals.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const TF_MS: Record<string, number> = {
  '1h': 3_600_000,
  '4h': 14_400_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  high: number,
  low: number,
  closeTimeOverride?: Date,
): Candle => {
  const tfMs = TF_MS[interval] ?? 3_600_000;
  const openTime = new Date(Date.UTC(2026, 0, 1, index % 24, 0, 0));
  return {
    symbol,
    interval,
    openTime,
    closeTime: closeTimeOverride ?? new Date(openTime.getTime() + tfMs),
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

const flushAsyncHandlers = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('strategy-sim integration', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('emits strategy:intent or risk:orderPlan BUY on elliott+fib aligned signal', async () => {
    const store = new KlineStore();
    const bus = new AppEventBus();
    const pending = new PendingSignalStore();
    const mtf = new MtfEngine(config, store);

    pushZigzagPivots(
      store,
      'BTCUSDT',
      config.timeframes.context,
      bullishImpulsePivots(),
      9,
    );
    pushZigzagPivots(
      store,
      'BTCUSDT',
      config.timeframes.entry,
      bullishImpulsePivots().slice(0, 4),
      9,
    );

    const retraceClose = 111;
    const confirmingCandle = makeCandle(
      'BTCUSDT',
      config.timeframes.entry,
      999,
      retraceClose,
      retraceClose + 1.5,
      retraceClose - 1.5,
      new Date(Date.now() + 3_600_000),
    );
    store.update('BTCUSDT', config.timeframes.entry, confirmingCandle);

    const intents: TradeIntent[] = [];
    const plans: OrderPlan[] = [];
    bus.on('strategy:intent', (intent) => {
      intents.push(intent);
    });
    bus.on('risk:orderPlan', (plan) => {
      plans.push(plan);
    });

    new StrategyEngine(
      config,
      bus,
      store,
      mtf,
      pending,
      async () => false,
      () => false,
    );

    new RiskEngine(
      config,
      bus,
      async () => ({ available: 10_000, total: 10_000 }),
      async () => ({
        stepSize: 0.001,
        minQty: 0.001,
        tickSize: 0.1,
      }),
    );

    const now = new Date();
    const signal: NewsSignal = {
      id: 'test-signal-1',
      newsId: 'test-news-1',
      symbols: ['BTCUSDT'],
      direction: 'long',
      strength: 0.9,
      expiresAt: new Date(now.getTime() + 3_600_000),
      source: 'rule',
      createdAt: now,
    };

    bus.emit('news:signal', signal);
    await flushAsyncHandlers();

    const candleCloseEvent: CandleCloseEvent = {
      symbol: 'BTCUSDT',
      tf: config.timeframes.entry,
      candle: confirmingCandle,
    };
    bus.emit('market:candleClose', candleCloseEvent);
    await flushAsyncHandlers();

    const sawIntent = intents.some((i) => i.side === 'BUY' && i.symbol === 'BTCUSDT');
    const sawPlan = plans.some((p) => p.side === 'BUY' && p.symbol === 'BTCUSDT');

    expect(sawIntent || sawPlan).toBe(true);
    if (sawIntent) {
      expect(intents[0]?.stopLoss).toBeDefined();
      expect(intents[0]?.takeProfit).toBeDefined();
    }
  });
});
