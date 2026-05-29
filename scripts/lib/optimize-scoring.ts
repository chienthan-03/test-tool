export type PeriodMetrics = {
  from: string;
  to: string;
  totalPnlUsdt: number;
  winRate: number;
  totalTrades: number;
  maxDrawdownPct?: number;
};

export type CandidateScore = {
  totalPnlUsdt: number;
  totalPnlPercent: number;
  minWinRatePercent: number;
  eligible: boolean;
  targetMet: boolean;
  periods: PeriodMetrics[];
};

export type LeaderboardEntry = {
  candidateId: string;
  configPath: string;
  eligible: boolean;
  totalPnlUsdt: number;
  totalPnlPercent: number;
  minWinRate: number;
  periods: PeriodMetrics[];
  iteration: number;
  reportPaths?: string[];
  tier?: 'config' | 'code';
};

export type LeaderboardFile = {
  updatedAt: string;
  manifestSha256: string;
  entries: LeaderboardEntry[];
  best?: { candidateId: string; totalPnlPercent: number };
  bestNearEligible?: { candidateId: string; minWinRate: number; totalPnlPercent: number };
  bestPnl?: { candidateId: string; totalPnlPercent: number; eligible: boolean };
};

export const winRateToPercent = (winRate: number): number => winRate * 100;

export const computeCandidateScore = (
  periods: PeriodMetrics[],
  initialBalanceUsdt: number,
  minWinRateGate: number,
  targetPnlPercent: number,
): CandidateScore => {
  const totalPnlUsdt = periods.reduce((sum, p) => sum + p.totalPnlUsdt, 0);
  const totalPnlPercent =
    initialBalanceUsdt > 0 ? (totalPnlUsdt / initialBalanceUsdt) * 100 : 0;
  const minWinRatePercent =
    periods.length > 0 ? Math.min(...periods.map((p) => winRateToPercent(p.winRate))) : 0;
  const eligible = minWinRatePercent >= minWinRateGate;
  const targetMet = eligible && totalPnlPercent >= targetPnlPercent;

  return {
    totalPnlUsdt,
    totalPnlPercent,
    minWinRatePercent,
    eligible,
    targetMet,
    periods,
  };
};

const entrySortKey = (entry: LeaderboardEntry): [number, number] => [
  entry.eligible ? 1 : 0,
  entry.totalPnlPercent,
];

export const mergeLeaderboardEntry = (
  entries: LeaderboardEntry[],
  next: LeaderboardEntry,
): LeaderboardEntry[] => {
  const filtered = entries.filter((e) => e.candidateId !== next.candidateId);
  return [...filtered, next].sort((a, b) => {
    const [ae, ap] = entrySortKey(a);
    const [be, bp] = entrySortKey(b);
    if (be !== ae) return be - ae;
    return bp - ap;
  });
};

export const pickBestEntry = (entries: LeaderboardEntry[]): LeaderboardEntry | undefined =>
  entries.find((e) => e.eligible);

const sortEligibleByPnl = (entries: LeaderboardEntry[]): LeaderboardEntry[] =>
  [...entries].sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

const sortIneligibleByWinRate = (entries: LeaderboardEntry[]): LeaderboardEntry[] =>
  [...entries].sort((a, b) => {
    if (b.minWinRate !== a.minWinRate) return b.minWinRate - a.minWinRate;
    return b.totalPnlPercent - a.totalPnlPercent;
  });

export const pickMutationParent = (
  entries: LeaderboardEntry[],
  seedConfigPath: string,
): { configPath: string; candidateId?: string; reason: string } => {
  const eligible = entries.filter((e) => e.eligible);
  if (eligible.length > 0) {
    const best = sortEligibleByPnl(eligible)[0]!;
    return {
      configPath: best.configPath,
      candidateId: best.candidateId,
      reason: 'eligible_best_pnl',
    };
  }
  const ineligible = sortIneligibleByWinRate(entries);
  if (ineligible.length > 0) {
    const near = ineligible[0]!;
    return {
      configPath: near.configPath,
      candidateId: near.candidateId,
      reason: 'near_miss_best_win_rate',
    };
  }
  return { configPath: seedConfigPath, reason: 'seed' };
};

export const pickBestEffortEntry = (entries: LeaderboardEntry[]): LeaderboardEntry | undefined => {
  const eligible = entries.filter((e) => e.eligible);
  if (eligible.length > 0) {
    return sortEligibleByPnl(eligible)[0];
  }
  if (entries.length === 0) return undefined;
  return sortIneligibleByWinRate(entries)[0];
};

export const isPlateau = (
  runLogLines: Array<{ minWinRate: number; totalPnlPercent: number }>,
  window: number,
  metric: 'minWinRate' | 'totalPnlPercent',
  epsilon: number,
): boolean => {
  if (runLogLines.length < window) return false;
  const slice = runLogLines.slice(-window);
  const values = slice.map((l) => l[metric]);
  return Math.max(...values) - Math.min(...values) <= epsilon;
};

export const buildLeaderboardFile = (
  entries: LeaderboardEntry[],
  manifestSha256: string,
): LeaderboardFile => {
  const eligible = entries.filter((e) => e.eligible);
  const bestEligible = eligible.length > 0 ? sortEligibleByPnl(eligible)[0] : undefined;

  const ineligible = entries.filter((e) => !e.eligible);
  const bestNear = ineligible.length > 0 ? sortIneligibleByWinRate(ineligible)[0] : undefined;

  const bestPnlEntry =
    entries.length > 0 ? sortEligibleByPnl(entries)[0] : undefined;

  return {
    updatedAt: new Date().toISOString(),
    manifestSha256,
    entries,
    best: bestEligible
      ? { candidateId: bestEligible.candidateId, totalPnlPercent: bestEligible.totalPnlPercent }
      : undefined,
    bestNearEligible: bestNear
      ? {
          candidateId: bestNear.candidateId,
          minWinRate: bestNear.minWinRate,
          totalPnlPercent: bestNear.totalPnlPercent,
        }
      : undefined,
    bestPnl: bestPnlEntry
      ? {
          candidateId: bestPnlEntry.candidateId,
          totalPnlPercent: bestPnlEntry.totalPnlPercent,
          eligible: bestPnlEntry.eligible,
        }
      : undefined,
  };
};
