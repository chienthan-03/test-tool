/**
 * Export trades from backtest report.json for manual review.
 *
 * Usage:
 *   npm run export-backtest-trades -- --report data/reports/.../report.json --out trades.csv [--limit 5] [--sort worst|best]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { BacktestReport, BacktestTradeRecord } from '../src/core/types.js';

const escapeCsv = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const sideToDirection = (side: string): string =>
  side === 'BUY' ? 'long' : side === 'SELL' ? 'short' : side;

const sortTrades = (
  trades: BacktestTradeRecord[],
  mode: 'worst' | 'best',
): BacktestTradeRecord[] => {
  const sorted = [...trades].sort((a, b) => a.pnl - b.pnl);
  return mode === 'worst' ? sorted : sorted.reverse();
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let reportPath = '';
  let outPath = 'trades-review.csv';
  let limit = 5;
  let sort: 'worst' | 'best' = 'worst';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--report' && args[i + 1]) reportPath = args[++i]!;
    else if (arg === '--out' && args[i + 1]) outPath = args[++i]!;
    else if (arg === '--limit' && args[i + 1]) limit = Number(args[++i]);
    else if (arg === '--sort' && args[i + 1]) sort = args[++i] as 'worst' | 'best';
  }

  if (!reportPath) {
    console.error('Usage: --report <report.json> --out <csv> [--limit N] [--sort worst|best]');
    process.exit(1);
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8')) as BacktestReport;
  const selected = sortTrades(report.trades, sort).slice(0, limit);

  const header =
    'symbol,direction,entry_price,exit_price,pnl_usdt,news_id,would_take_again,notes';
  const lines = selected.map((t) =>
    [
      t.symbol,
      sideToDirection(t.side),
      String(t.entry),
      String(t.exit),
      String(t.pnl),
      escapeCsv(t.newsId),
      '',
      '',
    ].join(','),
  );

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${header}\n${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${selected.length} trades to ${outPath} (${sort}, from ${reportPath})`);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
