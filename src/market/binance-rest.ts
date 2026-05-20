import { fetch } from 'undici';
import type { Candle, ExchangeFilters } from '../core/types.js';

export type RestFetch = typeof fetch;

/** Raw Binance futures kline array from GET /fapi/v1/klines. */
type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

type ExchangeInfoFilter = {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  notional?: string;
};

type ExchangeInfoSymbol = {
  symbol: string;
  filters: ExchangeInfoFilter[];
};

type ExchangeInfoResponse = {
  symbols: ExchangeInfoSymbol[];
};

const trimBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, '');

const mapRestKline = (row: BinanceKlineRow, symbol: string, interval: string): Candle => ({
  symbol,
  interval,
  openTime: new Date(row[0]),
  closeTime: new Date(row[6]),
  open: Number(row[1]),
  high: Number(row[2]),
  low: Number(row[3]),
  close: Number(row[4]),
  volume: Number(row[5]),
  isClosed: true,
});

const parseSymbolFilters = (
  symbol: string,
  filters: ExchangeInfoFilter[],
): ExchangeFilters | null => {
  const price = filters.find((f) => f.filterType === 'PRICE_FILTER');
  const lot = filters.find((f) => f.filterType === 'LOT_SIZE');
  const minNotional = filters.find((f) => f.filterType === 'MIN_NOTIONAL');
  if (!price || !lot || !minNotional?.notional) {
    return null;
  }

  return {
    symbol,
    stepSize: Number(lot.stepSize),
    minQty: Number(lot.minQty),
    tickSize: Number(price.tickSize),
    minPrice: Number(price.minPrice),
    maxPrice: Number(price.maxPrice),
    minNotional: Number(minNotional.notional),
  };
};

const restGet = async <T>(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number>,
  fetchFn: RestFetch = fetch,
): Promise<T> => {
  const url = new URL(`${trimBaseUrl(baseUrl)}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Binance REST ${path} failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const fetchKlines = async (
  baseUrl: string,
  symbol: string,
  interval: string,
  limit = 200,
  fetchFn: RestFetch = fetch,
): Promise<Candle[]> => {
  const rows = await restGet<BinanceKlineRow[]>(
    baseUrl,
    '/fapi/v1/klines',
    { symbol, interval, limit },
    fetchFn,
  );

  return rows.map((row) => mapRestKline(row, symbol, interval));
};

export const getServerTime = async (
  baseUrl: string,
  fetchFn: RestFetch = fetch,
): Promise<number> => {
  const body = await restGet<{ serverTime: number }>(baseUrl, '/fapi/v1/time', undefined, fetchFn);
  return body.serverTime;
};

export const getExchangeInfo = async (
  baseUrl: string,
  fetchFn: RestFetch = fetch,
): Promise<ExchangeFilters[]> => {
  const body = await restGet<ExchangeInfoResponse>(
    baseUrl,
    '/fapi/v1/exchangeInfo',
    undefined,
    fetchFn,
  );

  const filters: ExchangeFilters[] = [];
  for (const symbolInfo of body.symbols) {
    const parsed = parseSymbolFilters(symbolInfo.symbol, symbolInfo.filters);
    if (parsed) {
      filters.push(parsed);
    }
  }

  return filters;
};
