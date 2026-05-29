import { describe, it, expect } from 'vitest';
import {
  buildLeaderboardFile,
  computeCandidateScore,
  isPlateau,
  mergeLeaderboardEntry,
  pickBestEffortEntry,
  pickBestEntry,
  pickMutationParent,
  type PeriodMetrics,
  type LeaderboardEntry,
} from '../../scripts/lib/optimize-scoring.js';

const periods: PeriodMetrics[] = [
  { from: '2024-10-01', to: '2024-12-31', totalPnlUsdt: 200, winRate: 0.58, totalTrades: 40 },
  { from: '2025-10-01', to: '2025-12-31', totalPnlUsdt: 160, winRate: 0.56, totalTrades: 35 },
];

const entry = (
  overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'candidateId'>,
): LeaderboardEntry => ({
  configPath: `config/optimize/${overrides.candidateId}.yaml`,
  eligible: false,
  totalPnlUsdt: 0,
  totalPnlPercent: 0,
  minWinRate: 0,
  periods: [],
  iteration: 1,
  ...overrides,
});

describe('computeCandidateScore', () => {
  it('sums PnL and computes percent from initial balance', () => {
    const score = computeCandidateScore(periods, 600, 55, 60);
    expect(score.totalPnlUsdt).toBe(360);
    expect(score.totalPnlPercent).toBeCloseTo(60, 5);
    expect(score.minWinRatePercent).toBeCloseTo(56, 5);
    expect(score.eligible).toBe(true);
    expect(score.targetMet).toBe(true);
  });

  it('marks ineligible when min win rate below gate', () => {
    const lowWin = [
      { from: 'a', to: 'b', totalPnlUsdt: 500, winRate: 0.48, totalTrades: 10 },
      { from: 'c', to: 'd', totalPnlUsdt: 500, winRate: 0.62, totalTrades: 10 },
    ];
    const score = computeCandidateScore(lowWin, 600, 55, 60);
    expect(score.eligible).toBe(false);
    expect(score.minWinRatePercent).toBeCloseTo(48, 5);
    expect(score.targetMet).toBe(false);
  });
});

describe('mergeLeaderboardEntry', () => {
  it('replaces same candidateId and sorts eligible first by pnl percent', () => {
    const existing: LeaderboardEntry[] = [
      {
        candidateId: 'candidate-001',
        configPath: 'config/optimize/candidate-001.yaml',
        eligible: true,
        totalPnlUsdt: 300,
        totalPnlPercent: 50,
        minWinRate: 56,
        periods: [],
        iteration: 1,
      },
    ];
    const next: LeaderboardEntry = {
      candidateId: 'candidate-002',
      configPath: 'config/optimize/candidate-002.yaml',
      eligible: true,
      totalPnlUsdt: 360,
      totalPnlPercent: 60,
      minWinRate: 57,
      periods: [],
      iteration: 2,
    };
    const merged = mergeLeaderboardEntry(existing, next);
    expect(merged[0]?.candidateId).toBe('candidate-002');
    expect(merged).toHaveLength(2);
  });
});

describe('pickBestEntry', () => {
  it('returns undefined when no eligible entries', () => {
    expect(
      pickBestEntry([
        {
          candidateId: 'x',
          configPath: 'p',
          eligible: false,
          totalPnlUsdt: 999,
          totalPnlPercent: 99,
          minWinRate: 40,
          periods: [],
          iteration: 1,
        },
      ]),
    ).toBeUndefined();
  });
});

describe('pickMutationParent', () => {
  it('prefers eligible highest pnl', () => {
    const parent = pickMutationParent(
      [
        entry({ candidateId: 'a', eligible: true, totalPnlPercent: 50, minWinRate: 56 }),
        entry({ candidateId: 'b', eligible: true, totalPnlPercent: 60, minWinRate: 57 }),
      ],
      'config/production.yaml',
    );
    expect(parent.candidateId).toBe('b');
    expect(parent.configPath).toBe('config/optimize/b.yaml');
    expect(parent.reason).toBe('eligible_best_pnl');
  });

  it('falls back to highest minWinRate when none eligible', () => {
    const parent = pickMutationParent(
      [
        entry({ candidateId: 'low', eligible: false, totalPnlPercent: 90, minWinRate: 40 }),
        entry({ candidateId: 'near', eligible: false, totalPnlPercent: 10, minWinRate: 53 }),
      ],
      'config/production.yaml',
    );
    expect(parent.candidateId).toBe('near');
    expect(parent.reason).toMatch(/near/i);
  });

  it('breaks minWinRate ties by totalPnlPercent among ineligible', () => {
    const parent = pickMutationParent(
      [
        entry({ candidateId: 'tie-low-pnl', eligible: false, totalPnlPercent: 5, minWinRate: 53 }),
        entry({ candidateId: 'tie-high-pnl', eligible: false, totalPnlPercent: 20, minWinRate: 53 }),
      ],
      'config/production.yaml',
    );
    expect(parent.candidateId).toBe('tie-high-pnl');
  });

  it('uses seed when leaderboard empty', () => {
    const parent = pickMutationParent([], 'config/production.yaml');
    expect(parent.configPath).toBe('config/production.yaml');
    expect(parent.candidateId).toBeUndefined();
    expect(parent.reason).toBe('seed');
  });
});

