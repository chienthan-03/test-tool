import { fetch } from 'undici';
import type { OrderSide, Position, PositionSide } from '../core/types.js';
import { buildSignedQuery } from './binance-sign.js';

export type FuturesFetch = typeof fetch;

type BinanceErrorBody = { code?: number; msg?: string };

type JsonResponse = { json(): Promise<unknown> };

const parseBinanceError = async (response: JsonResponse): Promise<BinanceErrorBody> => {
  try {
    return (await response.json()) as BinanceErrorBody;
  } catch {
    return {};
  }
};

export class BinanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}

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
  avgPrice?: string;
  executedQty?: string;
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

const mapPositionRow = (
  rows: PositionRiskRow[],
  symbol: string,
): Position | null => {
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
};

export class BinanceFuturesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly recvWindow: number;
  private readonly fetchFn: FuturesFetch;
  private timeOffsetMs = 0;

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

  /** Offset = Binance serverTime - local Date.now(); applied to signed request timestamps. */
  getTimeOffsetMs(): number {
    return this.timeOffsetMs;
  }

  async syncServerTime(): Promise<number> {
    const response = await this.fetchFn(`${this.baseUrl}/fapi/v1/time`);
    if (!response.ok) {
      throw new Error(`Binance time sync failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { serverTime: number };
    this.timeOffsetMs = body.serverTime - Date.now();
    return this.timeOffsetMs;
  }

  private requestTimestamp(): number {
    return Date.now() + this.timeOffsetMs;
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
    return mapPositionRow(rows, symbol);
  }

  async getAllPositionRisk(): Promise<Position[]> {
    const rows = await this.signedGet<PositionRiskRow[]>('/fapi/v2/positionRisk');
    const positions: Position[] = [];
    for (const row of rows) {
      const positionAmt = Number(row.positionAmt);
      const side = parsePositionSide(positionAmt);
      if (!side) {
        continue;
      }
      positions.push({
        symbol: row.symbol,
        side,
        quantity: Math.abs(positionAmt),
        entryPrice: Number(row.entryPrice),
        unrealizedPnl:
          row.unrealizedProfit !== undefined ? Number(row.unrealizedProfit) : undefined,
      });
    }
    return positions;
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

  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<void> {
    await this.signedPost<Record<string, never>>('/fapi/v1/marginType', {
      symbol,
      marginType,
    });
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedPost<{ leverage: number; maxNotionalValue: string }>(
      '/fapi/v1/leverage',
      { symbol, leverage },
    );
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

  private buildSignedRequestQuery(
    params: Record<string, string | number>,
  ): string {
    return buildSignedQuery(
      { ...this.signedParams(params), timestamp: this.requestTimestamp() },
      this.apiSecret,
    );
  }

  private async signedGet<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const query = this.buildSignedRequestQuery(params);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      const body = await parseBinanceError(response);
      throw new BinanceApiError(
        body.msg ?? `Binance GET ${path} failed: HTTP ${response.status}`,
        response.status,
        body.code,
      );
    }

    return response.json() as Promise<T>;
  }

  private async signedPost<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const query = this.buildSignedRequestQuery(params);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      const body = await parseBinanceError(response);
      throw new BinanceApiError(
        body.msg ?? `Binance POST ${path} failed: HTTP ${response.status}`,
        response.status,
        body.code,
      );
    }

    return response.json() as Promise<T>;
  }

  private async signedDelete(
    path: string,
    params: Record<string, string | number>,
  ): Promise<void> {
    const query = this.buildSignedRequestQuery(params);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await this.fetchFn(url, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    if (!response.ok) {
      const body = await parseBinanceError(response);
      throw new BinanceApiError(
        body.msg ?? `Binance DELETE ${path} failed: HTTP ${response.status}`,
        response.status,
        body.code,
      );
    }
  }
}
