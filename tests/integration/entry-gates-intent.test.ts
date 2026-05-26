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
import { buildContextGate } from '../../src/strategy/context/build-context-gate.js';
import { EntryGate } from '../../src/strategy/entry-gate.js';
import { buildIntradayEntryChain } from '../../src/strategy/entries/intraday-chain.js';
import { buildEntryPathRegistry } from '../../src/strategy/entries/registry.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';
import { PendingSignalStore } from '../../src/strategy/pending-signals.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const profileSwingConfigPath = join(
  projectRoot,
  'config/experiments/profile-swing-baseline.yaml',
);
const profileIntradayConfigPath = join(
  projectRoot,
  'config/experiments/profile-intraday-momentum.yaml',
);

const TF_MS: Record<string, number> = {
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
};

const INTRADAY_ENTRY_PATHS = ['breakout', 'emaMomentum'] as const;

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

const seedTrendCandles = (
  store: KlineStore,
  symbol: string,
  tf: string,
  count: number,
  startClose: number,
  step: number,
  range: number,
): void => {
  const tfMs = TF_MS[tf] ?? 900_000;
  for (let i = 0; i < count; i++) {
    const close = startClose + i * step;
    const openTime = new Date(Date.UTC(2026, 0, 1) + i * tfMs);
    store.update(symbol, tf, {
      symbol,
      interval: tf,
      openTime,
      closeTime: new Date(openTime.getTime() + tfMs),
      open: close,
      high: close + range / 2,
      low: close - range / 2,
      close,
      volume: 100,
      isClosed: true,
    });
  }
};

