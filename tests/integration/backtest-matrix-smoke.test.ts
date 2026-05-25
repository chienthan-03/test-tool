import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { runBacktestMatrix, loadMatrixManifest } from '../../scripts/run-backtest-matrix.js';
import { writeSyntheticKlines } from '../../src/execution/backtest-replayer.js';
import { intervalToMs } from '../../src/market/timeframe.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('backtest-matrix-smoke integration', () => {
  let cacheDir: string;
  let experimentsDir: string;
  let matrixPath: string;
  let config: AppConfig;

  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'matrix-klines-'));
    experimentsDir = await mkdtemp(join(tmpdir(), 'matrix-exp-'));
    matrixPath = join(experimentsDir, 'matrix.yaml');
    config = loadConfig(defaultConfigPath);

    config = {
      ...config,
      symbols: ['BTCUSDT'],
      timeframes: { context: '1h', entry: '15m' },
      backtest: {
        ...config.backtest,
        klineCacheDir: cacheDir,
        reportDir: join(experimentsDir, 'reports'),
      },
    };

    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-01-08T00:00:00.000Z');
    const warmupMs = 200 * intervalToMs(config.timeframes.entry);
    const downloadFrom = new Date(from.getTime() - warmupMs);
    const entryBars =
      Math.ceil((to.getTime() - downloadFrom.getTime()) / intervalToMs(config.timeframes.entry)) + 1;

    await writeSyntheticKlines(cacheDir, 'BTCUSDT', '15m', downloadFrom, entryBars, 100, 0.5, 2);
    await writeSyntheticKlines(cacheDir, 'BTCUSDT', '1h', downloadFrom, Math.ceil(entryBars / 4) + 5, 100, 1, 3);

    const matrix = {
      from: '2025-01-01',
      to: '2025-01-08',
      mockSentiment: true,
      experimentsDir,
      runs: [{ id: 'smoke-run', config: defaultConfigPath }],
    };
    await writeFile(matrixPath, stringify(matrix), 'utf8');
  });

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    await rm(experimentsDir, { recursive: true, force: true });
  });

  it('runs matrix and writes experiments-index.json', async () => {
    const manifest = await loadMatrixManifest(matrixPath);
    const index = await runBacktestMatrix(manifest, { matrixPath });

    expect(index.runs).toHaveLength(1);
    expect(index.runs[0]?.error).toBeUndefined();
    expect(typeof index.runs[0]?.winRate).toBe('number');

    const indexPath = join(experimentsDir, 'experiments-index.json');
    const onDisk = JSON.parse(await readFile(indexPath, 'utf8')) as { runs: unknown[] };
    expect(onDisk.runs).toHaveLength(1);

    const summaryPath = join(experimentsDir, 'smoke-run', 'summary.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { totalTrades: number };
    expect(summary.totalTrades).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
