import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { fetchKlines } from '../../src/market/binance-rest.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const symbolsExpandedPath = join(projectRoot, 'config/experiments/symbols-expanded.yaml');

describe('market symbols smoke (Binance Futures REST)', () => {
  it('fetches recent klines for all expanded symbols', async () => {
    const config = loadConfig(symbolsExpandedPath);
    const baseUrl = config.binance.baseUrl;

    for (const symbol of config.symbols) {
      const candles = await fetchKlines(baseUrl, symbol, '4h', 5);
      expect(candles.length, `${symbol} should return klines`).toBeGreaterThan(0);
      expect(candles[0]?.symbol).toBe(symbol);
    }
  }, 30_000);
});