const seedLongBreakoutCandles = (
  store: KlineStore,
  symbol: string,
  tf: string,
  barCount: number,
  rangeHigh: number,
  breakoutClose: number,
): void => {
  const tfMs = TF_MS[tf] ?? 900_000;
  const rangeLow = rangeHigh - 20;
  for (let i = 0; i < barCount - 1; i++) {
    const close = rangeHigh;
    const openTime = new Date(Date.UTC(2026, 0, 1) + i * tfMs);
    store.update(symbol, tf, {
      symbol,
      interval: tf,
      openTime,
      closeTime: new Date(openTime.getTime() + tfMs),
      open: close,
      high: rangeHigh,
      low: rangeLow,
      close,
      volume: 100,
      isClosed: true,
    });
  }
  const lastIndex = barCount - 1;
  const openTime = new Date(Date.UTC(2026, 0, 1) + lastIndex * tfMs);
  store.update(symbol, tf, {
    symbol,
    interval: tf,
    openTime,
    closeTime: new Date(openTime.getTime() + tfMs),
    open: breakoutClose,
    high: breakoutClose + 10,
    low: breakoutClose - 5,
    close: breakoutClose,
    volume: 100,
    isClosed: true,
  });
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

describe('entry-gates intent integration', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(profileSwingConfigPath);
  });

  it('profile-swing config has merged research settings', () => {
    expect(config.strategy.entryProfile).toBe('swing');
    expect(config.timeframes).toEqual({ context: '1d', entry: '4h' });
    expect(config.entryGates.enabled).toBe(true);
    expect(config.sentiment.llm.enabled).toBe(false);
    expect(config.strategy.fibonacci.zoneTolerancePercent).toBe(0.02);
    expect(config.symbols).toHaveLength(5);
  });

  it('emits strategy:intent and risk:orderPlan through EntryGate path', async () => {
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

    const registry = buildEntryPathRegistry(config, mtf, store);
    const intradayChain = buildIntradayEntryChain(config);
    const contextGate = buildContextGate(config, mtf);
    const entryGate = new EntryGate(
      config,
      mtf,
      registry,
      intradayChain,
      contextGate,
      store,
      bus,
    );
    new StrategyEngine(
      config,
      bus,
      store,
      entryGate,
      pending,
      async () => false,
      () => false,
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
      id: 'swing-signal-1',
      newsId: 'swing-news-1',
      symbols: ['BTCUSDT'],
      direction: 'long',
      strength: 0.9,
      expiresAt: new Date(now.getTime() + 3_600_000),
      source: 'rule',
      createdAt: now,
    };

    bus.emit('news:signal', signal);
    await flushAsyncHandlers();

    const event: CandleCloseEvent = {
      symbol: 'BTCUSDT',
      tf: config.timeframes.entry,
      candle: confirmingCandle,
    };
    bus.emit('market:candleClose', event);
    await flushAsyncHandlers();

    expect(intents.length + plans.length).toBeGreaterThan(0);
    if (intents.length > 0) {
      expect(intents[0]?.side).toBe('BUY');
      expect(intents[0]?.entryPath).toBe('fib');
    }
    if (plans.length > 0) {
      expect(plans[0]?.side).toBe('BUY');
    }
  });

  it('profile-intraday config emits intent with momentum entryPath', async () => {
    const intradayConfig = loadConfig(profileIntradayConfigPath);
    expect(intradayConfig.strategy.entryProfile).toBe('intraday');
    expect(intradayConfig.entryGates.enabled).toBe(true);
    expect(intradayConfig.timeframes).toEqual({ context: '1h', entry: '15m' });

    const store = new KlineStore();
    const bus = new AppEventBus();
    const pending = new PendingSignalStore();
    const mtf = new MtfEngine(intradayConfig, store);
    const symbol = 'BTCUSDT';

    seedTrendCandles(store, symbol, intradayConfig.timeframes.context, 60, 10_000, 50, 80);

    const lookback = intradayConfig.strategy.alternateEntries.breakout.lookbackBars;
    const buffer = intradayConfig.strategy.alternateEntries.breakout.bufferPercent;
    const rangeHigh = 10_000;
    const breakoutClose = rangeHigh * (1 + buffer) + 50;
    seedLongBreakoutCandles(
      store,
      symbol,
      intradayConfig.timeframes.entry,
      lookback + 5,
      rangeHigh,
      breakoutClose,
    );

    const confirmingCandle = makeCandle(
      symbol,
      intradayConfig.timeframes.entry,
      lookback + 10,
      breakoutClose,
      breakoutClose + 10,
      breakoutClose - 5,
      new Date(Date.now() + 900_000),
    );
    store.update(symbol, intradayConfig.timeframes.entry, confirmingCandle);

    const intents: TradeIntent[] = [];
    const plans: OrderPlan[] = [];
    bus.on('strategy:intent', (intent) => {
      intents.push(intent);
    });
    bus.on('risk:orderPlan', (plan) => {
      plans.push(plan);
    });

    const registry = buildEntryPathRegistry(intradayConfig, mtf, store);
    const intradayChain = buildIntradayEntryChain(intradayConfig);
    const contextGate = buildContextGate(intradayConfig, mtf);
    const entryGate = new EntryGate(
      intradayConfig,
      mtf,
      registry,
      intradayChain,
      contextGate,
      store,
      bus,
    );
    new StrategyEngine(
      intradayConfig,
      bus,
      store,
      entryGate,
      pending,
      async () => false,
      () => false,
      () => false,
    );

    new RiskEngine(
      intradayConfig,
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
      id: 'intraday-signal-1',
      newsId: 'intraday-news-1',
      symbols: [symbol],
      direction: 'long',
      strength: 0.9,
      expiresAt: new Date(now.getTime() + 3_600_000),
      source: 'rule',
      createdAt: now,
    };

    bus.emit('news:signal', signal);
    await flushAsyncHandlers();

    bus.emit('market:candleClose', {
      symbol,
      tf: intradayConfig.timeframes.entry,
      candle: confirmingCandle,
    });
    await flushAsyncHandlers();

    expect(intents.length + plans.length).toBeGreaterThan(0);
    if (intents.length > 0) {
      expect(intents[0]?.side).toBe('BUY');
      expect(INTRADAY_ENTRY_PATHS).toContain(intents[0]?.entryPath);
      expect(intents[0]?.entryPath).not.toBe('fib');
    }
  });
});
