import type { SignalDirection } from '../core/types.js';
import type { ImpulseLeg, SwingPoint } from './swing-detector.js';

export type WaveTrend = 'bullish' | 'bearish' | 'sideways';

/** Higher-high / higher-low (or inverse) structure from recent swings. */
export const detectWaveTrend = (swings: SwingPoint[]): WaveTrend => {
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) {
    return 'sideways';
  }

  const lastHigh = highs[highs.length - 1]!;
  const prevHigh = highs[highs.length - 2]!;
  const lastLow = lows[lows.length - 1]!;
  const prevLow = lows[lows.length - 2]!;

  if (lastHigh.price > prevHigh.price && lastLow.price > prevLow.price) {
    return 'bullish';
  }

  if (lastHigh.price < prevHigh.price && lastLow.price < prevLow.price) {
    return 'bearish';
  }

  return 'sideways';
};

/**
 * Simplified Elliott impulse check on the last 5 swings:
 * alternating pivots, wave-3 extends beyond wave-1, wave-2 retrace < 100%.
 */
export const isValidImpulse = (
  swings: SwingPoint[],
  direction: SignalDirection,
  minImpulsePercent: number,
): boolean => {
  if (swings.length < 5) {
    return false;
  }

  const s = swings.slice(-5);
  const expected =
    direction === 'long'
      ? (['low', 'high', 'low', 'high', 'low'] as const)
      : (['high', 'low', 'high', 'low', 'high'] as const);

  for (let i = 0; i < 5; i++) {
    if (s[i]!.type !== expected[i]) {
      return false;
    }
  }

  const w0 = s[0]!.price;
  const w1 = s[1]!.price;
  const w2 = s[2]!.price;
  const w3 = s[3]!.price;
  const w4 = s[4]!.price;

  if (direction === 'long') {
    const wave1 = w1 - w0;
    const wave2Retrace = w1 - w2;
    const wave3 = w3 - w2;
    if (wave1 <= 0 || wave3 <= 0) {
      return false;
    }
    if (wave2Retrace >= wave1) {
      return false;
    }
    if (w3 <= w1) {
      return false;
    }
    if (w4 <= w0) {
      return false;
    }
    if (minImpulsePercent > 0 && (wave3 / wave1) * 100 < minImpulsePercent) {
      return false;
    }
    return true;
  }

  const wave1 = w0 - w1;
  const wave2Retrace = w2 - w1;
  const wave3 = w2 - w3;
  if (wave1 <= 0 || wave3 <= 0) {
    return false;
  }
  if (wave2Retrace >= wave1) {
    return false;
  }
  if (w3 >= w1) {
    return false;
  }
  if (w4 >= w0) {
    return false;
  }
  if (minImpulsePercent > 0 && (wave3 / wave1) * 100 < minImpulsePercent) {
    return false;
  }
  return true;
};

export const impulseMatchesDirection = (
  leg: ImpulseLeg | null,
  direction: SignalDirection,
): boolean => {
  if (!leg || leg.range <= 0) {
    return false;
  }
  return (
    (direction === 'long' && leg.direction === 'up') ||
    (direction === 'short' && leg.direction === 'down')
  );
};
