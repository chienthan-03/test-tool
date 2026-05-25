import { getExchangeInfo } from '../market/binance-rest.js';
import type { ExchangeFilters } from '../core/types.js';

const DEFAULT_FILTERS: Record<string, ExchangeFilters> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    stepSize: 0.001,
    minQty: 0.001,
    tickSize: 0.1,
    minPrice: 0.1,
    maxPrice: 1_000_000,
    minNotional: 5,
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    stepSize: 0.001,
    minQty: 0.001,
    tickSize: 0.1,
    minPrice: 0.1,
    maxPrice: 1_000_000,
    minNotional: 5,
  },
  SOLUSDT: {
    symbol: 'SOLUSDT',
    stepSize: 0.01,
    minQty: 0.01,
    tickSize: 0.01,
    minPrice: 0.01,
    maxPrice: 1_000_000,
    minNotional: 5,
  },
  BNBUSDT: {
    symbol: 'BNBUSDT',
    stepSize: 0.01,
    minQty: 0.01,
    tickSize: 0.01,
    minPrice: 0.01,
    maxPrice: 1_000_000,
    minNotional: 5,
  },
  XRPUSDT: {
    symbol: 'XRPUSDT',
    stepSize: 0.1,
    minQty: 0.1,
    tickSize: 0.0001,
    minPrice: 0.0001,
    maxPrice: 1_000_000,
    minNotional: 5,
  },
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedFilters: Map<string, ExchangeFilters> | null = null;
let cacheLoadedAt = 0;

const filtersToMap = (filters: ExchangeFilters[]): Map<string, ExchangeFilters> =>
  new Map(filters.map((f) => [f.symbol, f]));

export const getDefaultFilters = (symbol: string): ExchangeFilters | undefined =>
  DEFAULT_FILTERS[symbol];

export const loadExchangeInfo = async (
  baseUrl: string,
  symbols?: string[],
): Promise<Map<string, ExchangeFilters>> => {
  const now = Date.now();
  if (cachedFilters && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedFilters;
  }

  try {
    const remote = await getExchangeInfo(baseUrl);
    const map = filtersToMap(remote);
    for (const symbol of symbols ?? []) {
      if (!map.has(symbol) && DEFAULT_FILTERS[symbol]) {
        map.set(symbol, DEFAULT_FILTERS[symbol]);
      }
    }
    cachedFilters = map;
    cacheLoadedAt = now;
    return map;
  } catch {
    const map = new Map<string, ExchangeFilters>(Object.entries(DEFAULT_FILTERS));
    cachedFilters = map;
    cacheLoadedAt = now;
    return map;
  }
};

export const getSymbolFilters = async (
  baseUrl: string,
  symbol: string,
): Promise<ExchangeFilters> => {
  const map = await loadExchangeInfo(baseUrl, [symbol]);
  const filters = map.get(symbol) ?? DEFAULT_FILTERS[symbol];
  if (!filters) {
    throw new Error(`No exchange filters for symbol ${symbol}`);
  }
  return filters;
};

/** Reset in-memory cache (tests). */
export const clearExchangeInfoCache = (): void => {
  cachedFilters = null;
  cacheLoadedAt = 0;
};

export const roundQuantity = (quantity: number, stepSize: number): number => {
  if (stepSize <= 0) {
    return quantity;
  }
  const steps = Math.floor(quantity / stepSize);
  return steps * stepSize;
};

export const roundPrice = (price: number, tickSize: number): number => {
  if (tickSize <= 0) {
    return price;
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(tickSize)));
  const rounded = Math.round(price / tickSize) * tickSize;
  return Number(rounded.toFixed(decimals));
};
