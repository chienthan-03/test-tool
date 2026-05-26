import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../src/core/types.js';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { isInRetraceZone } from '../../src/market/fibonacci.js';
import type { ImpulseLeg } from '../../src/market/swing-detector.js';
import { buildContextGate } from '../../src/strategy/context/build-context-gate.js';
import { buildIntradayEntryChain } from '../../src/strategy/entries/intraday-chain.js';
import { buildEntryPathRegistry } from '../../src/strategy/entries/registry.js';
import { EntryGate } from '../../src/strategy/entry-gate.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';

const createEntryGate = (cfg: AppConfig, store: KlineStore): EntryGate => {
  const mtf = new MtfEngine(cfg, store);
  const registry = buildEntryPathRegistry(cfg, mtf, store);
  const intradayChain = buildIntradayEntryChain(cfg);
  const contextGate = buildContextGate(cfg, mtf);
  return new EntryGate(cfg, mtf, registry, intradayChain, contextGate, store);
};

const bullishRetraceLeg: ImpulseLeg = {
  start: { index: 0, price: 104, type: 'low', time: new Date() },
  end: { index: 1, price: 118, type: 'high', time: new Date() },
  direction: 'up',
  range: 14,
};

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const TF_MS: Record<string, number> = {
  '4h': 14_400_000,
};

const makeCandle = (
  symbol: string,
  interval: string,
  index: number,
  close: number,
  high: number,
  low: number,
): Candle => {
  const tfMs = TF_MS[interval] ?? 3_600_000;
  const openTime = new Date(Date.UTC(2026, 0, 1, index % 24, 0, 0));
  return {
    symbol,
    interval,
    openTime,
    closeTime: new Date(openTime.getTime() + tfMs),
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

const bearishImpulsePivots = (): Array<{ price: number; type: 'high' | 'low' }> => [
  { price: 120, type: 'high' },
  { price: 112, type: 'low' },
  { price: 116, type: 'high' },
  { price: 102, type: 'low' },
  { price: 110, type: 'high' },
];

describe('EntryGate', () => {
  let config: AppConfig;

  beforeAll(() => {
    config = loadConfig(defaultConfigPath);
  });

  it('blocks long on bearish context with stage context', () => {
    const store = new KlineStore();
    pushZigzagPivots(store, 'BTCUSDT', config.timeframes.context, bearishImpulsePivots(), 9);

    const gate = createEntryGate(config, store);
    const result = gate.evaluate('BTCUSDT', 'long', 0.9);

    expect(result.allow).toBe(false);
    expect(result.stage).toBe('context');
    expect(result.reason).toBe('elliott_context_conflict');
  });

  it('allows long with entry SL/TP when aligned', () => {
    const store = new KlineStore();
    pushZigzagPivots(store, 'BTCUSDT', config.timeframes.context, bullishImpulsePivots(), 9);
    pushZigzagPivots(
      store,
      'BTCUSDT',
      config.timeframes.entry,
      bullishImpulsePivots().slice(0, 4),
      9,
    );

    const tf = config.timeframes.entry;
    const retraceClose = 111;
    store.update(
      'BTCUSDT',
      tf,
      makeCandle('BTCUSDT', tf, 999, retraceClose, retraceClose + 1.5, retraceClose - 1.5),
    );

    const gate = createEntryGate(config, store);
    const result = gate.evaluate('BTCUSDT', 'long', 0.5);

    expect(result.allow).toBe(true);
    expect(result.entryPath).toBe('fib');
    expect(result.entry?.confirm).toBe(true);
    expect(result.entry?.stopLoss).toBeDefined();
  });

  it('tighter fib tolerance rejects edge price that passes at 0.05', () => {
    const { entryMin, entryMax } = config.strategy.fibonacci;
    const edgePrice = 113;

    expect(isInRetraceZone(edgePrice, bullishRetraceLeg, entryMin, entryMax, 0.05)).toBe(
      true,
    );
    expect(isInRetraceZone(edgePrice, bullishRetraceLeg, entryMin, entryMax, 0.02)).toBe(
      false,
    );
  });

  it('entryGates.enabled false skips context and only runs entry check', () => {
    const store = new KlineStore();
    pushZigzagPivots(store, 'BTCUSDT', config.timeframes.context, bearishImpulsePivots(), 9);
    pushZigzagPivots(
      store,
      'BTCUSDT',
      config.timeframes.entry,
      bullishImpulsePivots().slice(0, 4),
      9,
    );

    const tf = config.timeframes.entry;
    const retraceClose = 111;
    store.update(
      'BTCUSDT',
      tf,
      makeCandle('BTCUSDT', tf, 999, retraceClose, retraceClose + 1.5, retraceClose - 1.5),
    );

    const bypassConfig: AppConfig = {
      ...config,
      entryGates: { enabled: false, logRejects: false },
    };
    const gate = createEntryGate(bypassConfig, store);
    const result = gate.evaluate('BTCUSDT', 'long', 0.5);

    expect(result.allow).toBe(true);
    expect(result.entryPath).toBe('fib');
    expect(result.stage).toBeUndefined();
  });
});
