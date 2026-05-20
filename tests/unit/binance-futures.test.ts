import { describe, it, expect, vi } from 'vitest';
import { BinanceFuturesClient } from '../../src/execution/binance-futures.js';

const BASE = 'https://testnet.binancefuture.com';
const API_KEY = 'test-key';
const API_SECRET = 'test-secret';
const RECV_WINDOW = 5000;

const mockFetch = (handlers: {
  order?: unknown;
  balance?: unknown;
  position?: unknown;
}): typeof fetch =>
  vi.fn(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/fapi/v1/order') && method === 'POST') {
      return {
        ok: true,
        json: async () => handlers.order,
      } as Response;
    }

    if (url.includes('/fapi/v2/balance')) {
      return {
        ok: true,
        json: async () => handlers.balance,
      } as Response;
    }

    if (url.includes('/fapi/v2/positionRisk')) {
      return {
        ok: true,
        json: async () => handlers.position,
      } as Response;
    }

    if (url.includes('/fapi/v1/listenKey') && method === 'POST') {
      return {
        ok: true,
        json: async () => ({ listenKey: 'lk-123' }),
      } as Response;
    }

    if (url.includes('/fapi/v1/listenKey') && method === 'PUT') {
      return { ok: true, json: async () => ({}) } as Response;
    }

    if (url.includes('/fapi/v1/allOpenOrders') && method === 'DELETE') {
      return { ok: true, json: async () => ({}) } as Response;
    }

    return { ok: false, status: 404 } as Response;
  }) as typeof fetch;

describe('BinanceFuturesClient', () => {
  it('placeMarketOrder posts signed MARKET order and returns response', async () => {
    const orderResponse = {
      orderId: 42,
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      status: 'NEW',
    };
    const fetchFn = mockFetch({ order: orderResponse });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    const result = await client.placeMarketOrder('BTCUSDT', 'BUY', 0.01);

    expect(result).toEqual(orderResponse);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    expect(String(url)).toContain(`${BASE}/fapi/v1/order?`);
    expect(String(url)).toContain('symbol=BTCUSDT');
    expect(String(url)).toContain('side=BUY');
    expect(String(url)).toContain('type=MARKET');
    expect(String(url)).toContain('quantity=0.01');
    expect(String(url)).toContain('recvWindow=5000');
    expect(String(url)).toContain('timestamp=');
    expect(String(url)).toContain('signature=');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'X-MBX-APIKEY': API_KEY });
  });

  it('getBalance returns available USDT', async () => {
    const fetchFn = mockFetch({
      balance: [
        { asset: 'USDT', availableBalance: '1234.5', balance: '2000' },
        { asset: 'BTC', availableBalance: '0', balance: '0' },
      ],
    });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await expect(client.getBalance()).resolves.toBe(1234.5);
  });

  it('getPositionRisk returns null when flat', async () => {
    const fetchFn = mockFetch({
      position: [{ symbol: 'BTCUSDT', positionAmt: '0', entryPrice: '0' }],
    });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await expect(client.getPositionRisk('BTCUSDT')).resolves.toBeNull();
  });

  it('getPositionRisk maps long position', async () => {
    const fetchFn = mockFetch({
      position: [
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.5',
          entryPrice: '50000',
          unrealizedProfit: '10',
        },
      ],
    });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await expect(client.getPositionRisk('BTCUSDT')).resolves.toEqual({
      symbol: 'BTCUSDT',
      side: 'LONG',
      quantity: 0.5,
      entryPrice: 50000,
      unrealizedPnl: 10,
    });
  });

  it('placeStopMarket includes reduceOnly', async () => {
    const fetchFn = mockFetch({
      order: { orderId: 1, symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', status: 'NEW' },
    });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await client.placeStopMarket('BTCUSDT', 'SELL', 49000, 0.01);

    const url = String(vi.mocked(fetchFn).mock.calls[0]?.[0]);
    expect(url).toContain('type=STOP_MARKET');
    expect(url).toContain('reduceOnly=true');
    expect(url).toContain('stopPrice=49000');
  });

  it('getAllPositionRisk returns only non-flat positions', async () => {
    const fetchFn = mockFetch({
      position: [
        { symbol: 'BTCUSDT', positionAmt: '0.1', entryPrice: '50000', unrealizedProfit: '5' },
        { symbol: 'ETHUSDT', positionAmt: '0', entryPrice: '0' },
      ],
    });
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await expect(client.getAllPositionRisk()).resolves.toEqual([
      {
        symbol: 'BTCUSDT',
        side: 'LONG',
        quantity: 0.1,
        entryPrice: 50000,
        unrealizedPnl: 5,
      },
    ]);
  });

  it('getListenKey and keepaliveListenKey use API key header only', async () => {
    const fetchFn = mockFetch({});
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);

    await expect(client.getListenKey()).resolves.toBe('lk-123');
    await client.keepaliveListenKey();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const postCall = vi.mocked(fetchFn).mock.calls[0];
    const putCall = vi.mocked(fetchFn).mock.calls[1];
    expect(String(postCall?.[0])).toBe(`${BASE}/fapi/v1/listenKey`);
    expect(postCall?.[1]?.method).toBe('POST');
    expect(putCall?.[1]?.method).toBe('PUT');
    expect(String(postCall?.[0])).not.toContain('signature=');
  });
});
