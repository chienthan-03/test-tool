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
