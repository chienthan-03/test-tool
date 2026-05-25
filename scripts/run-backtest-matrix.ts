import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadEnvFile } from '../src/config/load-env.js';
import { loadConfig } from '../src/config/loader.js';
import type { AppConfig } from '../src/config/schema.js';
import { parseStrictIsoDate, validateBacktestRange } from '../src/cli/backtest-dates.js';
import { runBacktest } from '../src/execution/backtest-replayer.js';
import type { BacktestReport } from '../src/core/types.js';
import { openDatabase } from '../src/storage/db.js';
import { migrate } from '../src/storage/migrate.js';
import { seedSignalsFromConfigPath } from './lib/seed-signals-from-fixtures.js';

loadEnvFile();

export type MatrixRunSpec = {
  id: string;
  config: string;
};

export type MatrixManifest = {
  from: string;
  to: string;
  mockSentiment: boolean;
  experimentsDir: string;
  seedFromFixtures?: boolean;
  seedRepeat?: number;
  runs: MatrixRunSpec[];
};

export type RunSummary = {
  id: string;
  config: string;
  configSha256: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
  maxDrawdownPct: number;
  error?: string;
};

export type ExperimentsIndex = {
  matrix: string;
  from: string;
  to: string;
  mockSentiment: boolean;
  executedAt: string;
  runs: RunSummary[];
};

const hashFile = (contents: string): string =>
  createHash('sha256').update(contents).digest('hex');

export const parseMatrixManifest = (raw: unknown, matrixPath: string): MatrixManifest => {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`Invalid matrix manifest: ${matrixPath}`);
  }

  const m = raw as Record<string, unknown>;
  const from = m.from;
  const to = m.to;
  const mockSentiment = m.mockSentiment;
  const experimentsDir =
    typeof m.experimentsDir === 'string' ? m.experimentsDir : './data/reports/experiments';
  const seedFromFixtures = m.seedFromFixtures === true;
  const seedRepeat = typeof m.seedRepeat === 'number' ? m.seedRepeat : 30;
  const runs = m.runs;

  if (typeof from !== 'string' || typeof to !== 'string') {
    throw new Error(`Matrix ${matrixPath}: from and to must be YYYY-MM-DD strings`);
  }

  parseStrictIsoDate(from, 'from');
  parseStrictIsoDate(to, 'to');

  if (typeof mockSentiment !== 'boolean') {
    throw new Error(`Matrix ${matrixPath}: mockSentiment must be boolean`);
  }

  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error(`Matrix ${matrixPath}: runs must be a non-empty array`);
  }

  const parsedRuns: MatrixRunSpec[] = runs.map((r, i) => {
    if (r === null || typeof r !== 'object') {
      throw new Error(`Matrix ${matrixPath}: run[${i}] invalid`);
    }
    const row = r as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.config !== 'string') {
      throw new Error(`Matrix ${matrixPath}: run[${i}] needs id and config`);
    }
    return { id: row.id, config: row.config };
  });

  return {
    from,
    to,
    mockSentiment,
    experimentsDir,
    seedFromFixtures,
    seedRepeat,
    runs: parsedRuns,
  };
};

export const loadMatrixManifest = async (matrixPath: string): Promise<MatrixManifest> => {
  const text = await readFile(matrixPath, 'utf8');
  const raw = parse(text);
  return parseMatrixManifest(raw, matrixPath);
};

const metricsFromReport = (report: BacktestReport) => ({
  totalTrades: report.totalTrades,
  wins: report.wins,
  losses: report.losses,
  winRate: report.winRate,
  totalPnlUsdt: report.totalPnlUsdt,
  maxDrawdownPct: report.maxDrawdownPct,
});

