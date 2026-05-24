import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { resolveSymbolMargin, toBinanceMarginType } from '../../src/execution/margin-settings.js';

const baseConfig = loadConfig('config/default.yaml');

describe('margin-settings', () => {
  it('toBinanceMarginType maps isolated and cross', () => {
    expect(toBinanceMarginType('isolated')).toBe('ISOLATED');
    expect(toBinanceMarginType('cross')).toBe('CROSSED');
  });

  it('resolveSymbolMargin uses global defaults', () => {
    expect(resolveSymbolMargin(baseConfig, 'BTCUSDT')).toEqual({
      mode: 'isolated',
      leverage: 5,
    });
  });

  it('resolveSymbolMargin merges symbol override', () => {
    const config = {
      ...baseConfig,
      symbolOverrides: {
        BTCUSDT: { margin: { leverage: 3 } },
        ETHUSDT: { margin: { mode: 'cross' as const, leverage: 10 } },
      },
    };
    expect(resolveSymbolMargin(config, 'BTCUSDT')).toEqual({
      mode: 'isolated',
      leverage: 3,
    });
    expect(resolveSymbolMargin(config, 'ETHUSDT')).toEqual({
      mode: 'cross',
      leverage: 10,
    });
  });
});
