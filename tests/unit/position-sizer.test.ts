import { describe, it, expect } from 'vitest';
import { calcQuantity } from '../../src/risk/position-sizer.js';

describe('calcQuantity', () => {
  it('2% of 1000', () => {
    const result = calcQuantity({
      availableBalance: 1000,
      positionPercent: 2,
      entryPrice: 100,
      minNotional: 5,
      maxNotional: null,
      stepSize: 0.001,
      minQty: 0.001,
    });

    expect(result).not.toBeNull();
    expect(result!.notional).toBe(20);
    expect(result!.quantity).toBe(0.2);
  });

  it('stepSize floor', () => {
    const result = calcQuantity({
      availableBalance: 1000,
      positionPercent: 2,
      entryPrice: 333,
      minNotional: 5,
      maxNotional: null,
      stepSize: 0.001,
      minQty: 0.001,
    });

    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(0.06);
    expect(result!.notional).toBeCloseTo(0.06 * 333, 5);
  });
});