export const runBacktestMatrix = async (
  manifest: MatrixManifest,
  options: { matrixPath: string; dryRun?: boolean },
): Promise<ExperimentsIndex> => {
  const from = parseStrictIsoDate(manifest.from, 'from');
  const to = parseStrictIsoDate(manifest.to, 'to');
  validateBacktestRange(from, to);

  const experimentsDir = manifest.experimentsDir;
  const tmpDir = join(experimentsDir, '.tmp');

  if (options.dryRun) {
    console.error(`[dry-run] ${manifest.runs.length} run(s), ${manifest.from} → ${manifest.to}`);
    for (const run of manifest.runs) {
      console.error(`  - ${run.id}: ${run.config}`);
    }
    return {
      matrix: options.matrixPath,
      from: manifest.from,
      to: manifest.to,
      mockSentiment: manifest.mockSentiment,
      executedAt: new Date().toISOString(),
      runs: [],
    };
  }

  await mkdir(experimentsDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const summaries: RunSummary[] = [];

  for (const run of manifest.runs) {
    const configText = await readFile(run.config, 'utf8');
    const configSha256 = hashFile(configText);
    let config: AppConfig;

    try {
      config = loadConfig(run.config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summaries.push({
        id: run.id,
        config: run.config,
        configSha256,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnlUsdt: 0,
        maxDrawdownPct: 0,
        error: message,
      });
      console.error(`[${run.id}] config error: ${message}`);
      continue;
    }

    config.backtest.reportDir = join(experimentsDir, run.id);
    const dbPath = manifest.seedFromFixtures
      ? join(experimentsDir, `${run.id}-signals.db`)
      : join(tmpDir, `${run.id}.db`);
    await rm(dbPath, { force: true });

    if (manifest.seedFromFixtures && !manifest.mockSentiment) {
      const discardsPath = join(experimentsDir, 'discards.jsonl');
      console.error(`[${run.id}] seeding signals from fixtures (repeat=${manifest.seedRepeat ?? 30})...`);
      const seedResult = await seedSignalsFromConfigPath({
        configPath: run.config,
        dbPath,
        from: manifest.from,
        to: manifest.to,
        repeat: manifest.seedRepeat ?? 30,
        noLlm: !config.sentiment.llm.enabled,
        discardsPath,
      });
      console.error(
        `[${run.id}] seeded signals=${seedResult.signalsInserted} discards=${seedResult.discards}`,
      );
      if (seedResult.signalsInserted === 0) {
        summaries.push({
          id: run.id,
          config: run.config,
          configSha256,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalPnlUsdt: 0,
          maxDrawdownPct: 0,
          error: 'seed produced zero signals',
        });
        continue;
      }
    }

    const db = openDatabase(dbPath);
    if (!manifest.seedFromFixtures) {
      migrate(db);
    }

    try {
      console.error(`[${run.id}] running backtest...`);
      const report = await runBacktest({
        config,
        db,
        from,
        to,
        symbols: config.symbols,
        mockSentiment: manifest.mockSentiment,
        skipDownload: true,
      });

      const runDir = join(experimentsDir, run.id);
      await mkdir(runDir, { recursive: true });

      const meta = {
        runId: run.id,
        configPath: run.config,
        configSha256,
        from: manifest.from,
        to: manifest.to,
        mockSentiment: manifest.mockSentiment,
        executedAt: new Date().toISOString(),
      };

      await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
      await writeFile(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
      await writeFile(
        join(runDir, 'summary.json'),
        JSON.stringify(metricsFromReport(report), null, 2),
        'utf8',
      );

      summaries.push({
        id: run.id,
        config: run.config,
        configSha256,
        ...metricsFromReport(report),
      });

      console.error(
        `[${run.id}] trades=${report.totalTrades} winRate=${(report.winRate * 100).toFixed(1)}% pnl=${report.totalPnlUsdt.toFixed(2)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summaries.push({
        id: run.id,
        config: run.config,
        configSha256,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnlUsdt: 0,
        maxDrawdownPct: 0,
        error: message,
      });
      console.error(`[${run.id}] failed: ${message}`);
    } finally {
      db.close();
    }
  }

  const index: ExperimentsIndex = {
    matrix: options.matrixPath,
    from: manifest.from,
    to: manifest.to,
    mockSentiment: manifest.mockSentiment,
    executedAt: new Date().toISOString(),
    runs: summaries,
  };

  await writeFile(
    join(experimentsDir, 'experiments-index.json'),
    JSON.stringify(index, null, 2),
    'utf8',
  );

  await writeComparison(experimentsDir, index, manifest.mockSentiment);

  return index;
};

export const writeComparison = async (
  experimentsDir: string,
  index: ExperimentsIndex,
  mockSentiment: boolean,
): Promise<void> => {
  const sorted = [...index.runs].sort((a, b) => b.winRate - a.winRate);
  const lines = [
    '# Backtest Experiment Comparison',
    '',
    `**Matrix:** ${index.matrix}`,
    `**Window:** ${index.from} → ${index.to}`,
    `**Mock sentiment:** ${mockSentiment}`,
    `**Executed:** ${index.executedAt}`,
    '',
    mockSentiment
      ? '> Under `--mock-sentiment`, RSS/rule/LLM presets (e.g. minStrength) do not change signals — expect identical metrics unless strategy/risk config differs.'
      : '',
    '',
    '| runId | totalTrades | winRate | totalPnlUsdt | maxDrawdownPct | config | error |',
    '|-------|-------------|---------|--------------|----------------|--------|-------|',
  ];

  for (const r of sorted) {
    const wr = `${(r.winRate * 100).toFixed(1)}%`;
    lines.push(
      `| ${r.id} | ${r.totalTrades} | ${wr} | ${r.totalPnlUsdt.toFixed(2)} | ${r.maxDrawdownPct.toFixed(2)}% | ${r.config} | ${r.error ?? ''} |`,
    );
  }

  const comparisonPath = join(experimentsDir, 'COMPARISON.md');
  await writeFile(comparisonPath, `${lines.filter((l) => l !== '').join('\n')}\n`, 'utf8');
  console.error(`Wrote ${comparisonPath}`);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let matrixPath = 'config/experiments/matrix.yaml';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--matrix' && args[i + 1]) {
      matrixPath = args[++i]!;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  const manifest = await loadMatrixManifest(matrixPath);
  await runBacktestMatrix(manifest, { matrixPath, dryRun });
};

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('run-backtest-matrix.ts') ||
    process.argv[1].endsWith('run-backtest-matrix.js'));

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
