import { describe, it, expect } from 'vitest';
import { fibTakeProfit, isInRetraceZone } from '../../src/market/fibonacci.js';
import type { ImpulseLeg } from '../../src/market/swing-detector.js';

const upLeg: ImpulseLeg = {
  start: { index: 1, price: 100, type: 'low', time: new Date() },
  end: { index: 10, price: 120, type: 'high', time: new Date() },
  direction: 'up',
  range: 20,
};

describe('fibonacci', () => {
  it('detects price in 38.2-61.8 retrace zone', () => {
    expect(isInRetraceZone(110, upLeg, 0.382, 0.618, 0.05)).toBe(true);
    expect(isInRetraceZone(125, upLeg, 0.382, 0.618, 0.05)).toBe(false);
  });

  it('targets 161.8% extension above impulse high', () => {
    expect(fibTakeProfit(upLeg, 1.618)).toBeCloseTo(132.36, 1);
  });
});
