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
const defaultConfigPath = join(projectRoot, 'config/default.yaml');
const fixtureKlineDir = join(projectRoot, 'data/klines');

describe('backtest-technical-smoke integration', () => {
  let config: AppConfig;
  let cacheDir: string;
  let reportDir: string;
  let dbPath: string;
  let db: ReturnType<typeof openDatabase> | null = null;

  beforeAll(async () => {
    config = loadConfig(defaultConfigPath);
    cacheDir = await mkdtemp(join(tmpdir(), 'backtest-tech-klines-'));
    reportDir = await mkdtemp(join(tmpdir(), 'backtest-tech-reports-'));
    dbPath = join(cacheDir, 'test.db');

    await mkdir(cacheDir, { recursive: true });
    for (const tf of ['15m', '5m']) {
      await cp(
        join(fixtureKlineDir, `BTCUSDT_${tf}.json`),
        join(cacheDir, `BTCUSDT_${tf}.json`),
      );
    }

    config = {
      ...config,
      symbols: ['BTCUSDT'],
      strategy: {
        ...config.strategy,
        triggerMode: 'technical',
        entryProfile: 'intraday',
      },
      timeframes: {
        context: '15m',
        entry: '5m',
      },
      backtest: {
        ...config.backtest,
        klineCacheDir: cacheDir,
        reportDir,
      },
      storage: {
        sqlitePath: dbPath,
      },
    };
  });

  afterAll(async () => {
    db?.close();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
  });

  it('runs backtest without news_signals (technical triggerMode)', async () => {
    db = openDatabase(dbPath);
    migrate(db);

    const from = new Date('2024-10-01T00:00:00.000Z');
    const to = new Date('2024-11-01T00:00:00.000Z');

    const report = await runBacktest({
      config,
      db,
      from,
      to,
      symbols: config.symbols,
      mockSentiment: false,
      skipDownload: true,
    });

    expect(report.totalTrades).toBeGreaterThanOrEqual(0);
    expect(report.trades.length).toBe(report.totalTrades);
    expect(report.from).toBe(from.toISOString());
    expect(report.to).toBe(to.toISOString());
  });
});
