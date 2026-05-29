import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { BacktestReport } from '../../src/core/types.js';
import type { AppConfig } from '../../src/config/schema.js';
import {
  analyzeReports,
  checkKlinesCoverage,
  suggestMutations,
} from '../../scripts/lib/optimize-diagnose.js';

const fixturePath = join(process.cwd(), 'tests/fixtures/optimize/report-sample.json');

let sampleReport: BacktestReport;

beforeAll(async () => {
  sampleReport = JSON.parse(await readFile(fixturePath, 'utf8')) as BacktestReport;
});

describe('analyzeReports', () => {
  it('picks weakest period by win rate', () => {
    const better: BacktestReport = {
      ...sampleReport,
      from: '2024-10-01T00:00:00.000Z',
      to: '2024-12-31T00:00:00.000Z',
      winRate: 0.62,
      totalPnlUsdt: 20,
      totalTrades: 50,
      trades: [],
      gateRejects: [],
    };
    const analysis = analyzeReports([better, sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    expect(analysis.weakestPeriod.from).toBe('2025-10-01');
    expect(analysis.weakestPeriod.winRate).toBeCloseTo(51.11, 1);
  });

  it('aggregates gate reject counts', () => {
    const analysis = analyzeReports([sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    expect(analysis.gateRejectTop[0]).toEqual({
      reason: 'ema_slope_weak',
      count: 3,
      stage: 'entry',
    });
    expect(analysis.gateRejectTop[1]?.reason).toBe('ema_context_flat');
  });

  it('sums symbol pnl from trades', () => {
    const analysis = analyzeReports([sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    expect(analysis.symbolPnl.BTCUSDT).toBeCloseTo(12.2, 5);
    expect(analysis.symbolPnl.ETHUSDT).toBeCloseTo(-8.2, 5);
  });

  it('computes aggregate gaps and eligibility', () => {
    const analysis = analyzeReports([sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    expect(analysis.aggregate.totalPnlUsdt).toBe(4);
    expect(analysis.aggregate.totalPnlPercent).toBeCloseTo(0.67, 1);
    expect(analysis.aggregate.minWinRate).toBeCloseTo(51.11, 1);
    expect(analysis.aggregate.eligible).toBe(false);
    expect(analysis.aggregate.gapWinRatePoints).toBeCloseTo(8.89, 1);
    expect(analysis.aggregate.gapPnlPercentPoints).toBeCloseTo(59.33, 0);
  });
});

describe('suggestMutations', () => {
  it('returns at most 3 items when win rate below target', () => {
    const analysis = analyzeReports([sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    const mutations = suggestMutations(analysis, {
      minWinRate: 60,
      targetPnlPercent: 60,
    });
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.length).toBeLessThanOrEqual(3);
    expect(mutations.every((m) => m.path && m.direction && m.rationale)).toBe(true);
  });

  it('suggests tighter TP when gap is 5–10 points', () => {
    const analysis = analyzeReports([sampleReport], {
      minWinRate: 60,
      targetPnlPercent: 60,
      initialBalanceUsdt: 600,
    });
    const mutations = suggestMutations(analysis, {
      minWinRate: 60,
      targetPnlPercent: 60,
    });
    expect(mutations.some((m) => m.path === 'strategy.minAtrPercent')).toBe(true);
  });
});

describe('checkKlinesCoverage', () => {
  let cacheDir = '';
  const manifest = {
    periods: [
      { from: '2025-10-01', to: '2025-12-31' },
      { from: '2024-10-01', to: '2024-12-31' },
    ],
    targets: {
      targetPnlPercent: 60,
      minWinRate: 60,
      maxIterations: 20,
      maxCodeIterations: 0,
      plateauWindow: 3,
      plateauEpsilonWinRate: 1,
    },
    baseConfig: 'config/production.yaml',
    seedConfig: 'config/production.yaml',
    symbolPool: ['BTCUSDT'],
    denylist: [],
    paths: {
      candidatesDir: 'config/optimize',
      optimizeDataDir: 'data/optimize',
      klineCacheDir: './data/klines',
    },
  };

  const config = {
    symbols: ['BTCUSDT'],
    timeframes: { context: '4h', entry: '1h' },
    backtest: { klineCacheDir: '' },
  } as AppConfig;

  beforeAll(async () => {
    cacheDir = join(tmpdir(), `optimize-diagnose-klines-${Date.now()}`);
    await mkdir(cacheDir, { recursive: true });
    config.backtest.klineCacheDir = cacheDir;

    const candle = (openTime: string, closeTime: string) => ({
      symbol: 'BTCUSDT',
      interval: '4h',
      openTime,
      closeTime,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      isClosed: true,
    });

    const okCandles = [
      candle('2024-08-01T00:00:00.000Z', '2024-08-01T04:00:00.000Z'),
      candle('2025-12-31T20:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ];
    await writeFile(
      join(cacheDir, 'BTCUSDT_4h.json'),
      JSON.stringify(okCandles),
      'utf8',
    );
    await writeFile(
      join(cacheDir, 'BTCUSDT_1h.json'),
      JSON.stringify(okCandles),
      'utf8',
    );
  });

  afterAll(async () => {
    // temp dir left for OS cleanup
  });

  it('returns ok when cache spans manifest range with warmup', async () => {
    const result = await checkKlinesCoverage(config, manifest, 'config/test.yaml');
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns warning when cache file is missing', async () => {
    const missingConfig = {
      ...config,
      symbols: ['ETHUSDT'],
      backtest: { ...config.backtest, klineCacheDir: cacheDir },
    } as AppConfig;
    const result = await checkKlinesCoverage(missingConfig, manifest);
    expect(result.ok).toBe(false);
    expect(result.warning).toContain('ETHUSDT');
    expect(result.prefetchCommand).toBeDefined();
  });
});
