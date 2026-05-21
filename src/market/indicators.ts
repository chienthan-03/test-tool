import type { Candle } from '../core/types.js';

export const sma = (values: number[], period: number): number | null => {
  if (period <= 0 || values.length < period) {
    return null;
  }
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
};

export const ema = (closes: number[], period: number): number[] => {
  const result: number[] = [];
  if (period <= 0 || closes.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  const seed = sma(closes.slice(0, period), period);
  if (seed === null) {
    return result;
  }

  let prev = seed;
  for (let i = 0; i < period - 1; i++) {
    result.push(Number.NaN);
  }
  result.push(prev);

  for (let i = period; i < closes.length; i++) {
    prev = (closes[i]! - prev) * multiplier + prev;
    result.push(prev);
  }

  return result;
};

const trueRange = (candle: Candle, prevClose: number | undefined): number => {
  const hl = candle.high - candle.low;
  if (prevClose === undefined) {
    return hl;
  }
  return Math.max(hl, Math.abs(candle.high - prevClose), Math.abs(candle.low - prevClose));
};

export const atr = (candles: Candle[], period: number): number[] => {
  const result: number[] = [];
  if (period <= 0 || candles.length === 0) {
    return result;
  }

  const trs: number[] = [];
  let prevClose: number | undefined;

  for (const candle of candles) {
    trs.push(trueRange(candle, prevClose));
    prevClose = candle.close;
  }

  if (trs.length < period) {
    return result;
  }

  let prevAtr = trs.slice(0, period).reduce((acc, tr) => acc + tr, 0) / period;
  for (let i = 0; i < period - 1; i++) {
    result.push(Number.NaN);
  }
  result.push(prevAtr);

  for (let i = period; i < trs.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]!) / period;
    result.push(prevAtr);
  }

  return result;
};

export const last = <T>(arr: T[]): T | undefined => {
  if (arr.length === 0) {
    return undefined;
  }
  return arr[arr.length - 1];
};

export const emaSlopeUp = (emaSeries: number[], lookback = 3): boolean => {
  const end = last(emaSeries);
  const prior = emaSeries[emaSeries.length - 1 - lookback];
  if (end === undefined || prior === undefined || Number.isNaN(end) || Number.isNaN(prior)) {
    return false;
  }
  return end > prior;
};

export const emaSlopeDown = (emaSeries: number[], lookback = 3): boolean => {
  const end = last(emaSeries);
  const prior = emaSeries[emaSeries.length - 1 - lookback];
  if (end === undefined || prior === undefined || Number.isNaN(end) || Number.isNaN(prior)) {
    return false;
  }
  return end < prior;
};

/** RSI (Wilder smoothing). Returns NaN until period bars available. */
export const rsi = (closes: number[], period: number): number[] => {
  const result: number[] = [];
  if (period <= 0 || closes.length <= period) {
    return result;
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) {
      avgGain += change;
    } else {
      avgLoss -= change;
    }
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) {
    result.push(Number.NaN);
  }
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
};
