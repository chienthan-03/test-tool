/**
 * Unified trade review export (backtest report or SQLite).
 *
 * Usage:
 *   npm run export-trade-review -- --source backtest --report path/report.json --out review.csv
 *   npm run export-trade-review -- --source sqlite --out review.csv [--limit 50]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

const args = process.argv.slice(2);
let source = '';
const forwarded: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--source' && args[i + 1]) {
    source = args[++i]!;
  } else {
    forwarded.push(arg);
  }
}

if (!source) {
  console.error(
    'Usage: --source backtest|sqlite ...\n  backtest: requires --report <report.json>\n  sqlite: optional --limit, --config, --out',
  );
  process.exit(1);
}

const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tsxArgs = ['tsx'];

if (source === 'backtest') {
  tsxArgs.push(join(scriptDir, 'export-backtest-trades-review.ts'), ...forwarded);
} else if (source === 'sqlite') {
  tsxArgs.push(join(scriptDir, 'export-trades-review.ts'), ...forwarded);
} else {
  console.error(`Unknown source: ${source}`);
  process.exit(1);
}

const result = spawnSync(runner, tsxArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
