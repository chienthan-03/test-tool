import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../src/config/schema.js';
import { parseStrictIsoDate } from '../../src/cli/backtest-dates.js';
import type { BacktestReport } from '../../src/core/types.js';
import { cacheFilePath, loadKlines } from '../../src/market/kline-cache.js';
import { intervalToMs } from '../../src/market/timeframe.js';
import type { OptimizeManifest } from './optimize-manifest.js';
import { isPlateau, winRateToPercent } from './optimize-scoring.js';

const WARMUP_BARS = 200;

export type DiagnoseTargets = {
  minWinRate: number;
  targetPnlPercent: number;
  initialBalanceUsdt: number;
};

export type PeriodDiagnose = {
  from: string;
  to: string;
  winRate: number;
  totalPnlUsdt: number;
  totalTrades: number;
};

export type GateRejectSummary = {
  reason: string;
  count: number;
  stage: string;
};

export type ReportAnalysis = {
  weakestPeriod: PeriodDiagnose;
  perPeriod: PeriodDiagnose[];
  gateRejectTop: GateRejectSummary[];
  symbolPnl: Record<string, number>;
  aggregate: {
    totalPnlUsdt: number;
    totalPnlPercent: number;
    minWinRate: number;
    eligible: boolean;
    gapWinRatePoints: number;
    gapPnlPercentPoints: number;
  };
};

export type SuggestedMutation = {
  path: string;
  direction: 'increase' | 'decrease';
  rationale: string;
};

export type DiagnoseResult = {
  klinesOk: boolean;
  klinesWarning: string | null;
  targets: { minWinRate: number; targetPnlPercent: number };
  aggregate: ReportAnalysis['aggregate'];
  weakestPeriod: PeriodDiagnose;
  perPeriod: PeriodDiagnose[];
  gateRejectTop: GateRejectSummary[];
  symbolPnl: Record<string, number>;
  suggestedTier: 'config' | 'code';
  suggestedMutations: SuggestedMutation[];
  plateau: { detected: boolean; iterationsCompared: number };
};

const dateKey = (value: string): string => value.slice(0, 10);

const periodFromReport = (report: BacktestReport): PeriodDiagnose => ({
  from: dateKey(report.from),
  to: dateKey(report.to),
  winRate: winRateToPercent(report.winRate),
  totalPnlUsdt: report.totalPnlUsdt,
  totalTrades: report.totalTrades,
});

const sumSymbolPnl = (reports: BacktestReport[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const report of reports) {
    for (const trade of report.trades) {
      totals[trade.symbol] = (totals[trade.symbol] ?? 0) + trade.pnl;
    }
  }
  return totals;
};

const aggregateGateRejects = (reports: BacktestReport[]): GateRejectSummary[] => {
  const counts = new Map<string, { count: number; stage: string }>();
  for (const report of reports) {
    for (const reject of report.gateRejects ?? []) {
      const existing = counts.get(reject.reason);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(reject.reason, { count: 1, stage: reject.stage });
      }
    }
  }
  return [...counts.entries()]
    .map(([reason, { count, stage }]) => ({ reason, count, stage }))
    .sort((a, b) => b.count - a.count);
};

export const analyzeReports = (
  reports: BacktestReport[],
  targets: DiagnoseTargets,
): ReportAnalysis => {
  const perPeriod = reports.map(periodFromReport);
  const weakestPeriod =
    perPeriod.length > 0
      ? perPeriod.reduce((weakest, p) => (p.winRate < weakest.winRate ? p : weakest))
      : { from: '', to: '', winRate: 0, totalPnlUsdt: 0, totalTrades: 0 };

  const totalPnlUsdt = reports.reduce((sum, r) => sum + r.totalPnlUsdt, 0);
  const totalPnlPercent =
    targets.initialBalanceUsdt > 0
      ? (totalPnlUsdt / targets.initialBalanceUsdt) * 100
      : 0;
  const minWinRate =
    perPeriod.length > 0 ? Math.min(...perPeriod.map((p) => p.winRate)) : 0;
  const eligible = minWinRate >= targets.minWinRate;
  const gapWinRatePoints = Math.max(0, targets.minWinRate - minWinRate);
  const gapPnlPercentPoints = Math.max(0, targets.targetPnlPercent - totalPnlPercent);

  return {
    weakestPeriod,
    perPeriod,
    gateRejectTop: aggregateGateRejects(reports),
    symbolPnl: sumSymbolPnl(reports),
    aggregate: {
      totalPnlUsdt,
      totalPnlPercent,
      minWinRate,
      eligible,
      gapWinRatePoints,
      gapPnlPercentPoints,
    },
  };
};

