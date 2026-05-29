import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadEnvFile } from '../src/config/load-env.js';
import { loadConfigWithEnv } from '../src/config/loader.js';
import { parseStrictIsoDate, validateBacktestRange } from '../src/cli/backtest-dates.js';
import { runBacktest } from '../src/execution/backtest-replayer.js';
import { openDatabase } from '../src/storage/db.js';
import { migrate } from '../src/storage/migrate.js';
import { parseOptimizeManifest } from './lib/optimize-manifest.js';
import {
  buildLeaderboardFile,
  computeCandidateScore,
  mergeLeaderboardEntry,
  type LeaderboardEntry,
  type PeriodMetrics,
  winRateToPercent,
} from './lib/optimize-scoring.js';

loadEnvFile();

export type BatchSummary = {
  eligible: boolean;
  totalPnlPercent: number;
  minWinRate: number;
  targetMet: boolean;
  candidateId: string;
  totalPnlUsdt: number;
};

const hashText = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

export const parseBatchArgs = (argv: string[]) => {
  let manifestPath = 'config/optimize-periods.yaml';
  let configPath = '';
  let candidateId = '';
  let iteration = 0;
  let skipDownload = false;
  let diagnose = false;
  let tier: 'config' | 'code' | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) manifestPath = argv[++i]!;
    else if (arg === '--config' && argv[i + 1]) configPath = argv[++i]!;
    else if (arg === '--candidate-id' && argv[i + 1]) candidateId = argv[++i]!;
    else if (arg === '--iteration' && argv[i + 1]) iteration = Number(argv[++i]!);
    else if (arg === '--skip-download') skipDownload = true;
    else if (arg === '--diagnose') diagnose = true;
    else if (arg === '--tier' && argv[i + 1]) {
      const value = argv[++i]!;
      if (value !== 'config' && value !== 'code') {
        throw new Error(`Invalid --tier "${value}" (expected config|code)`);
      }
      tier = value;
    }
  }

  if (!configPath || !candidateId) {
    throw new Error(
      'Usage: npm run optimize-batch -- --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 [--iteration 1] [--skip-download] [--diagnose] [--tier config|code]',
    );
  }

  return { manifestPath, configPath, candidateId, iteration, skipDownload, diagnose, tier };
};

export const runOptimizeBatch = async (options: {
  manifestPath: string;
  configPath: string;
  candidateId: string;
  iteration: number;
  skipDownload: boolean;
  diagnose?: boolean;
  tier?: 'config' | 'code';
}): Promise<BatchSummary> => {
  const manifestText = await readFile(options.manifestPath, 'utf8');
  const manifest = parseOptimizeManifest(parse(manifestText), options.manifestPath);
  const manifestSha256 = hashText(manifestText);

  const config = loadConfigWithEnv(options.configPath);
  const optimizeDir = manifest.paths.optimizeDataDir;
  await mkdir(optimizeDir, { recursive: true });

  const db = openDatabase(config.storage.sqlitePath);
  migrate(db);

  const periodMetrics: PeriodMetrics[] = [];
  const reportPaths: string[] = [];

  try {
    for (const [i, period] of manifest.periods.entries()) {
      const from = parseStrictIsoDate(period.from, `periods[${i}].from`);
      const to = parseStrictIsoDate(period.to, `periods[${i}].to`);
      validateBacktestRange(from, to);

      console.error(
        `[${options.candidateId}] backtest ${period.from} → ${period.to} ...`,
      );

      const report = await runBacktest({
        config,
        db,
        from,
        to,
        symbols: config.symbols,
        mockSentiment: false,
        skipDownload: options.skipDownload,
      });

      if (report.reportPath) reportPaths.push(report.reportPath);

      periodMetrics.push({
        from: period.from,
        to: period.to,
        totalPnlUsdt: report.totalPnlUsdt,
        winRate: report.winRate,
        totalTrades: report.totalTrades,
        maxDrawdownPct: report.maxDrawdownPct,
      });

      console.error(
        `[${options.candidateId}] ${period.from}→${period.to} trades=${report.totalTrades} winRate=${(report.winRate * 100).toFixed(1)}% pnl=${report.totalPnlUsdt.toFixed(2)}`,
      );
    }
  } finally {
    db.close();
  }

  const score = computeCandidateScore(
    periodMetrics,
    config.sim.initialBalanceUsdt,
    manifest.targets.minWinRate,
    manifest.targets.targetPnlPercent,
  );

  const entry: LeaderboardEntry = {
    candidateId: options.candidateId,
    configPath: options.configPath,
    eligible: score.eligible,
    totalPnlUsdt: score.totalPnlUsdt,
    totalPnlPercent: score.totalPnlPercent,
    minWinRate: score.minWinRatePercent,
    periods: score.periods.map((p) => ({
      ...p,
      winRate: winRateToPercent(p.winRate),
    })),
    iteration: options.iteration,
    reportPaths,
    ...(options.tier !== undefined ? { tier: options.tier } : {}),
  };

  const leaderboardPath = join(optimizeDir, 'leaderboard.json');
  let existingEntries: LeaderboardEntry[] = [];
  try {
    const raw = JSON.parse(await readFile(leaderboardPath, 'utf8')) as {
      entries?: LeaderboardEntry[];
    };
    existingEntries = raw.entries ?? [];
  } catch {
    existingEntries = [];
  }

  const merged = mergeLeaderboardEntry(existingEntries, entry);
  const leaderboard = buildLeaderboardFile(merged, manifestSha256);
  await writeFile(leaderboardPath, JSON.stringify(leaderboard, null, 2), 'utf8');

  const logLine = {
    ts: new Date().toISOString(),
    candidateId: options.candidateId,
    iteration: options.iteration,
    eligible: score.eligible,
    minWinRate: score.minWinRatePercent,
    totalPnlPercent: score.totalPnlPercent,
    targetMet: score.targetMet,
    reason: score.eligible ? 'ok' : 'below_min_win_rate',
  };
  await appendFile(join(optimizeDir, 'run-log.jsonl'), `${JSON.stringify(logLine)}\n`, 'utf8');

  const summary: BatchSummary = {
    eligible: score.eligible,
    totalPnlPercent: score.totalPnlPercent,
    minWinRate: score.minWinRatePercent,
    targetMet: score.targetMet,
    candidateId: options.candidateId,
    totalPnlUsdt: score.totalPnlUsdt,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (options.diagnose) {
    try {
      const { runOptimizeDiagnose } = await import('./lib/optimize-diagnose.js');
      const diagnosis = await runOptimizeDiagnose({
        manifest,
        candidateId: options.candidateId,
        reportPaths,
        config,
      });
      console.log(JSON.stringify(diagnosis));
    } catch {
      console.log(JSON.stringify({ diagnose: 'pending' }));
    }
  }

  return summary;
};

const main = async (): Promise<void> => {
  const options = parseBatchArgs(process.argv.slice(2));
  await runOptimizeBatch(options);
};

const isMain =
  process.argv[1]?.endsWith('optimize-batch.ts') ||
  process.argv[1]?.endsWith('optimize-batch.js');

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
