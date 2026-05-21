import { describe, it, expect } from 'vitest';
import { detectWaveTrend, isValidImpulse } from '../../src/market/elliott-wave.js';
import type { SwingPoint } from '../../src/market/swing-detector.js';

const swings: SwingPoint[] = [
  { index: 1, price: 100, type: 'low', time: new Date() },
  { index: 2, price: 108, type: 'high', time: new Date() },
  { index: 3, price: 104, type: 'low', time: new Date() },
  { index: 4, price: 118, type: 'high', time: new Date() },
  { index: 5, price: 110, type: 'low', time: new Date() },
];

describe('elliott-wave', () => {
  it('detects bullish wave trend from HH/HL', () => {
    expect(detectWaveTrend(swings)).toBe('bullish');
  });

  it('validates simplified 5-wave bullish impulse', () => {
    expect(isValidImpulse(swings, 'long', 80)).toBe(true);
  });
});
