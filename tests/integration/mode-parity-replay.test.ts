import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, cp, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { runBacktest } from '../../src/execution/backtest-replayer.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const parityConfigPath = join(projectRoot, 'config/experiments/risk-baseline.yaml');
const fixtureKlineDir = join(projectRoot, 'data/klines');

const metricsSnapshot = (report: Awaited<ReturnType<typeof runBacktest>>) => ({
  totalTrades: report.totalTrades,
  wins: report.wins,
  losses: report.losses,
  winRate: report.winRate,
  totalPnlUsdt: report.totalPnlUsdt,
  maxDrawdownPct: report.maxDrawdownPct,
});

describe('mode parity — backtest replay determinism', () => {
  let config: AppConfig;
  let cacheDir: string;
  let reportDir: string;
  let dbPath: string;
  let db: ReturnType<typeof openDatabase> | null = null;

  beforeAll(async () => {
    config = loadConfig(parityConfigPath);
    config = { ...config, symbols: ['BTCUSDT'] };
    cacheDir = await mkdtemp(join(tmpdir(), 'parity-klines-'));
    reportDir = await mkdtemp(join(tmpdir(), 'parity-reports-'));
    dbPath = join(cacheDir, 'test.db');

    await mkdir(cacheDir, { recursive: true });
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
  });

  afterAll(async () => {
    db?.close();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
  });

  it('two backtest runs on identical inputs produce identical metrics', async () => {
    db = openDatabase(dbPath);
    migrate(db);

    const from = new Date('2024-10-01T00:00:00.000Z');
    const to = new Date('2024-11-01T00:00:00.000Z');
    const opts = {
      config,
      db,
      from,
      to,
      symbols: config.symbols,
      mockSentiment: true,
      skipDownload: true,
    };

    const first = await runBacktest(opts);
    const second = await runBacktest(opts);

    expect(metricsSnapshot(first)).toEqual(metricsSnapshot(second));
    expect(first.trades.length).toBeGreaterThan(0);
  });
});
