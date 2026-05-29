import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadEnvFile } from '../src/config/load-env.js';
import { parseOptimizeManifest } from './lib/optimize-manifest.js';
import { pickBestEntry, type LeaderboardFile } from './lib/optimize-scoring.js';

loadEnvFile();

export type FinalizeResult = {
  promoted: boolean;
  reason: string;
  candidateId?: string;
  configPath?: string;
  totalPnlPercent?: number;
  targetMet?: boolean;
};

export const runOptimizeFinalize = async (manifestPath: string): Promise<FinalizeResult> => {
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = parseOptimizeManifest(parse(manifestText), manifestPath);
  const leaderboardPath = join(manifest.paths.optimizeDataDir, 'leaderboard.json');

  let leaderboard: LeaderboardFile;
  try {
    leaderboard = JSON.parse(await readFile(leaderboardPath, 'utf8')) as LeaderboardFile;
  } catch {
    return { promoted: false, reason: 'leaderboard_missing' };
  }

  const best = pickBestEntry(leaderboard.entries);
  if (!best) {
    return { promoted: false, reason: 'no_eligible_candidate' };
  }

  const targetMet = best.totalPnlPercent >= manifest.targets.targetPnlPercent;
  await copyFile(best.configPath, manifest.baseConfig);

  return {
    promoted: true,
    reason: targetMet ? 'target_met' : 'best_effort_cap',
    candidateId: best.candidateId,
    configPath: best.configPath,
    totalPnlPercent: best.totalPnlPercent,
    targetMet,
  };
};

const main = async (): Promise<void> => {
  let manifestPath = 'config/optimize-periods.yaml';
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && args[i + 1]) manifestPath = args[++i]!;
  }

  const result = await runOptimizeFinalize(manifestPath);
  console.log(JSON.stringify(result, null, 2));
  if (!result.promoted) process.exit(1);
};

const isMain =
  process.argv[1]?.endsWith('optimize-finalize.ts') ||
  process.argv[1]?.endsWith('optimize-finalize.js');

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