const gateRejectMutation = (
  top: GateRejectSummary | undefined,
): SuggestedMutation | undefined => {
  if (!top) return undefined;
  switch (top.reason) {
    case 'ema_slope_weak':
      return {
        path: 'strategy.profiles.intraday.emaMomentum.slopeLookback',
        direction: 'increase',
        rationale: `Top gate reject ${top.reason} (${top.count}); tighten entry slope filter`,
      };
    case 'ema_context_flat':
      return {
        path: 'strategy.profiles.intraday.contextEma.flatPercent',
        direction: 'increase',
        rationale: `Top gate reject ${top.reason} (${top.count}); widen flat threshold`,
      };
    case 'ema_not_aligned':
      return {
        path: 'strategy.profiles.intraday.emaMomentum.fastPeriod',
        direction: 'decrease',
        rationale: `Top gate reject ${top.reason} (${top.count}); relax entry EMA alignment`,
      };
    case 'intraday_no_entry_path':
      return {
        path: 'strategy.minAtrPercent',
        direction: 'decrease',
        rationale: `Top gate reject ${top.reason} (${top.count}); allow more entry opportunities`,
      };
    default:
      return {
        path: 'strategy.minAtrPercent',
        direction: 'increase',
        rationale: `Top gate reject ${top.reason} (${top.count}); filter marginal entries`,
      };
  }
};

export const suggestMutations = (
  analysis: ReportAnalysis,
  targets: Pick<DiagnoseTargets, 'minWinRate' | 'targetPnlPercent'>,
): SuggestedMutation[] => {
  const { gapWinRatePoints, gapPnlPercentPoints, eligible } = analysis.aggregate;
  const suggestions: SuggestedMutation[] = [];
  const weakest = analysis.weakestPeriod;
  const topReject = analysis.gateRejectTop[0];

  const push = (mutation: SuggestedMutation): void => {
    if (suggestions.length < 3 && !suggestions.some((s) => s.path === mutation.path)) {
      suggestions.push(mutation);
    }
  };

  if (gapWinRatePoints > 10) {
    push({
      path: 'risk.tpAtrMultiplier',
      direction: 'decrease',
      rationale: `Large win-rate gap (${gapWinRatePoints.toFixed(1)} pts); tighter TP on ${weakest.from}→${weakest.to}`,
    });
    push({
      path: 'risk.slAtrMultiplier',
      direction: 'increase',
      rationale: `Large win-rate gap; wider SL to reduce premature stops`,
    });
    const worstSymbol = Object.entries(analysis.symbolPnl).sort((a, b) => a[1] - b[1])[0];
    if (worstSymbol && worstSymbol[1] < 0) {
      push({
        path: 'symbols',
        direction: 'decrease',
        rationale: `Symbol ${worstSymbol[0]} drags PnL (${worstSymbol[1].toFixed(2)} USDT); consider removing`,
      });
    }
  } else if (gapWinRatePoints >= 5) {
    push({
      path: 'strategy.minAtrPercent',
      direction: 'increase',
      rationale: `Win-rate gap ${gapWinRatePoints.toFixed(1)} pts; filter low-volatility entries`,
    });
    push({
      path: 'strategy.profiles.intraday.emaMomentum.slopeLookback',
      direction: 'increase',
      rationale: `Weakest period ${weakest.winRate.toFixed(1)}% win rate; tighten momentum slope`,
    });
    push({
      path: 'strategy.profiles.intraday.contextEma.flatPercent',
      direction: 'increase',
      rationale: `Win-rate gap ${gapWinRatePoints.toFixed(1)} pts; reduce flat-context entries`,
    });
  } else if (gapWinRatePoints > 0) {
    push({
      path: 'risk.tpAtrMultiplier',
      direction: 'decrease',
      rationale: `Near gate (${gapWinRatePoints.toFixed(1)} pts); fine-tune TP for ${weakest.from}→${weakest.to}`,
    });
    push({
      path: 'risk.slAtrMultiplier',
      direction: 'increase',
      rationale: `Near gate; slight SL widen to improve win rate`,
    });
    push({
      path: 'risk.cooldownAfterLoss.durationHours',
      direction: 'increase',
      rationale: `Near gate; reduce revenge trades after losses`,
    });
  }

  if (!eligible && gapWinRatePoints > 0) {
    const gateMutation = gateRejectMutation(topReject);
    if (gateMutation) push(gateMutation);
  }

  if (eligible && gapPnlPercentPoints > 5) {
    push({
      path: 'risk.tpAtrMultiplier',
      direction: 'increase',
      rationale: `Eligible but PnL gap ${gapPnlPercentPoints.toFixed(1)} pts; widen TP for more profit`,
    });
  }

  return suggestions.slice(0, 3);
};

