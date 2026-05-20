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

/** Binance combined stream name, e.g. `btcusdt@kline_15m`. */
export const streamName = (symbol: string, interval: BinanceInterval): string => {
  const normalized = symbol.toLowerCase();
  return `${normalized}@kline_${interval}`;
};
