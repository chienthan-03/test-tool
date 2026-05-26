import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { buildIntradayEntryChain } from '../../src/strategy/entries/intraday-chain.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('buildIntradayEntryChain', () => {
  let baseConfig: AppConfig;

  beforeAll(() => {
    baseConfig = loadConfig(defaultConfigPath);
  });

  it('respects intraday order and skips disabled breakout', () => {
    const config: AppConfig = {
      ...baseConfig,
      strategy: {
        ...baseConfig.strategy,
        profiles: {
          ...baseConfig.strategy.profiles,
          intraday: {
            ...baseConfig.strategy.profiles.intraday,
            entryPaths: {
              order: ['emaMomentum', 'breakout'],
            },
          },
        },
        alternateEntries: {
          ...baseConfig.strategy.alternateEntries,
          breakout: {
            ...baseConfig.strategy.alternateEntries.breakout,
            enabled: false,
          },
        },
      },
    };

    const chain = buildIntradayEntryChain(config);

    expect(chain).toHaveLength(1);
    expect(chain[0]!.id).toBe('emaMomentum');
  });
});