export const checkKlinesCoverage = async (
  config: AppConfig,
  manifest: OptimizeManifest,
  configPath = 'config/production.yaml',
): Promise<{ ok: boolean; warning?: string; prefetchCommand?: string }> => {
  const periodFroms = manifest.periods.map((p) => parseStrictIsoDate(p.from, 'from'));
  const periodTos = manifest.periods.map((p) => parseStrictIsoDate(p.to, 'to'));
  const minFrom = periodFroms.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
  const maxTo = periodTos.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));

  const contextTf = config.timeframes.context;
  const entryTf = config.timeframes.entry;
  const warmupMs = Math.max(
    WARMUP_BARS * intervalToMs(contextTf),
    WARMUP_BARS * intervalToMs(entryTf),
  );
  const requiredFrom = new Date(minFrom.getTime() - warmupMs);
  const requiredTo = maxTo;
  const cacheDir = config.backtest.klineCacheDir;
  const intervals = [...new Set([contextTf, entryTf])];
  const minFromStr = manifest.periods.find((p) => parseStrictIsoDate(p.from, 'from').getTime() === minFrom.getTime())?.from ?? manifest.periods[0]!.from;
  const maxToStr = manifest.periods.find((p) => parseStrictIsoDate(p.to, 'to').getTime() === maxTo.getTime())?.to ?? manifest.periods[manifest.periods.length - 1]!.to;
  const prefetchCommand = `npm run prefetch-klines -- --config ${configPath} --from ${minFromStr} --to ${maxToStr}`;

  const missing: string[] = [];

  for (const symbol of config.symbols) {
    for (const interval of intervals) {
      const path = cacheFilePath(cacheDir, symbol, interval);
      try {
        await access(path);
      } catch {
        missing.push(`${symbol} ${interval} (file missing)`);
        continue;
      }

      const candles = await loadKlines(path);
      if (candles.length === 0) {
        missing.push(`${symbol} ${interval} (empty cache)`);
        continue;
      }

      const firstOpen = candles[0]!.openTime.getTime();
      const lastClose = candles[candles.length - 1]!.closeTime.getTime();
      if (firstOpen > requiredFrom.getTime() + intervalToMs(interval)) {
        missing.push(
          `${symbol} ${interval} (starts ${new Date(firstOpen).toISOString().slice(0, 10)}, need from ${requiredFrom.toISOString().slice(0, 10)})`,
        );
      }
      if (lastClose < requiredTo.getTime()) {
        missing.push(
          `${symbol} ${interval} (ends ${new Date(lastClose).toISOString().slice(0, 10)}, need to ${requiredTo.toISOString().slice(0, 10)})`,
        );
      }
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      warning: `Kline cache does not cover all manifest periods + warmup: ${missing.join('; ')}`,
      prefetchCommand,
    };
  }

  return { ok: true };
};

