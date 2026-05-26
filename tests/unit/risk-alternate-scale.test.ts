import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import type { OrderPlan, TradeIntent } from '../../src/core/types.js';
import { RiskEngine } from '../../src/risk/risk-engine.js';

const defaultConfigPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/default.yaml',
);

const flushAsyncHandlers = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const makeIntent = (entryPath: TradeIntent['entryPath']): TradeIntent => ({
  id: `intent-${entryPath}`,
  symbol: 'BTCUSDT',
  side: 'BUY',
  newsSignalId: 'sig-1',
  newsId: 'news-1',
  entryPrice: 100,
  atr: 2,
  stopLoss: 96,
  takeProfit: 108,
  contextTimeframe: '4h',
  entryTimeframe: '1h',
  entryPath,
  createdAt: new Date(),
});

describe('RiskEngine alternate positionScale', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('scales positionPercent for non-fib paths when alternateEntries enabled', async () => {
    const config: AppConfig = {
      ...baseConfig,
      risk: { ...baseConfig.risk, positionPercent: 15 },
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
          positionScale: 0.75,
        },
      },
    };

    const bus = new AppEventBus();
    const plans: OrderPlan[] = [];
    bus.on('risk:orderPlan', (plan) => {
      plans.push(plan);
    });

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

    bus.emit('strategy:intent', makeIntent('breakout'));
    await flushAsyncHandlers();

    expect(plans).toHaveLength(1);
    // 15% of 10_000 = 1500; × 0.75 = 1125 USDT notional at price 100
    expect(plans[0]!.notionalUsdt).toBe(1125);
    expect(plans[0]!.quantity).toBe(11.25);
  });

  it('does not scale fib path', async () => {
    const config: AppConfig = {
      ...baseConfig,
      risk: { ...baseConfig.risk, positionPercent: 15 },
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
          positionScale: 0.75,
        },
      },
    };

    const bus = new AppEventBus();
    const plans: OrderPlan[] = [];
    bus.on('risk:orderPlan', (plan) => {
      plans.push(plan);
    });

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

    bus.emit('strategy:intent', makeIntent('fib'));
    await flushAsyncHandlers();

    expect(plans).toHaveLength(1);
    expect(plans[0]!.notionalUsdt).toBe(1500);
    expect(plans[0]!.quantity).toBe(15);
  });
});
