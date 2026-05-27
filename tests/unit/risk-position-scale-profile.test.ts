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

describe('RiskEngine position scale by entryProfile', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('applies intraday profile positionScale for any entry path', async () => {
    const config: AppConfig = {
      ...baseConfig,
      sim: { ...baseConfig.sim, leverage: 1 },
      risk: { ...baseConfig.risk, positionPercent: 15 },
      strategy: {
        ...baseConfig.strategy,
        entryProfile: 'intraday',
        profiles: {
          ...baseConfig.strategy.profiles,
          intraday: {
            ...baseConfig.strategy.profiles.intraday,
            positionScale: 0.75,
          },
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
    expect(plans[0]!.notionalUsdt).toBe(1125);
    expect(plans[0]!.quantity).toBe(11.25);
  });

  it('does not scale swing fib path', async () => {
    const config: AppConfig = {
      ...baseConfig,
      sim: { ...baseConfig.sim, leverage: 1 },
      risk: { ...baseConfig.risk, positionPercent: 15 },
      strategy: {
        ...baseConfig.strategy,
        entryProfile: 'swing',
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
          positionScale: 0.5,
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

  it('applies swing alternateEntries positionScale when enabled', async () => {
    const config: AppConfig = {
      ...baseConfig,
      sim: { ...baseConfig.sim, leverage: 1 },
      risk: { ...baseConfig.risk, positionPercent: 15 },
      strategy: {
        ...baseConfig.strategy,
        entryProfile: 'swing',
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
          positionScale: 0.5,
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
    expect(plans[0]!.notionalUsdt).toBe(750);
    expect(plans[0]!.quantity).toBe(7.5);
  });
});