type RunLogLine = {
  minWinRate?: number;
  totalPnlPercent?: number;
  tier?: string;
};

const readRunLogMetrics = async (runLogPath: string): Promise<RunLogLine[]> => {
  try {
    const text = await readFile(runLogPath, 'utf8');
    return text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunLogLine)
      .filter((line) => typeof line.minWinRate === 'number' && typeof line.totalPnlPercent === 'number');
  } catch {
    return [];
  }
};

export { isPlateau };

export const runOptimizeDiagnose = async (options: {
  manifest: OptimizeManifest;
  manifestPath?: string;
  candidateId?: string;
  reportPaths?: string[];
  config?: AppConfig;
  configPath?: string;
  leaderboardPath?: string;
  runLogPath?: string;
}): Promise<DiagnoseResult> => {
  const optimizeDir = options.manifest.paths.optimizeDataDir;
  const leaderboardPath = options.leaderboardPath ?? join(optimizeDir, 'leaderboard.json');
  const runLogPath = options.runLogPath ?? join(optimizeDir, 'run-log.jsonl');

  let reportPaths = options.reportPaths ?? [];
  if (reportPaths.length === 0 && options.candidateId) {
    const leaderboard = JSON.parse(await readFile(leaderboardPath, 'utf8')) as {
      entries?: Array<{ candidateId: string; reportPaths?: string[] }>;
    };
    const entry = leaderboard.entries?.find((e) => e.candidateId === options.candidateId);
    reportPaths = entry?.reportPaths ?? [];
    if (reportPaths.length === 0) {
      throw new Error(`No reportPaths for candidate ${options.candidateId} in ${leaderboardPath}`);
    }
  }

  if (reportPaths.length === 0) {
    throw new Error('At least one report path is required (--report or --candidate-id with reportPaths)');
  }

  const reports: BacktestReport[] = [];
  for (const path of reportPaths) {
    const raw = await readFile(path, 'utf8');
    reports.push(JSON.parse(raw) as BacktestReport);
  }

  const initialBalanceUsdt = options.config?.sim.initialBalanceUsdt ?? 600;
  const targets: DiagnoseTargets = {
    minWinRate: options.manifest.targets.minWinRate,
    targetPnlPercent: options.manifest.targets.targetPnlPercent,
    initialBalanceUsdt,
  };

  const analysis = analyzeReports(reports, targets);
  const suggestedMutations = suggestMutations(analysis, targets);

  let klinesOk = true;
  let klinesWarning: string | null = null;
  if (options.config) {
    const configPath = options.configPath ?? options.manifest.seedConfig ?? 'config/production.yaml';
    const klines = await checkKlinesCoverage(options.config, options.manifest, configPath);
    klinesOk = klines.ok;
    klinesWarning = klines.warning ?? null;
  }

  const plateauWindow = options.manifest.targets.plateauWindow ?? 3;
  const plateauEpsilon = options.manifest.targets.plateauEpsilonWinRate ?? 1;
  const runLogLines = await readRunLogMetrics(runLogPath);
  const plateauDetected = isPlateau(runLogLines, plateauWindow, 'minWinRate', plateauEpsilon);

  const gapWinRatePoints = analysis.aggregate.gapWinRatePoints;
  const suggestedTier: 'config' | 'code' =
    plateauDetected && gapWinRatePoints > 10 ? 'code' : 'config';

  return {
    klinesOk,
    klinesWarning,
    targets: {
      minWinRate: targets.minWinRate,
      targetPnlPercent: targets.targetPnlPercent,
    },
    aggregate: analysis.aggregate,
    weakestPeriod: analysis.weakestPeriod,
    perPeriod: analysis.perPeriod,
    gateRejectTop: analysis.gateRejectTop,
    symbolPnl: analysis.symbolPnl,
    suggestedTier,
    suggestedMutations,
    plateau: {
      detected: plateauDetected,
      iterationsCompared: Math.min(runLogLines.length, plateauWindow),
    },
  };
};
