import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { KlineStore } from '../../src/market/kline-store.js';
import { buildEntryPathRegistry } from '../../src/strategy/entries/registry.js';
import { FibEntryEvaluator } from '../../src/strategy/entries/fib-entry.js';
import { MtfEngine } from '../../src/strategy/mtf-engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('buildEntryPathRegistry', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('respects order and skips disabled breakout', () => {
    const config: AppConfig = {
      ...baseConfig,
      strategy: {
        ...baseConfig.strategy,
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          order: ['emaMomentum', 'breakout'],
          breakout: {
            ...baseConfig.strategy.alternateEntries.breakout,
            enabled: false,
          },
        },
      },
    };

    const store = new KlineStore();
    const mtf = new MtfEngine(config, store);
    const registry = buildEntryPathRegistry(config, mtf, store);

    expect(registry.primary).toBeInstanceOf(FibEntryEvaluator);
    expect(registry.primary.id).toBe('fib');
    expect(registry.alternates).toHaveLength(1);
    expect(registry.alternates[0]!.id).toBe('emaMomentum');
  });
});
