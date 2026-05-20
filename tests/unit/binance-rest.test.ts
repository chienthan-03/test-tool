import { describe, it, expect, vi } from 'vitest';
import { fetchKlines, getExchangeInfo, getServerTime } from '../../src/market/binance-rest.js';

const sampleKlineRow = [
  1499040000000,
  '0.01634790',
  '0.80000000',
  '0.01575800',
  '0.01577100',
  '148976.11427815',
  1499644799999,
  '2434.19055334',
  308,
  '1756.87402397',
  '28.46694368',
  '0',
] as const;

const mockFetch = (handlers: Record<string, unknown>): typeof fetch =>
  vi.fn(async (input) => {
    const url = String(input);
    if (url.includes('/fapi/v1/klines')) {
      return {
        ok: true,
        json: async () => [sampleKlineRow],
      } as Response;
    }
    if (url.includes('/fapi/v1/time')) {
      return {
        ok: true,
        json: async () => ({ serverTime: 1_700_000_000_000 }),
      } as Response;
    }
    if (url.includes('/fapi/v1/exchangeInfo')) {
      return {
        ok: true,
        json: async () => handlers.exchangeInfo,
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  }) as typeof fetch;

describe('binance-rest', () => {
  it('fetchKlines maps REST rows to closed candles', async () => {
    const fetchFn = mockFetch({});
    const candles = await fetchKlines(
      'https://fapi.binance.com',
      'BTCUSDT',
      '15m',
      200,
      fetchFn,
    );

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      symbol: 'BTCUSDT',
      interval: '15m',
      open: 0.0163479,
      high: 0.8,
      low: 0.015758,
      close: 0.015771,
      volume: 148976.11427815,
      isClosed: true,
    });
    expect(candles[0]?.openTime).toEqual(new Date(1499040000000));
    expect(candles[0]?.closeTime).toEqual(new Date(1499644799999));
  });

  it('getServerTime returns serverTime from response', async () => {
    const fetchFn = mockFetch({});
    await expect(getServerTime('https://fapi.binance.com', fetchFn)).resolves.toBe(
      1_700_000_000_000,
    );
  });

  it('getExchangeInfo parses symbol filters', async () => {
    const fetchFn = mockFetch({
      exchangeInfo: {
        symbols: [
          {
            symbol: 'BTCUSDT',
            filters: [
              {
                filterType: 'PRICE_FILTER',
                minPrice: '0.01',
                maxPrice: '1000000',
                tickSize: '0.10',
              },
              {
                filterType: 'LOT_SIZE',
                minQty: '0.001',
                maxQty: '1000',
                stepSize: '0.001',
              },
              { filterType: 'MIN_NOTIONAL', notional: '5' },
            ],
          },
        ],
      },
    });

    const filters = await getExchangeInfo('https://fapi.binance.com', fetchFn);
    expect(filters).toEqual([
      {
        symbol: 'BTCUSDT',
        stepSize: 0.001,
        minQty: 0.001,
        tickSize: 0.1,
        minPrice: 0.01,
        maxPrice: 1_000_000,
        minNotional: 5,
      },
    ]);
  });

  it.skip('live fetchKlines against Binance mainnet', async () => {
    const candles = await fetchKlines('https://fapi.binance.com', 'BTCUSDT', '15m', 5);
    expect(candles.length).toBeGreaterThan(0);
    expect(candles.every((c) => c.isClosed)).toBe(true);
  });
});
