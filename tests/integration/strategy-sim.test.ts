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
  '15m': 900_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  spread = 2,
  closeTimeOverride?: Date,
): Candle => {
  const tfMs = TF_MS[interval] ?? 900_000;
  const openTime = new Date(Date.UTC(2026, 4, 1, index % 24, (index * 15) % 60, 0));
  const closeTime =
    closeTimeOverride ?? new Date(openTime.getTime() + tfMs);
  return {
    symbol,
    interval,
    openTime,
    closeTime,
    open: close - spread * 0.25,
    high: close + spread,
    low: close - spread,
    close,
    volume: 100,
    isClosed: true,
  };
};

/** Push ascending close prices to build a bullish EMA trend. */
const pushAscendingTrend = (
  store: KlineStore,
  symbol: string,
  tf: string,
  count: number,
  startClose: number,
  step: number,
  spread = 2,
): Candle => {
  let last: Candle = makeCandle(symbol, tf, 0, startClose, spread);
  for (let i = 0; i < count; i++) {
    const close = startClose + step * i;
    last = makeCandle(symbol, tf, i, close, spread);
    store.update(symbol, tf, last);
  }
  return last;
};

const flushAsyncHandlers = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('strategy-sim integration', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('emits strategy:intent or risk:orderPlan BUY on aligned signal and 15m close', async () => {
    const store = new KlineStore();
    const bus = new AppEventBus();
    const pending = new PendingSignalStore();
    const mtf = new MtfEngine(config, store);

    pushAscendingTrend(
      store,
      'BTCUSDT',
      config.timeframes.context,
      65,
      100,
      2,
      3,
    );
    pushAscendingTrend(
      store,
      'BTCUSDT',
      config.timeframes.entry,
      35,
      100,
      1.5,
      4,
    );

    const confirmingClose = 100 + 1.5 * 34 + 2;
    const confirmingCandle = makeCandle(
      'BTCUSDT',
      config.timeframes.entry,
      35,
      confirmingClose,
      4,
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
      expect(intents[0]?.symbol).toBe('BTCUSDT');
      expect(intents[0]?.side).toBe('BUY');
    }
    if (sawPlan) {
      expect(plans[0]?.symbol).toBe('BTCUSDT');
      expect(plans[0]?.side).toBe('BUY');
      expect(plans[0]?.quantity).toBeGreaterThan(0);
    }
  });
});
