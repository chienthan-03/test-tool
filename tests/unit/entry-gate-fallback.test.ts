import { describe, it, expect, beforeAll, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { ElliottContextGate } from '../../src/strategy/context/elliott-context-gate.js';
import { EntryGate } from '../../src/strategy/entry-gate.js';
import type { EntryPathEvaluator } from '../../src/strategy/entries/types.js';
import type { EntryPathRegistry } from '../../src/strategy/entries/registry.js';
import type { MtfEngine } from '../../src/strategy/mtf-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

const makeRegistry = (
  primary: EntryPathEvaluator,
  alternates: EntryPathEvaluator[],
): EntryPathRegistry => ({
  primary: primary as EntryPathRegistry['primary'],
  alternates,
});

describe('EntryGate fallback chain', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('uses breakout when fib fails outside_fib_zone', () => {
    const store = new KlineStore();
    const primaryEvaluate = vi.fn(() => ({
      confirm: false,
      reason: 'outside_fib_zone',
      close: 100,
      atr: 1.2,
    }));
    const breakoutEvaluate = vi.fn(() => ({
      confirm: true,
      close: 105,
      atr: 1.5,
      stopLoss: 100,
      takeProfit: 115,
    }));

    const registry = makeRegistry(
      { id: 'fib', evaluate: primaryEvaluate },
      [{ id: 'breakout', evaluate: breakoutEvaluate }],
    );

    const mtf = {
      evaluateContext: vi.fn(() => ({ allow: true })),
    } as unknown as MtfEngine;

    const config: AppConfig = {
      ...baseConfig,
      entryGates: { ...baseConfig.entryGates, enabled: true },
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
        },
      },
    };

    const gate = new EntryGate(
      config,
      mtf,
      registry,
      [],
      new ElliottContextGate(mtf),
      store,
    );
    const result = gate.evaluate('BTCUSDT', 'long', 0.5);

    expect(result.allow).toBe(true);
    expect(result.entryPath).toBe('breakout');
    expect(result.entry?.confirm).toBe(true);
    expect(breakoutEvaluate).toHaveBeenCalledOnce();
  });

  it('does not run alternates when context fails', () => {
    const store = new KlineStore();
    const primaryEvaluate = vi.fn();
    const alternateEvaluate = vi.fn();

    const registry = makeRegistry(
      { id: 'fib', evaluate: primaryEvaluate },
      [{ id: 'breakout', evaluate: alternateEvaluate }],
    );

    const mtf = {
      evaluateContext: vi.fn(() => ({
        allow: false,
        reason: 'elliott_context_conflict',
      })),
    } as unknown as MtfEngine;

    const config: AppConfig = {
      ...baseConfig,
      entryGates: { ...baseConfig.entryGates, enabled: true },
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: true,
        },
      },
    };

    const gate = new EntryGate(
      config,
      mtf,
      registry,
      [],
      new ElliottContextGate(mtf),
      store,
    );
    const result = gate.evaluate('BTCUSDT', 'long', 0.9);

    expect(result.allow).toBe(false);
    expect(result.stage).toBe('context');
    expect(primaryEvaluate).not.toHaveBeenCalled();
    expect(alternateEvaluate).not.toHaveBeenCalled();
  });

  it('skips alternates when alternateEntries.enabled is false', () => {
    const store = new KlineStore();
    const alternateEvaluate = vi.fn();

    const registry = makeRegistry(
      {
        id: 'fib',
        evaluate: vi.fn(() => ({
          confirm: false,
          reason: 'outside_fib_zone',
          close: 100,
          atr: 1,
        })),
      },
      [{ id: 'breakout', evaluate: alternateEvaluate }],
    );

    const mtf = {
      evaluateContext: vi.fn(() => ({ allow: true })),
    } as unknown as MtfEngine;

    const config: AppConfig = {
      ...baseConfig,
      entryGates: { ...baseConfig.entryGates, enabled: true },
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          enabled: false,
        },
      },
    };

    const gate = new EntryGate(
      config,
      mtf,
      registry,
      [],
      new ElliottContextGate(mtf),
      store,
    );
    const result = gate.evaluate('BTCUSDT', 'long', 0.5);

    expect(result.allow).toBe(false);
    expect(result.stage).toBe('entry');
    expect(alternateEvaluate).not.toHaveBeenCalled();
  });
});
