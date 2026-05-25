/**
 * Shared CSV schema for manual trade review (Phase 1 + Phase 8).
 */
export const TRADE_REVIEW_HEADERS = [
  'id',
  'source',
  'mode',
  'symbol',
  'side',
  'direction',
  'quantity',
  'entry_price',
  'exit_price',
  'stop_loss',
  'take_profit',
  'exit_reason',
  'pnl_usdt',
  'fees_usdt',
  'news_id',
  'news_signal_id',
  'opened_at',
  'closed_at',
  'setup_quality',
  'news_quality',
  'mtf_aligned',
  'would_take_again',
  'failure_category',
  'notes',
] as const;

export type TradeReviewRow = Partial<Record<(typeof TRADE_REVIEW_HEADERS)[number], string | number>>;

export const escapeCsv = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export const rowToCsvLine = (row: TradeReviewRow): string =>
  TRADE_REVIEW_HEADERS.map((key) => escapeCsv(row[key])).join(',');

export const csvWithHeader = (rows: TradeReviewRow[]): string => {
  const lines = [TRADE_REVIEW_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(rowToCsvLine(row));
  }
  return `${lines.join('\n')}\n`;
};

export const sideToDirection = (side: string): string =>
  side === 'BUY' ? 'long' : side === 'SELL' ? 'short' : side;
