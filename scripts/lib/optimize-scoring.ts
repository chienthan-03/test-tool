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
};

export type LeaderboardFile = {
  updatedAt: string;
  manifestSha256: string;
  entries: LeaderboardEntry[];
  best?: { candidateId: string; totalPnlPercent: number };
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

export const buildLeaderboardFile = (
  entries: LeaderboardEntry[],
  manifestSha256: string,
): LeaderboardFile => {
  const best = pickBestEntry(entries);
  return {
    updatedAt: new Date().toISOString(),
    manifestSha256,
    entries,
    best: best
      ? { candidateId: best.candidateId, totalPnlPercent: best.totalPnlPercent }
      : undefined,
  };
};
