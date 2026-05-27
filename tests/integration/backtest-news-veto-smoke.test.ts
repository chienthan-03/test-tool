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
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const experimentConfigPath = join(projectRoot, 'config/experiments/news-veto-technical.yaml');

describe('backtest-news-veto-smoke integration', () => {
  let config: AppConfig;
  let cacheDir: string;
  let reportDir: string;
  let db: ReturnType<typeof openDatabase> | null = null;

  const from = new Date('2025-01-01T00:00:00.000Z');
  const to = new Date('2025-01-08T00:00:00.000Z');

  beforeAll(async () => {
    config = loadConfig(experimentConfigPath);
    cacheDir = await mkdtemp(join(tmpdir(), 'backtest-veto-klines-'));
    reportDir = await mkdtemp(join(tmpdir(), 'backtest-veto-reports-'));

    config = {
      ...config,
      symbols: ['BTCUSDT'],
      timeframes: {
        context: '15m',
        entry: '5m',
      },
      backtest: {
        ...config.backtest,
        klineCacheDir: cacheDir,
        reportDir,
      },
    };

    const warmupMs = 200 * intervalToMs(config.timeframes.entry);
    const downloadFrom = new Date(from.getTime() - warmupMs);
    const entryBars =
      Math.ceil((to.getTime() - downloadFrom.getTime()) / intervalToMs(config.timeframes.entry)) + 1;

    await writeSyntheticKlines(cacheDir, 'BTCUSDT', '5m', downloadFrom, entryBars, 100, 0.5, 2);
    await writeSyntheticKlines(
      cacheDir,
      'BTCUSDT',
      '15m',
      downloadFrom,
      Math.ceil(entryBars / 3) + 5,
      100,
      1,
      3,
    );
  });

  afterAll(async () => {
    db?.close();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
  });

  it('runs technical backtest with newsVeto and tagged opposing signal', async () => {
    db = openDatabase(':memory:');
    migrate(db);

    const signalCreatedAt = new Date('2025-01-02T12:02:00.000Z');
    const signalRepo = new SignalRepository(db);
    signalRepo.insert({
      id: 'veto-sig-1',
      newsId: 'veto-news-1',
      symbols: ['BTCUSDT'],
      direction: 'short',
      strength: 0.9,
      source: 'rule',
      tags: ['macro'],
      createdAt: signalCreatedAt,
      expiresAt: new Date('2025-01-10T00:00:00.000Z'),
    });

    const report = await runBacktest({
      config,
      db,
      from,
      to,
      symbols: config.symbols,
      mockSentiment: false,
      skipDownload: true,
    });

    expect(config.strategy.triggerMode).toBe('technical');
    expect(config.strategy.newsVeto.enabled).toBe(true);
    expect(report.totalTrades).toBeGreaterThanOrEqual(0);
    expect(report.trades.length).toBe(report.totalTrades);
    expect(report.from).toBe(from.toISOString());
    expect(report.to).toBe(to.toISOString());
  });

  it('throws when newsVeto enabled but no signals in range', async () => {
    const emptyDb = openDatabase(':memory:');
    migrate(emptyDb);

    await expect(
      runBacktest({
        config,
        db: emptyDb,
        from,
        to,
        symbols: config.symbols,
        mockSentiment: false,
        skipDownload: true,
      }),
    ).rejects.toThrow(/required for newsVeto backtest/);

    emptyDb.close();
  });
});
