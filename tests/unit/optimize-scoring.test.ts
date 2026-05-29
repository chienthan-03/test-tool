import { describe, it, expect } from 'vitest';
import {
  computeCandidateScore,
  mergeLeaderboardEntry,
  pickBestEntry,
  type PeriodMetrics,
  type LeaderboardEntry,
} from '../../scripts/lib/optimize-scoring.js';

const periods: PeriodMetrics[] = [
  { from: '2024-10-01', to: '2024-12-31', totalPnlUsdt: 200, winRate: 0.58, totalTrades: 40 },
  { from: '2025-10-01', to: '2025-12-31', totalPnlUsdt: 160, winRate: 0.56, totalTrades: 35 },
];

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
