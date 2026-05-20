import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { runBacktest, writeSyntheticKlines } from '../../src/execution/backtest-replayer.js';
import { intervalToMs } from '../../src/market/timeframe.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('backtest-smoke integration', () => {
  let config: AppConfig;
  let cacheDir: string;
  let reportDir: string;
  let dbPath: string;
  let db: ReturnType<typeof openDatabase> | null = null;

  beforeAll(async () => {
    config = loadConfig(defaultConfigPath);
    cacheDir = await mkdtemp(join(tmpdir(), 'backtest-klines-'));
    reportDir = await mkdtemp(join(tmpdir(), 'backtest-reports-'));
    dbPath = join(cacheDir, 'test.db');

    config = {
      ...config,
      symbols: ['BTCUSDT'],
      backtest: {
        ...config.backtest,
        klineCacheDir: cacheDir,
        reportDir,
      },
      storage: {
        sqlitePath: dbPath,
      },
    };

    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-01-08T00:00:00.000Z');
    const warmupMs = 200 * intervalToMs(config.timeframes.entry);
    const downloadFrom = new Date(from.getTime() - warmupMs);

    const entryBars =
      Math.ceil((to.getTime() - downloadFrom.getTime()) / intervalToMs(config.timeframes.entry)) +
      1;
    const contextBars =
      Math.ceil((to.getTime() - downloadFrom.getTime()) / intervalToMs(config.timeframes.context)) +
      1;

    await writeSyntheticKlines(
      cacheDir,
      'BTCUSDT',
      config.timeframes.entry,
      downloadFrom,
      entryBars,
      40_000,
      150,
    );
    await writeSyntheticKlines(
      cacheDir,
      'BTCUSDT',
      config.timeframes.context,
      downloadFrom,
      contextBars,
      40_000,
      600,
    );
  });

  afterAll(async () => {
    db?.close();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
  });

  it('produces a report with trades using mock sentiment over 7 days', async () => {
    db = openDatabase(dbPath);
    migrate(db);

    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-01-08T00:00:00.000Z');

    const report = await runBacktest({
      config,
      db,
      from,
      to,
      symbols: config.symbols,
      mockSentiment: true,
      skipDownload: true,
    });

    expect(report.trades.length).toBeGreaterThan(0);
    expect(report.totalTrades).toBe(report.trades.length);
    expect(report.from).toBe(from.toISOString());
    expect(report.to).toBe(to.toISOString());
  });
});
