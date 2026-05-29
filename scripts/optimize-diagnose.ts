import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadConfigWithEnv } from '../src/config/loader.js';
import { loadEnvFile } from '../src/config/load-env.js';
import { parseOptimizeManifest } from './lib/optimize-manifest.js';
import { runOptimizeDiagnose } from './lib/optimize-diagnose.js';

loadEnvFile();

const parseArgs = (argv: string[]) => {
  let manifestPath = 'config/optimize-periods.yaml';
  let candidateId = '';
  let configPath = '';
  const reportPaths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) manifestPath = argv[++i]!;
    else if (arg === '--candidate-id' && argv[i + 1]) candidateId = argv[++i]!;
    else if (arg === '--config' && argv[i + 1]) configPath = argv[++i]!;
    else if (arg === '--report' && argv[i + 1]) reportPaths.push(argv[++i]!);
  }

  return { manifestPath, candidateId, configPath, reportPaths };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.candidateId && args.reportPaths.length === 0) {
    throw new Error(
      'Usage: npm run optimize-diagnose -- [--manifest config/optimize-periods.yaml] (--candidate-id candidate-001 | --report path [--report path ...]) [--config config/path.yaml]',
    );
  }

  const manifestText = await readFile(args.manifestPath, 'utf8');
  const manifest = parseOptimizeManifest(parse(manifestText), args.manifestPath);

  const config = args.configPath ? loadConfigWithEnv(args.configPath) : undefined;
  const configPath = args.configPath || manifest.seedConfig;

  const result = await runOptimizeDiagnose({
    manifest,
    manifestPath: args.manifestPath,
    candidateId: args.candidateId || undefined,
    reportPaths: args.reportPaths.length > 0 ? args.reportPaths : undefined,
    config,
    configPath,
    leaderboardPath: join(manifest.paths.optimizeDataDir, 'leaderboard.json'),
    runLogPath: join(manifest.paths.optimizeDataDir, 'run-log.jsonl'),
  });

  console.log(JSON.stringify(result));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
