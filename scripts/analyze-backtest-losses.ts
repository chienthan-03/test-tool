/**
 * Summarize losing trades from a backtest report.json for Phase 7 risk audit.
 *
 * Usage:
 *   npm run analyze-backtest-losses -- --report data/reports/.../report.json
 */
import { readFile } from 'node:fs/promises';
import type { BacktestReport, BacktestTradeRecord } from '../src/core/types.js';

type SymbolStats = {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
};

const aggregateBySymbol = (trades: BacktestTradeRecord[]): Map<string, SymbolStats> => {
  const map = new Map<string, SymbolStats>();
  for (const t of trades) {
    const row = map.get(t.symbol) ?? { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
    row.trades += 1;
    row.totalPnl += t.pnl;
    if (t.pnl > 0) {
      row.wins += 1;
    } else {
      row.losses += 1;
    }
    map.set(t.symbol, row);
  }
  return map;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let reportPath = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) {
      reportPath = args[++i]!;
    }
  }

  if (!reportPath) {
    console.error('Usage: --report <report.json>');
    process.exit(1);
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8')) as BacktestReport;
  const losses = report.trades.filter((t) => t.pnl <= 0);
  const wins = report.trades.filter((t) => t.pnl > 0);
  const bySymbol = aggregateBySymbol(report.trades);

  console.log(JSON.stringify(
    {
      reportPath,
      window: { from: report.from, to: report.to },
      totalTrades: report.totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate: report.winRate,
      totalPnlUsdt: report.totalPnlUsdt,
      avgLossPnl: losses.length
        ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length
        : 0,
      avgWinPnl: wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
      bySymbol: Object.fromEntries(
        [...bySymbol.entries()].sort((a, b) => a[1].totalPnl - b[1].totalPnl),
      ),
      worstTrades: [...losses].sort((a, b) => a.pnl - b.pnl).slice(0, 5),
    },
    null,
    2,
  ));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
