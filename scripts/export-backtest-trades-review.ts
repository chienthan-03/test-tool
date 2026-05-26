/**
 * Export trades from backtest report.json for manual review.
 *
 * Usage:
 *   npm run export-backtest-trades -- --report data/reports/.../report.json --out trades.csv [--limit 5] [--sort worst|best]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import type { BacktestReport } from '../src/core/types.js';
import {
  csvWithHeader,
  sideToDirection,
  type TradeReviewRow,
} from './lib/trade-review-csv.js';

const sortTrades = (
  report: BacktestReport,
  mode: 'worst' | 'best',
): BacktestReport['trades'] => {
  const sorted = [...report.trades].sort((a, b) => a.pnl - b.pnl);
  return mode === 'worst' ? sorted : sorted.reverse();
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let reportPath = '';
  let outPath = 'trades-review.csv';
  let limit = 5;
  let sort: 'worst' | 'best' = 'worst';
  let exportRejects = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--report' && args[i + 1]) reportPath = args[++i]!;
    else if (arg === '--out' && args[i + 1]) outPath = args[++i]!;
    else if (arg === '--limit' && args[i + 1]) limit = Number(args[++i]);
    else if (arg === '--sort' && args[i + 1]) sort = args[++i] as 'worst' | 'best';
    else if (arg === '--export-rejects') exportRejects = true;
  }

  if (!reportPath) {
    console.error(
      'Usage: --report <report.json> --out <csv> [--limit N] [--sort worst|best] [--export-rejects]',
    );
    process.exit(1);
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8')) as BacktestReport;
  const selected = sortTrades(report, sort).slice(0, limit);
  const runId = basename(dirname(reportPath));

  const rows: TradeReviewRow[] = selected.map((t, index) => ({
    id: `${runId}-${index}`,
    source: 'backtest',
    mode: 'backtest',
    symbol: t.symbol,
    side: t.side,
    direction: sideToDirection(t.side),
    entry_price: t.entry,
    exit_price: t.exit,
    stop_loss: t.stopLoss ?? '',
    take_profit: t.takeProfit ?? '',
    exit_reason: t.exitReason ?? '',
    pnl_usdt: t.pnl,
    news_id: t.newsId,
    entry_path: t.entryPath ?? 'fib',
    opened_at: report.from,
    closed_at: report.to,
  }));

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, csvWithHeader(rows), 'utf8');
  console.log(`Wrote ${selected.length} trades to ${outPath} (${sort}, from ${reportPath})`);

  if (exportRejects && report.gateRejects && report.gateRejects.length > 0) {
    const rejectPath = outPath.replace(/\.csv$/i, '-gate-rejects.csv');
    const rejectHeader = 'symbol,direction,stage,reason,at\n';
    const rejectLines = report.gateRejects.map(
      (r) => `${r.symbol},${r.direction},${r.stage},${r.reason.replace(/,/g, ';')},${r.at}`,
    );
    await writeFile(rejectPath, rejectHeader + rejectLines.join('\n') + '\n', 'utf8');
    console.log(`Wrote ${report.gateRejects.length} gate rejects to ${rejectPath}`);
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