describe('pickBestEffortEntry', () => {
  it('returns eligible best by pnl when any eligible', () => {
    const best = pickBestEffortEntry([
      entry({ candidateId: 'low', eligible: true, totalPnlPercent: 40, minWinRate: 56 }),
      entry({ candidateId: 'high', eligible: true, totalPnlPercent: 55, minWinRate: 57 }),
      entry({ candidateId: 'ghost', eligible: false, totalPnlPercent: 99, minWinRate: 30 }),
    ]);
    expect(best?.candidateId).toBe('high');
  });

  it('returns ineligible best by minWinRate when none eligible', () => {
    const best = pickBestEffortEntry([
      entry({ candidateId: 'low', eligible: false, totalPnlPercent: 90, minWinRate: 40 }),
      entry({ candidateId: 'near', eligible: false, totalPnlPercent: 10, minWinRate: 53 }),
    ]);
    expect(best?.candidateId).toBe('near');
  });

  it('breaks ineligible ties by totalPnlPercent', () => {
    const best = pickBestEffortEntry([
      entry({ candidateId: 'a', eligible: false, totalPnlPercent: 8, minWinRate: 52 }),
      entry({ candidateId: 'b', eligible: false, totalPnlPercent: 15, minWinRate: 52 }),
    ]);
    expect(best?.candidateId).toBe('b');
  });

  it('returns undefined for empty leaderboard', () => {
    expect(pickBestEffortEntry([])).toBeUndefined();
  });
});

describe('isPlateau', () => {
  it('returns true when last 3 minWinRate within epsilon', () => {
    const lines = [
      { minWinRate: 50, totalPnlPercent: 5 },
      { minWinRate: 50.5, totalPnlPercent: 5.2 },
      { minWinRate: 50.8, totalPnlPercent: 5.1 },
    ];
    expect(isPlateau(lines, 3, 'minWinRate', 1)).toBe(true);
  });

  it('returns false when improvement exceeds epsilon', () => {
    const lines = [
      { minWinRate: 48, totalPnlPercent: 5 },
      { minWinRate: 50, totalPnlPercent: 5.2 },
      { minWinRate: 52, totalPnlPercent: 5.1 },
    ];
    expect(isPlateau(lines, 3, 'minWinRate', 1)).toBe(false);
  });

  it('returns false when fewer lines than window', () => {
    const lines = [{ minWinRate: 50, totalPnlPercent: 5 }];
    expect(isPlateau(lines, 3, 'minWinRate', 1)).toBe(false);
  });

  it('uses only the last window slice', () => {
    const lines = [
      { minWinRate: 40, totalPnlPercent: 1 },
      { minWinRate: 50, totalPnlPercent: 5 },
      { minWinRate: 50.5, totalPnlPercent: 5.2 },
      { minWinRate: 50.8, totalPnlPercent: 5.1 },
    ];
    expect(isPlateau(lines, 3, 'minWinRate', 1)).toBe(true);
  });

  it('detects plateau on totalPnlPercent metric', () => {
    const lines = [
      { minWinRate: 50, totalPnlPercent: 10 },
      { minWinRate: 51, totalPnlPercent: 10.2 },
      { minWinRate: 52, totalPnlPercent: 10.5 },
    ];
    expect(isPlateau(lines, 3, 'totalPnlPercent', 1)).toBe(true);
    expect(isPlateau(lines, 3, 'totalPnlPercent', 0.2)).toBe(false);
  });
});

describe('buildLeaderboardFile', () => {
  it('populates best, bestNearEligible, and bestPnl meta fields', () => {
    const entries: LeaderboardEntry[] = [
      entry({ candidateId: 'eligible-low', eligible: true, totalPnlPercent: 45, minWinRate: 56 }),
      entry({ candidateId: 'eligible-high', eligible: true, totalPnlPercent: 55, minWinRate: 57 }),
      entry({ candidateId: 'near', eligible: false, totalPnlPercent: 10, minWinRate: 53 }),
      entry({ candidateId: 'high-pnl', eligible: false, totalPnlPercent: 90, minWinRate: 40 }),
    ];
    const file = buildLeaderboardFile(entries, 'abc123');
    expect(file.manifestSha256).toBe('abc123');
    expect(file.best).toEqual({ candidateId: 'eligible-high', totalPnlPercent: 55 });
    expect(file.bestNearEligible).toEqual({
      candidateId: 'near',
      minWinRate: 53,
      totalPnlPercent: 10,
    });
    expect(file.bestPnl).toEqual({
      candidateId: 'high-pnl',
      totalPnlPercent: 90,
      eligible: false,
    });
  });

  it('omits best when no eligible entries', () => {
    const file = buildLeaderboardFile(
      [entry({ candidateId: 'x', eligible: false, totalPnlPercent: 20, minWinRate: 50 })],
      'sha',
    );
    expect(file.best).toBeUndefined();
    expect(file.bestNearEligible?.candidateId).toBe('x');
    expect(file.bestPnl?.candidateId).toBe('x');
  });
});

describe('finalize picks eligible best', () => {
  it('ignores ineligible high pnl', () => {
    const best = pickBestEntry([
      {
        candidateId: 'bad',
        configPath: 'x.yaml',
        eligible: false,
        totalPnlUsdt: 900,
        totalPnlPercent: 90,
        minWinRate: 40,
        periods: [],
        iteration: 1,
      },
      {
        candidateId: 'good',
        configPath: 'y.yaml',
        eligible: true,
        totalPnlUsdt: 300,
        totalPnlPercent: 50,
        minWinRate: 56,
        periods: [],
        iteration: 2,
      },
    ]);
    expect(best?.candidateId).toBe('good');
  });
});
