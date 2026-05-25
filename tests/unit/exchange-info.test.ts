import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearExchangeInfoCache,
  getDefaultFilters,
  roundPrice,
  roundQuantity,
} from '../../src/execution/exchange-info.js';

describe('exchange-info', () => {
  beforeEach(() => {
    clearExchangeInfoCache();
  });

  it('round price respects tickSize', () => {
    expect(roundPrice(100.04, 0.1)).toBe(100);
    expect(roundPrice(100.06, 0.1)).toBe(100.1);
  });

  it('round quantity floors to stepSize', () => {
    expect(roundQuantity(0.1234, 0.001)).toBe(0.123);
    expect(roundQuantity(1.0, 0.001)).toBe(1);
  });

  it('provides default filters for expanded symbols', () => {
    for (const symbol of ['SOLUSDT', 'BNBUSDT', 'XRPUSDT']) {
      const filters = getDefaultFilters(symbol);
      expect(filters?.symbol).toBe(symbol);
      expect(filters!.minNotional).toBeGreaterThanOrEqual(5);
    }
  });
});
