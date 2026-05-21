import type { Candle } from '../core/types.js';

export type SwingPoint = {
  index: number;
  price: number;
  type: 'high' | 'low';
  time: Date;
};

/** Fractal-style pivot detection: swing high/low confirmed by `lookback` bars each side. */
export const detectSwings = (candles: Candle[], lookback: number): SwingPoint[] => {
  if (lookback <= 0 || candles.length < lookback * 2 + 1) {
    return [];
  }

  const swings: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const candle = candles[i]!;
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      const left = candles[i - j]!;
      const right = candles[i + j]!;
      if (left.high >= candle.high || right.high > candle.high) {
        isHigh = false;
      }
      if (left.low <= candle.low || right.low < candle.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      swings.push({
        index: i,
        price: candle.high,
        type: 'high',
        time: candle.closeTime,
      });
    }
    if (isLow) {
      swings.push({
        index: i,
        price: candle.low,
        type: 'low',
        time: candle.closeTime,
      });
    }
  }

  swings.sort((a, b) => a.index - b.index);
  return dedupeAdjacent(swings);
};

/** When a bar is both swing high and low (flat), keep the more extreme relative move. */
const dedupeAdjacent = (swings: SwingPoint[]): SwingPoint[] => {
  if (swings.length <= 1) {
    return swings;
  }

  const result: SwingPoint[] = [swings[0]!];
  for (let i = 1; i < swings.length; i++) {
    const prev = result[result.length - 1]!;
    const current = swings[i]!;
    if (current.index === prev.index) {
      continue;
    }
    if (current.type === prev.type) {
      result[result.length - 1] = current;
      continue;
    }
    result.push(current);
  }
  return result;
};

export type ImpulseLeg = {
  start: SwingPoint;
  end: SwingPoint;
  direction: 'up' | 'down';
  range: number;
};

/** Find the impulse leg currently being retraced (wave-3/4 style entry). */
export const findImpulseLegForEntry = (
  swings: SwingPoint[],
  direction: 'long' | 'short',
  price: number,
): ImpulseLeg | null => {
  for (let i = swings.length - 1; i >= 1; i--) {
    const end = swings[i]!;
    const start = swings[i - 1]!;

    if (direction === 'long' && start.type === 'low' && end.type === 'high') {
      const range = end.price - start.price;
      if (range <= 0) {
        continue;
      }
      if (price <= end.price && price >= start.price) {
        return { start, end, direction: 'up', range };
      }
    }

    if (direction === 'short' && start.type === 'high' && end.type === 'low') {
      const range = start.price - end.price;
      if (range <= 0) {
        continue;
      }
      if (price >= end.price && price <= start.price) {
        return { start, end, direction: 'down', range };
      }
    }
  }

  return null;
};

/** Last completed impulsive leg from alternating swings. */
export const lastImpulseLeg = (swings: SwingPoint[]): ImpulseLeg | null => {
  if (swings.length < 2) {
    return null;
  }

  const end = swings[swings.length - 1]!;
  const start = swings[swings.length - 2]!;

  if (start.type === 'low' && end.type === 'high') {
    return {
      start,
      end,
      direction: 'up',
      range: end.price - start.price,
    };
  }

  if (start.type === 'high' && end.type === 'low') {
    return {
      start,
      end,
      direction: 'down',
      range: start.price - end.price,
    };
  }

  return null;
};
