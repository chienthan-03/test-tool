import { fetch } from 'undici';
import type { OrderSide, Position, PositionSide } from '../core/types.js';
import { buildSignedQuery } from './binance-sign.js';

export type FuturesFetch = typeof fetch;

type BalanceRow = {
  asset: string;
  availableBalance: string;
  balance: string;
};

type PositionRiskRow = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  unrealizedProfit?: string;
};

type OrderResponse = {
  orderId: number;
  symbol: string;
  side: OrderSide;
  type: string;
  status: string;
};

type ListenKeyResponse = {
  listenKey: string;
};

const trimBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, '');

const parsePositionSide = (positionAmt: number): PositionSide | null => {
  if (positionAmt > 0) {
    return 'LONG';
  }
  if (positionAmt < 0) {
    return 'SHORT';
  }
  return null;
};

export class BinanceFuturesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly recvWindow: number;
  private readonly fetchFn: FuturesFetch;

  constructor(
    baseUrl: string,
    apiKey: string,
    apiSecret: string,
    recvWindow: number,
    fetchFn: FuturesFetch = fetch,
  ) {
    this.baseUrl = trimBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.recvWindow = recvWindow;
    this.fetchFn = fetchFn;
  }

  async getBalance(): Promise<number> {
    const rows = await this.signedGet<BalanceRow[]>('/fapi/v2/balance');
    const usdt = rows.find((row) => row.asset === 'USDT');
    if (!usdt) {
      return 0;
    }
    return Number(usdt.availableBalance);
  }

  async getPositionRisk(symbol: string): Promise<Position | null> {
    const rows = await this.signedGet<PositionRiskRow[]>('/fapi/v2/positionRisk', { symbol });
    const row = rows.find((r) => r.symbol === symbol);
    if (!row) {
      return null;
    }

    const positionAmt = Number(row.positionAmt);
    const side = parsePositionSide(positionAmt);
    if (!side) {
      return null;
    }

    return {
      symbol: row.symbol,
      side,
      quantity: Math.abs(positionAmt),
      entryPrice: Number(row.entryPrice),
      unrealizedPnl: row.unrealizedProfit !== undefined ? Number(row.unrealizedProfit) : undefined,
    };
  }

  async placeMarketOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
  ): Promise<OrderResponse> {
    return this.signedPost<OrderResponse>('/fapi/v1/order', {
      symbol,
      side,
      type: 'MARKET',
      quantity,
    });
  }

  async placeStopMarket(
    symbol: string,
    side: OrderSide,
    stopPrice: number,
    quantity: number,
  ): Promise<OrderResponse> {
    return this.signedPost<OrderResponse>('/fapi/v1/order', {
      symbol,
      side,
      type: 'STOP_MARKET',
      stopPrice,
      quantity,
      reduceOnly: 'true',
    });
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: OrderSide,
    stopPrice: number,
    quantity: number,
  ): Promise<OrderResponse> {
    return this.signedPost<OrderResponse>('/fapi/v1/order', {
      symbol,
      side,
      type: 'TAKE_PROFIT_MARKET',
      stopPrice,
      quantity,
      reduceOnly: 'true',
    });
  }

  async cancelAllOpenOrders(symbol: string): Promise<void> {
    await this.signedDelete('/fapi/v1/allOpenOrders', { symbol });
  }

  async getListenKey(): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/fapi/v1/listenKey`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Binance listenKey create failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as ListenKeyResponse;
    return body.listenKey;
  }

  async keepaliveListenKey(): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/fapi/v1/listenKey`, {
      method: 'PUT',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Binance listenKey keepalive failed: HTTP ${response.status}`);
    }
  }

  private signedParams(params: Record<string, string | number>): Record<string, string | number> {
    return { ...params, recvWindow: this.recvWindow };
  }

  private async signedGet<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const query = buildSignedQuery(this.signedParams(params), this.apiSecret);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Binance GET ${path} failed: HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async signedPost<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const query = buildSignedQuery(this.signedParams(params), this.apiSecret);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Binance POST ${path} failed: HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async signedDelete(
    path: string,
    params: Record<string, string | number>,
  ): Promise<void> {
    const query = buildSignedQuery(this.signedParams(params), this.apiSecret);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Binance DELETE ${path} failed: HTTP ${response.status}`);
    }
  }
}
