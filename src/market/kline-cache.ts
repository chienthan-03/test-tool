import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Candle } from '../core/types.js';
import type { RestFetch } from './binance-rest.js';
import { fetch } from 'undici';

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

type SerializedCandle = Omit<Candle, 'openTime' | 'closeTime'> & {
  openTime: string;
  closeTime: string;
};

const KLINE_PAGE_LIMIT = 1500;

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

const serializeCandle = (candle: Candle): SerializedCandle => ({
  ...candle,
  openTime: candle.openTime.toISOString(),
  closeTime: candle.closeTime.toISOString(),
});

const deserializeCandle = (raw: SerializedCandle): Candle => ({
  ...raw,
  openTime: new Date(raw.openTime),
  closeTime: new Date(raw.closeTime),
});

export const cacheFileName = (symbol: string, interval: string): string =>
  `${symbol}_${interval}.json`;

export const cacheFilePath = (cacheDir: string, symbol: string, interval: string): string =>
  join(cacheDir, cacheFileName(symbol, interval));

const restGetKlines = async (
  baseUrl: string,
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  fetchFn: RestFetch,
): Promise<Candle[]> => {
  const url = new URL(`${trimBaseUrl(baseUrl)}/fapi/v1/klines`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', String(KLINE_PAGE_LIMIT));

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Binance REST /fapi/v1/klines failed: HTTP ${response.status}`);
  }

  const rows = (await response.json()) as BinanceKlineRow[];
  return rows.map((row) => mapRestKline(row, symbol, interval));
};

export const downloadKlines = async (
  baseUrl: string,
  symbol: string,
  interval: string,
  from: Date,
  to: Date,
  cacheDir: string,
  fetchFn: RestFetch = fetch,
): Promise<string> => {
  await mkdir(cacheDir, { recursive: true });

  const all: Candle[] = [];
  let cursor = from.getTime();
  const endMs = to.getTime();

  while (cursor <= endMs) {
    const page = await restGetKlines(baseUrl, symbol, interval, cursor, endMs, fetchFn);
    if (page.length === 0) {
      break;
    }

    all.push(...page);
    const lastOpen = page[page.length - 1]!.openTime.getTime();
    const nextCursor = lastOpen + 1;
    if (nextCursor <= cursor) {
      break;
    }
    cursor = nextCursor;

    if (page.length < KLINE_PAGE_LIMIT) {
      break;
    }
  }

  const deduped = [...new Map(all.map((c) => [c.openTime.getTime(), c])).values()].sort(
    (a, b) => a.openTime.getTime() - b.openTime.getTime(),
  );

  const path = cacheFilePath(cacheDir, symbol, interval);
  await writeFile(path, JSON.stringify(deduped.map(serializeCandle), null, 2), 'utf8');
  return path;
};

export const loadKlines = async (cachePath: string): Promise<Candle[]> => {
  const raw = await readFile(cachePath, 'utf8');
  const parsed = JSON.parse(raw) as SerializedCandle[];
  return parsed.map(deserializeCandle);
};
