import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import type { Candle, CandleCloseEvent, TradeIntent } from '../../src/core/types.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { buildContextGate } from '../../src/strategy/context/build-context-gate.js';
import { EntryGate } from '../../src/strategy/entry-gate.js';
import { buildIntradayEntryChain } from '../../src/strategy/entries/intraday-chain.js';
import { buildEntryPathRegistry } from '../../src/strategy/entries/registry.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';
import { PendingSignalStore } from '../../src/strategy/pending-signals.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const profileIntradayConfigPath = join(
  projectRoot,
  'config/experiments/profile-intraday-momentum.yaml',
);

const TF_MS: Record<string, number> = {
  '5m': 300_000,
  '15m': 900_000,
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
  const tfMs = TF_MS[interval] ?? 900_000;
  const openTime = new Date(Date.UTC(2026, 0, 1) + index * tfMs);
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

const flushAsyncHandlers = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('StrategyEngine technical triggerMode', () => {
  let profileConfig: AppConfig;

  beforeAll(() => {
    profileConfig = loadConfig(profileIntradayConfigPath);
  });

  it('emits strategy:intent with newsId technical on entry candle close', async () => {
    const config: AppConfig = {
      ...profileConfig,
      symbols: ['BTCUSDT'],
      timeframes: { context: '15m', entry: '5m' },
      strategy: {
        ...profileConfig.strategy,
        triggerMode: 'technical',
        entryProfile: 'intraday',
      },
    };

    const store = new KlineStore();
    const bus = new AppEventBus();
    const pending = new PendingSignalStore();
    const mtf = new MtfEngine(config, store);
    const symbol = 'BTCUSDT';

    seedTrendCandles(store, symbol, config.timeframes.context, 60, 10_000, 50, 80);

    const lookback = config.strategy.alternateEntries.breakout.lookbackBars;
    const buffer = config.strategy.alternateEntries.breakout.bufferPercent;
    const rangeHigh = 10_000;
    const breakoutClose = rangeHigh * (1 + buffer) + 50;
    seedLongBreakoutCandles(
      store,
      symbol,
      config.timeframes.entry,
      lookback + 5,
      rangeHigh,
      breakoutClose,
    );

    const confirmingCandle = makeCandle(
      symbol,
      config.timeframes.entry,
      lookback + 10,
      breakoutClose,
      breakoutClose + 10,
      breakoutClose - 5,
      new Date(Date.now() + 300_000),
    );
    store.update(symbol, config.timeframes.entry, confirmingCandle);

    const intents: TradeIntent[] = [];
    bus.on('strategy:intent', (intent) => {
      intents.push(intent);
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

    const fixedNow = new Date('2026-01-15T12:00:00.000Z');
    new StrategyEngine(
      config,
      bus,
      store,
      entryGate,
      pending,
      async () => false,
      () => false,
      () => false,
      () => fixedNow,
    );

    const event: CandleCloseEvent = {
      symbol,
      tf: config.timeframes.entry,
      candle: confirmingCandle,
    };
    bus.emit('market:candleClose', event);
    await flushAsyncHandlers();

    expect(intents.length).toBeGreaterThan(0);
    const intent = intents[0];
    expect(intent?.newsId).toBe('technical');
    expect(intent?.symbol).toBe(symbol);
    expect(intent?.newsSignalId.startsWith(`technical-${symbol}-`)).toBe(true);
  });
});
