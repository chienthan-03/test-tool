/**
 * Run short parity validation backtest and write metrics JSON.
 *
 * Usage:
 *   npm run parity-check
 */
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/loader.js';
import { runBacktest } from '../src/execution/backtest-replayer.js';
import { openDatabase } from '../src/storage/db.js';
import { migrate } from '../src/storage/migrate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'config/experiments/risk-baseline.yaml');
const fixtureKlineDir = join(root, 'data/klines');
const outPath = join(root, '.planning/phases/09-mode-parity-validation/parity-check-results.json');

const main = async (): Promise<void> => {
  let config = loadConfig(configPath);
  config = { ...config, symbols: ['BTCUSDT'] };

  const cacheDir = await mkdtemp(join(tmpdir(), 'parity-check-'));
  const reportDir = join(cacheDir, 'reports');
  const dbPath = join(cacheDir, 'test.db');

  for (const tf of ['1d', '4h']) {
    await cp(
      join(fixtureKlineDir, `BTCUSDT_${tf}.json`),
      join(cacheDir, `BTCUSDT_${tf}.json`),
    );
  }

  config = {
    ...config,
    backtest: { ...config.backtest, klineCacheDir: cacheDir, reportDir },
    storage: { sqlitePath: dbPath },
  };

  const from = new Date('2024-10-01T00:00:00.000Z');
  const to = new Date('2024-11-01T00:00:00.000Z');

  const db = openDatabase(dbPath);
  migrate(db);

  const report = await runBacktest({
    config,
    db,
    from,
    to,
    symbols: config.symbols,
    mockSentiment: true,
    skipDownload: true,
  });

  db.close();
  await rm(cacheDir, { recursive: true, force: true });

  const payload = {
    executedAt: new Date().toISOString(),
    mode: 'backtest',
    config: configPath,
    from: from.toISOString(),
    to: to.toISOString(),
    metrics: {
      totalTrades: report.totalTrades,
      winRate: report.winRate,
      totalPnlUsdt: report.totalPnlUsdt,
      maxDrawdownPct: report.maxDrawdownPct,
    },
    note: 'Sim/testnet parity documented in MODE-PARITY.md; stack in src/app/paper-trading-stack.ts',
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify(payload, null, 2));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
