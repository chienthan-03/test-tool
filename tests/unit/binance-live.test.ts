import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { BinanceLiveAdapter } from '../../src/execution/binance-live.js';
import { clearExchangeInfoCache } from '../../src/execution/exchange-info.js';

const config = loadConfig('config/default.yaml');

const mockFetch = (): typeof fetch =>
  vi.fn(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/fapi/v1/time')) {
      return { ok: true, json: async () => ({ serverTime: Date.now() }) } as Response;
    }

    if (url.includes('/fapi/v1/exchangeInfo')) {
      return {
        ok: true,
        json: async () => ({
          symbols: [
            {
              symbol: 'BTCUSDT',
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
            },
          ],
        }),
      } as Response;
    }

    if (url.includes('/fapi/v2/balance')) {
      return {
        ok: true,
        json: async () => [{ asset: 'USDT', availableBalance: '1000', balance: '1000' }],
      } as Response;
    }

    if (url.includes('/fapi/v2/positionRisk')) {
      return {
        ok: true,
        json: async () => [{ symbol: 'BTCUSDT', positionAmt: '0', entryPrice: '0' }],
      } as Response;
    }

    if (url.includes('/fapi/v1/order') && method === 'POST') {
      const typeMatch = url.match(/type=([^&]+)/);
      const type = typeMatch?.[1] ?? 'MARKET';
      return {
        ok: true,
        json: async () => ({
          orderId: type === 'MARKET' ? 99 : type === 'STOP_MARKET' ? 100 : 101,
          symbol: 'BTCUSDT',
          side: url.includes('side=SELL') ? 'SELL' : 'BUY',
          type,
          status: 'NEW',
          avgPrice: type === 'MARKET' ? '50000' : undefined,
          executedQty: type === 'MARKET' ? '0.01' : undefined,
        }),
      } as Response;
    }

    if (url.includes('/fapi/v1/marginType') && method === 'POST') {
      return { ok: true, json: async () => ({}) } as Response;
    }

    if (url.includes('/fapi/v1/leverage') && method === 'POST') {
      return {
        ok: true,
        json: async () => ({ leverage: 5, maxNotionalValue: '1000000' }),
      } as Response;
    }

    return { ok: false, status: 404 } as Response;
  }) as typeof fetch;

describe('BinanceLiveAdapter', () => {
  beforeEach(() => {
    clearExchangeInfoCache();
    process.env.BINANCE_API_KEY = 'test-key';
    process.env.BINANCE_API_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has mode live', () => {
    const adapter = new BinanceLiveAdapter(config, 'k', 's', {}, mockFetch());
    expect(adapter.mode).toBe('live');
  });

  it('halts placeEntry when circuit breaker is open', async () => {
    const onFill = vi.fn();
    const cfg = {
      ...config,
      binance: {
        ...config.binance,
        circuitBreaker: { enabled: true, maxFailures: 1, windowMs: 60_000 },
      },
    };
    const adapter = new BinanceLiveAdapter(cfg, 'k', 's', { onFill }, mockFetch());

    await adapter.connect();

    (adapter as unknown as { circuitBreaker: { recordFailure: () => void } }).circuitBreaker.recordFailure();

    await expect(
      adapter.placeEntry({
        intentId: 'i1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.01,
        entryType: 'MARKET',
        stopLoss: 49000,
        takeProfit: 51000,
        notionalUsdt: 500,
      }),
    ).rejects.toThrow('circuit_breaker_open');

    expect(onFill).not.toHaveBeenCalled();
    await adapter.disconnect();
  });

  it('placeEntry emits fill and places SL/TP (mocked HTTP)', async () => {
    const onFill = vi.fn();
    const adapter = new BinanceLiveAdapter(config, 'k', 's', { onFill }, mockFetch());

    await adapter.connect();

    const fill = await adapter.placeEntry({
      intentId: 'i1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.01,
      entryType: 'MARKET',
      stopLoss: 49000,
      takeProfit: 51000,
      notionalUsdt: 500,
    });

    expect(fill.symbol).toBe('BTCUSDT');
    expect(fill.price).toBe(50000);
    expect(onFill).toHaveBeenCalledWith(fill);

    const slId = await adapter.placeStopLoss('BTCUSDT', 'SELL', 49000, 0.01);
    const tpId = await adapter.placeTakeProfit('BTCUSDT', 'SELL', 51000, 0.01);
    expect(slId).toBe('100');
    expect(tpId).toBe('101');

    await adapter.disconnect();
  });
});
