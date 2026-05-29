/**
 * Integration tests for runOptimizeFinalize (temp manifest + leaderboard).
 *
 * Manual: with a real data/optimize/leaderboard.json from optimize-batch (possibly
 * no eligible entries), `npm run optimize-finalize -- --manifest config/optimize-periods.yaml`
 * should promote best-effort (reason best_effort_near_miss or best_effort_cap) and
 * update config/production.yaml — not exit with no_eligible_candidate.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { runOptimizeFinalize } from '../../scripts/optimize-finalize.js';
import type { LeaderboardEntry, LeaderboardFile } from '../../scripts/lib/optimize-scoring.js';

const entry = (
  overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'candidateId'>,
): LeaderboardEntry => ({
  configPath: '',
  eligible: false,
  totalPnlUsdt: 0,
  totalPnlPercent: 0,
  minWinRate: 0,
  periods: [],
  iteration: 1,
  ...overrides,
});

describe('runOptimizeFinalize', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  const setup = async (opts: {
    leaderboard: LeaderboardFile;
    targetPnlPercent?: number;
    entriesConfig?: Record<string, string>;
  }) => {
    workDir = join(tmpdir(), `optimize-finalize-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dataDir = join(workDir, 'data');
    const configDir = join(workDir, 'config');
    await mkdir(dataDir, { recursive: true });
    await mkdir(configDir, { recursive: true });

    const baseConfig = join(configDir, 'production.yaml');
    await writeFile(baseConfig, 'base: true\n', 'utf8');

    for (const [id, body] of Object.entries(opts.entriesConfig ?? {})) {
      const path = join(configDir, `${id}.yaml`);
      await writeFile(path, body, 'utf8');
      const lbEntry = opts.leaderboard.entries.find((e) => e.candidateId === id);
      if (lbEntry) lbEntry.configPath = path;
    }

    await writeFile(join(dataDir, 'leaderboard.json'), JSON.stringify(opts.leaderboard), 'utf8');

    const manifestPath = join(workDir, 'manifest.yaml');
    await writeFile(
      manifestPath,
      `periods:
  - from: "2024-10-01"
    to: "2024-12-31"
targets:
  targetPnlPercent: ${opts.targetPnlPercent ?? 60}
  minWinRate: 55
  maxIterations: 5
baseConfig: ${baseConfig.replace(/\\/g, '/')}
paths:
  optimizeDataDir: ${dataDir.replace(/\\/g, '/')}
`,
      'utf8',
    );

    return { manifestPath, baseConfig };
  };

  it('promotes eligible best when target met', async () => {
    const { manifestPath, baseConfig } = await setup({
      entriesConfig: { winner: 'mode: paper\n' },
      leaderboard: {
        entries: [
          entry({
            candidateId: 'winner',
            eligible: true,
            totalPnlPercent: 65,
            minWinRate: 58,
          }),
        ],
      },
    });

    const result = await runOptimizeFinalize(manifestPath);
    expect(result).toMatchObject({
      promoted: true,
      reason: 'target_met',
      promotedAs: 'eligible',
      candidateId: 'winner',
      targetMet: true,
    });
    expect(await readFile(baseConfig, 'utf8')).toBe('mode: paper\n');
  });

  it('promotes eligible with best_effort_cap when below target', async () => {
    const { manifestPath, baseConfig } = await setup({
      entriesConfig: { cap: 'threshold: 1\n' },
      leaderboard: {
        entries: [
          entry({
            candidateId: 'cap',
            eligible: true,
            totalPnlPercent: 45,
            minWinRate: 56,
          }),
        ],
      },
    });

    const result = await runOptimizeFinalize(manifestPath);
    expect(result).toMatchObject({
      promoted: true,
      reason: 'best_effort_cap',
      promotedAs: 'eligible',
      targetMet: false,
    });
    expect(await readFile(baseConfig, 'utf8')).toBe('threshold: 1\n');
  });

  it('promotes near-miss when no eligible entries', async () => {
    const { manifestPath, baseConfig } = await setup({
      entriesConfig: { near: 'near_miss: true\n' },
      leaderboard: {
        entries: [
          entry({
            candidateId: 'weak',
            eligible: false,
            totalPnlPercent: 90,
            minWinRate: 40,
          }),
          entry({
            candidateId: 'near',
            eligible: false,
            totalPnlPercent: 10,
            minWinRate: 53,
          }),
        ],
      },
    });

    const result = await runOptimizeFinalize(manifestPath);
    expect(result).toMatchObject({
      promoted: true,
      reason: 'best_effort_near_miss',
      promotedAs: 'near_miss',
      candidateId: 'near',
      targetMet: false,
    });
    expect(await readFile(baseConfig, 'utf8')).toBe('near_miss: true\n');
  });

  it('returns leaderboard_empty without copying', async () => {
    const { manifestPath, baseConfig } = await setup({
      leaderboard: { entries: [] },
    });

    const result = await runOptimizeFinalize(manifestPath);
    expect(result).toEqual({ promoted: false, reason: 'leaderboard_empty' });
    expect(await readFile(baseConfig, 'utf8')).toBe('base: true\n');
  });

  it('returns leaderboard_missing when no leaderboard file', async () => {
    workDir = join(tmpdir(), `optimize-finalize-missing-${Date.now()}`);
    const dataDir = join(workDir, 'data');
    const configDir = join(workDir, 'config');
    await mkdir(dataDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    const baseConfig = join(configDir, 'production.yaml');
    await writeFile(baseConfig, 'unchanged\n', 'utf8');
    const manifestPath = join(workDir, 'manifest.yaml');
    await writeFile(
      manifestPath,
      `periods:
  - from: "2024-10-01"
    to: "2024-12-31"
targets:
  targetPnlPercent: 60
  minWinRate: 55
  maxIterations: 5
baseConfig: ${baseConfig.replace(/\\/g, '/')}
paths:
  optimizeDataDir: ${dataDir.replace(/\\/g, '/')}
`,
      'utf8',
    );

    const result = await runOptimizeFinalize(manifestPath);
    expect(result).toEqual({ promoted: false, reason: 'leaderboard_missing' });
    expect(await readFile(baseConfig, 'utf8')).toBe('unchanged\n');
  });
});
