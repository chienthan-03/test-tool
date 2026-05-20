import { describe, it, expect } from 'vitest';
import { calcSlTp } from '../../src/risk/sl-tp-calculator.js';

describe('calcSlTp', () => {
  it('long SL/TP prices', () => {
    const result = calcSlTp({
      side: 'BUY',
      entryPrice: 100,
      atr: 2,
      slMult: 1.5,
      tpMult: 3,
    });

    expect(result.stopLoss).toBe(97);
    expect(result.takeProfit).toBe(106);
  });
});
