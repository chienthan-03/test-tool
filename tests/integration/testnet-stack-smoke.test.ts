import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { BinanceTestnetAdapter } from '../../src/execution/binance-testnet.js';
import { clearExchangeInfoCache } from '../../src/execution/exchange-info.js';

const config = loadConfig('config/experiments/risk-baseline.yaml');

const mockFetch = (): typeof fetch =>
  vi.fn(async (input, init) => {
    const url = String(input);
    if (url.includes('/fapi/v1/time')) {
      return { ok: true, json: async () => ({ serverTime: Date.now() }) } as Response;
    }
    if (url.includes('/fapi/v1/exchangeInfo')) {
      return {
        ok: true,
        json: async () => ({
          symbols: config.symbols.map((symbol) => ({
            symbol,
            filters: [
              { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
              {
                filterType: 'PRICE_FILTER',
                tickSize: '0.10',
                minPrice: '0.10',
                maxPrice: '1000000',
              },
              { filterType: 'MIN_NOTIONAL', notional: '5' },
            ],
          })),
        }),
      } as Response;
    }
    if (url.includes('/fapi/v2/balance')) {
      return {
        ok: true,
        json: async () => [{ asset: 'USDT', availableBalance: '10000', balance: '10000' }],
      } as Response;
    }
    if (url.includes('/fapi/v2/positionRisk')) {
      return {
        ok: true,
        json: async () =>
          config.symbols.map((symbol) => ({
            symbol,
            positionAmt: '0',
            entryPrice: '0',
          })),
      } as Response;
    }
    if (url.includes('/fapi/v1/marginType') || url.includes('/fapi/v1/leverage')) {
      return { ok: true, json: async () => ({}) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });

describe('testnet stack smoke', () => {
  beforeEach(() => {
    clearExchangeInfoCache();
    vi.stubEnv('BINANCE_API_KEY', 'test-key');
    vi.stubEnv('BINANCE_API_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearExchangeInfoCache();
  });

  it('BinanceTestnetAdapter connects and reads balance with mocked REST', async () => {
    const adapter = new BinanceTestnetAdapter(
      config,
      'test-key',
      'test-secret',
      {},
      mockFetch(),
    );

    await adapter.connect();
    const balance = await adapter.getBalance();

    expect(balance.available).toBeGreaterThan(0);
    await adapter.disconnect();
  });
});
