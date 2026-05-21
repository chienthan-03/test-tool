import { describe, it, expect } from 'vitest';
import { parseStrictIsoDate, validateBacktestRange } from '../../src/cli/backtest-dates.js';

describe('backtest-dates', () => {
  it('parses strict ISO dates in UTC', () => {
    const date = parseStrictIsoDate('2025-01-01', '--from');
    expect(date.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('rejects typo years like 20216', () => {
    expect(() => parseStrictIsoDate('20216-01-31', '--to')).toThrow(/Invalid --to date/);
  });

  it('rejects ranges over 400 days', () => {
    const from = parseStrictIsoDate('2024-01-01', '--from');
    const to = parseStrictIsoDate('2025-06-01', '--to');
    expect(() => validateBacktestRange(from, to)).toThrow(/max 400/);
  });

  it('accepts a one-month range', () => {
    const from = parseStrictIsoDate('2025-01-01', '--from');
    const to = parseStrictIsoDate('2025-01-31', '--to');
    expect(() => validateBacktestRange(from, to)).not.toThrow();
  });
});
