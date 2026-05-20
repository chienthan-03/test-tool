export type BinanceInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1d';

const BINANCE_INTERVALS: readonly BinanceInterval[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
];

export const toBinanceInterval = (s: string): BinanceInterval => {
  if ((BINANCE_INTERVALS as readonly string[]).includes(s)) {
    return s as BinanceInterval;
  }
  throw new Error(`Invalid Binance interval: ${s}`);
};

const INTERVAL_MS: Record<BinanceInterval, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export const intervalToMs = (interval: string): number => {
  const key = toBinanceInterval(interval);
  return INTERVAL_MS[key];
};

/** Binance combined stream name, e.g. `btcusdt@kline_15m`. */
export const streamName = (symbol: string, interval: BinanceInterval): string => {
  const normalized = symbol.toLowerCase();
  return `${normalized}@kline_${interval}`;
};
