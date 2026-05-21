import { mkdirSync } from 'node:fs';
import { loadEnvFile } from '../src/config/load-env.js';
import { loadConfig } from '../src/config/loader.js';
import { runBacktest } from '../src/execution/backtest-replayer.js';
import { cacheFilePath, downloadKlines } from '../src/market/kline-cache.js';
import { intervalToMs } from '../src/market/timeframe.js';
import { openDatabase } from '../src/storage/db.js';
import { migrate } from '../src/storage/migrate.js';

loadEnvFile();

const TF_ORDER = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'] as const;
const WARMUP_BARS = 200;
const FROM = new Date('2025-01-01T00:00:00.000Z');
const TO = new Date('2026-01-31T23:59:59.999Z');

type BenchRow = {
  context: string;
  entry: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
  maxDrawdownPct: number;
  error?: string;
};

const pairs: Array<{ context: (typeof TF_ORDER)[number]; entry: (typeof TF_ORDER)[number] }> = [];

for (let i = 1; i < TF_ORDER.length; i += 1) {
  for (let j = 0; j < i; j += 1) {
    pairs.push({ context: TF_ORDER[i]!, entry: TF_ORDER[j]! });
  }
}

const main = async (): Promise<void> => {
  const baseConfig = loadConfig('config/default.yaml');
  const symbols = baseConfig.symbols;
  const cacheDir = baseConfig.backtest.klineCacheDir;
  const baseUrl = baseConfig.binance.baseUrl;

  mkdirSync(cacheDir, { recursive: true });

  console.log(`Pre-downloading klines for ${symbols.join(', ')} (${TF_ORDER.join(', ')})...`);

  for (const symbol of symbols) {
    for (const interval of TF_ORDER) {
      const warmupMs = WARMUP_BARS * intervalToMs(interval);
      const downloadFrom = new Date(FROM.getTime() - warmupMs);
      const path = cacheFilePath(cacheDir, symbol, interval);
      process.stdout.write(`  ${symbol} ${interval}... `);
      await downloadKlines(baseUrl, symbol, interval, downloadFrom, TO, cacheDir);
      console.log('ok');
    }
  }

  console.log(`\nRunning ${pairs.length} backtests (${FROM.toISOString().slice(0, 10)} → ${TO.toISOString().slice(0, 10)}, mock-sentiment)\n`);

  const results: BenchRow[] = [];

  for (const { context, entry } of pairs) {
    const label = `${context}/${entry}`;
    process.stdout.write(`[${results.length + 1}/${pairs.length}] ${label}... `);

    try {
      const config = {
        ...baseConfig,
        timeframes: { context, entry },
        backtest: {
          ...baseConfig.backtest,
          reportDir: './data/reports/benchmark-runs',
        },
      };

      const db = openDatabase(':memory:');
      migrate(db);

      const report = await runBacktest({
        config,
        db,
        from: FROM,
        to: TO,
        symbols,
        mockSentiment: true,
        skipDownload: true,
      });

      const row: BenchRow = {
        context,
        entry,
        totalTrades: report.totalTrades,
        wins: report.wins,
        losses: report.losses,
        winRate: report.winRate,
        totalPnlUsdt: report.totalPnlUsdt,
        maxDrawdownPct: report.maxDrawdownPct,
      };
      results.push(row);
      console.log(
        `PnL ${row.totalPnlUsdt.toFixed(2)} USDT | ${row.totalTrades} trades | WR ${(row.winRate * 100).toFixed(1)}%`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        context,
        entry,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnlUsdt: 0,
        maxDrawdownPct: 0,
        error: message,
      });
      console.log(`ERROR: ${message}`);
    }
  }

  const ranked = [...results].sort((a, b) => b.totalPnlUsdt - a.totalPnlUsdt);

  console.log('\n=== TOP 10 (by PnL) ===');
  console.log('Rank | Context/Entry | PnL (USDT) | Trades | Win% | Max DD%');
  console.log('-----|---------------|------------|--------|------|--------');
  ranked.slice(0, 10).forEach((row, idx) => {
    if (row.error) return;
    console.log(
      `${String(idx + 1).padStart(4)} | ${`${row.context}/${row.entry}`.padEnd(13)} | ${row.totalPnlUsdt.toFixed(2).padStart(10)} | ${String(row.totalTrades).padStart(6)} | ${(row.winRate * 100).toFixed(1).padStart(4)} | ${row.maxDrawdownPct.toFixed(2).padStart(6)}`,
    );
  });

  console.log('\n=== BOTTOM 5 (by PnL) ===');
  ranked
    .slice(-5)
    .reverse()
    .forEach((row, idx) => {
      if (row.error) {
        console.log(`${idx + 1}. ${row.context}/${row.entry}: ERROR - ${row.error}`);
        return;
      }
      console.log(
        `${idx + 1}. ${row.context}/${row.entry}: ${row.totalPnlUsdt.toFixed(2)} USDT (${row.totalTrades} trades, WR ${(row.winRate * 100).toFixed(1)}%)`,
      );
    });

  const best = ranked.find((r) => !r.error);
  if (best) {
    console.log(`\nBest: ${best.context}/${best.entry} → +${best.totalPnlUsdt.toFixed(2)} USDT`);
  }

  const outPath = './data/reports/timeframe-benchmark.json';
  await import('node:fs/promises').then(({ writeFile, mkdir }) =>
    mkdir('./data/reports', { recursive: true }).then(() =>
      writeFile(outPath, JSON.stringify({ from: FROM.toISOString(), to: TO.toISOString(), results: ranked }, null, 2)),
    ),
  );
  console.log(`\nFull results: ${outPath}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
