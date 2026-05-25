import { describe, it, expect } from 'vitest';
import { csvWithHeader, escapeCsv, sideToDirection } from '../../scripts/lib/trade-review-csv.js';

describe('trade-review-csv', () => {
  it('escapes commas in news_id', () => {
    expect(escapeCsv('mock-news-1,extra')).toBe('"mock-news-1,extra"');
  });

  it('maps BUY to long', () => {
    expect(sideToDirection('BUY')).toBe('long');
  });

  it('includes standard headers', () => {
    const csv = csvWithHeader([{ symbol: 'BTCUSDT', pnl_usdt: -10 }]);
    expect(csv.startsWith('id,source,mode,symbol')).toBe(true);
    expect(csv).toContain('would_take_again');
    expect(csv).toContain('BTCUSDT');
  });
});
