# Strategy Optimize Skill Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a repeatable strategy-improve loop: multi-period backtest batch script, leaderboard scoring, and Cursor skills that mutate candidate configs until `totalPnlPercent ≥ target` (default +60%) with `minWinRate` gate (default 55%), then promote winner to `production.yaml`.

**Architecture:** Pure scoring/manifest libs in `scripts/lib/` (unit-tested). `optimize-batch.ts` orchestrates `runBacktest` per manifest period, writes `data/optimize/leaderboard.json` + `run-log.jsonl`, prints JSON summary. Agent skills read manifest, create `config/optimize/candidate-*.yaml`, invoke batch, mutate heuristically, finalize via file copy.

**Tech Stack:** TypeScript, Zod, Vitest, YAML, existing `runBacktest` / `loadConfigWithEnv` / `validateBacktestRange`

**Spec:** `docs/superpowers/specs/2026-05-27-strategy-optimize-skill-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/lib/optimize-manifest.ts` | Create | Parse `optimize-periods.yaml`, Zod schema, defaults |
| `scripts/lib/optimize-scoring.ts` | Create | Aggregate PnL %, eligibility, leaderboard merge/sort |
| `scripts/optimize-batch.ts` | Create | CLI: multi-period backtest + persist artifacts |
| `scripts/optimize-finalize.ts` | Create | Copy best eligible candidate → `baseConfig` |
| `config/optimize-periods.yaml` | Create | Operator manifest (periods, targets, pool) |
| `config/optimize/.gitkeep` | Create | Keep candidates dir in repo |
| `.gitignore` | Modify | Ignore generated `config/optimize/candidate-*.yaml` |
| `package.json` | Modify | Add `optimize-finalize` script (optimize-batch already declared) |
| `tests/unit/optimize-manifest.test.ts` | Create | Manifest parse validation |
| `tests/unit/optimize-scoring.test.ts` | Create | Score/eligibility/leaderboard logic |
| `.cursor/skills/optimize-strategy/SKILL.md` | Create | Main agent workflow |
| `.cursor/skills/optimize-strategy/reference.md` | Create | Bounds, heuristics, report reading |
| `.cursor/skills/optimize-strategy-loop/SKILL.md` | Create | `/loop` composition |
| `docs/LENH-THAM-CHIEU.md` | Modify | Commands for optimize-batch / finalize |

---

### Task 1: Optimize manifest parser

**Files:**
- Create: `scripts/lib/optimize-manifest.ts`
- Create: `config/optimize-periods.yaml`
- Create: `config/optimize/.gitkeep`
- Test: `tests/unit/optimize-manifest.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/optimize-manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseOptimizeManifest } from '../../scripts/lib/optimize-manifest.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = join(projectRoot, 'config/optimize-periods.yaml');

describe('parseOptimizeManifest', () => {
  it('parses config/optimize-periods.yaml', () => {
    const raw = parse(readFileSync(manifestPath, 'utf8'));
    const manifest = parseOptimizeManifest(raw, manifestPath);

    expect(manifest.periods).toHaveLength(2);
    expect(manifest.periods[0]?.from).toBe('2024-10-01');
    expect(manifest.targets.targetPnlPercent).toBe(60);
    expect(manifest.targets.minWinRate).toBe(55);
    expect(manifest.targets.maxIterations).toBe(20);
    expect(manifest.symbolPool).toContain('BTCUSDT');
    expect(manifest.denylist).toContain('mode');
  });

  it('rejects empty periods', () => {
    expect(() =>
      parseOptimizeManifest(
        { periods: [], targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 } },
        'test',
      ),
    ).toThrow(/periods/);
  });

  it('applies path defaults', () => {
    const manifest = parseOptimizeManifest(
      {
        periods: [{ from: '2024-10-01', to: '2024-12-31' }],
        targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 },
      },
      'test',
    );
    expect(manifest.paths.candidatesDir).toBe('config/optimize');
    expect(manifest.paths.optimizeDataDir).toBe('data/optimize');
    expect(manifest.baseConfig).toBe('config/production.yaml');
    expect(manifest.seedConfig).toBe('config/production.yaml');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- tests/unit/optimize-manifest.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create manifest YAML**

Create `config/optimize-periods.yaml`:

```yaml
periods:
  - from: "2024-10-01"
    to: "2024-12-31"
  - from: "2025-10-01"
    to: "2025-12-31"

targets:
  targetPnlPercent: 60
  minWinRate: 55
  maxIterations: 20

baseConfig: config/production.yaml
seedConfig: config/production.yaml

symbolPool:
  - BTCUSDT
  - ETHUSDT
  - XRPUSDT
  - SOLUSDT
  - BNBUSDT

denylist:
  - mode
  - allowLive
  - storage
  - binance.baseUrl
  - binance.testnetBaseUrl
  - feeds
  - sentiment.llm

paths:
  candidatesDir: config/optimize
  optimizeDataDir: data/optimize
```

Create empty `config/optimize/.gitkeep`.

- [ ] **Step 4: Implement parser**

Create `scripts/lib/optimize-manifest.ts`:

```typescript
import { z } from 'zod';
import { parseStrictIsoDate } from '../../src/cli/backtest-dates.js';

const PeriodSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const TargetsSchema = z.object({
  targetPnlPercent: z.number(),
  minWinRate: z.number().min(0).max(100),
  maxIterations: z.number().int().min(1),
});

const PathsSchema = z
  .object({
    candidatesDir: z.string().default('config/optimize'),
    optimizeDataDir: z.string().default('data/optimize'),
    klineCacheDir: z.string().default('./data/klines'),
  })
  .default({
    candidatesDir: 'config/optimize',
    optimizeDataDir: 'data/optimize',
    klineCacheDir: './data/klines',
  });

export const OptimizeManifestSchema = z.object({
  periods: z.array(PeriodSchema).min(1),
  targets: TargetsSchema,
  baseConfig: z.string().default('config/production.yaml'),
  seedConfig: z.string().optional(),
  symbolPool: z.array(z.string().min(1)).default([]),
  denylist: z.array(z.string().min(1)).default([]),
  paths: PathsSchema,
});

export type OptimizeManifest = z.infer<typeof OptimizeManifestSchema>;

export const parseOptimizeManifest = (raw: unknown, manifestPath: string): OptimizeManifest => {
  const parsed = OptimizeManifestSchema.parse(raw);
  const seedConfig = parsed.seedConfig ?? parsed.baseConfig;

  for (const [i, period] of parsed.periods.entries()) {
    const from = parseStrictIsoDate(period.from, `periods[${i}].from`);
    const to = parseStrictIsoDate(period.to, `periods[${i}].to`);
    if (from.getTime() >= to.getTime()) {
      throw new Error(`${manifestPath}: periods[${i}] from must be before to`);
    }
  }

  return { ...parsed, seedConfig };
};
```

- [ ] **Step 5: Run test (expect PASS)**

```bash
npm test -- tests/unit/optimize-manifest.test.ts
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/optimize-manifest.ts config/optimize-periods.yaml config/optimize/.gitkeep tests/unit/optimize-manifest.test.ts
git commit -m "feat(optimize): add optimize-periods manifest parser"
```

---

### Task 2: Scoring and leaderboard logic

**Files:**
- Create: `scripts/lib/optimize-scoring.ts`
- Test: `tests/unit/optimize-scoring.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/optimize-scoring.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- tests/unit/optimize-scoring.test.ts
```

- [ ] **Step 3: Implement scoring lib**

Create `scripts/lib/optimize-scoring.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npm test -- tests/unit/optimize-scoring.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/optimize-scoring.ts tests/unit/optimize-scoring.test.ts
git commit -m "feat(optimize): add candidate scoring and leaderboard helpers"
```

---

### Task 3: optimize-batch CLI

**Files:**
- Create: `scripts/optimize-batch.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add gitignore for generated candidates**

Append to `.gitignore`:

```
config/optimize/candidate-*.yaml
```

- [ ] **Step 2: Implement optimize-batch.ts**

Create `scripts/optimize-batch.ts`:

```typescript
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadEnvFile } from '../src/config/load-env.js';
import { loadConfigWithEnv } from '../src/config/loader.js';
import { parseStrictIsoDate, validateBacktestRange } from '../src/cli/backtest-dates.js';
import { runBacktest } from '../src/execution/backtest-replayer.js';
import { openDatabase } from '../src/storage/db.js';
import { migrate } from '../src/storage/migrate.js';
import { parseOptimizeManifest } from './lib/optimize-manifest.js';
import {
  buildLeaderboardFile,
  computeCandidateScore,
  mergeLeaderboardEntry,
  type LeaderboardEntry,
  type PeriodMetrics,
  winRateToPercent,
} from './lib/optimize-scoring.js';

loadEnvFile();

export type BatchSummary = {
  eligible: boolean;
  totalPnlPercent: number;
  minWinRate: number;
  targetMet: boolean;
  candidateId: string;
  totalPnlUsdt: number;
};

const hashText = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

export const parseBatchArgs = (argv: string[]) => {
  let manifestPath = 'config/optimize-periods.yaml';
  let configPath = '';
  let candidateId = '';
  let iteration = 0;
  let skipDownload = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) manifestPath = argv[++i]!;
    else if (arg === '--config' && argv[i + 1]) configPath = argv[++i]!;
    else if (arg === '--candidate-id' && argv[i + 1]) candidateId = argv[++i]!;
    else if (arg === '--iteration' && argv[i + 1]) iteration = Number(argv[++i]!);
    else if (arg === '--skip-download') skipDownload = true;
  }

  if (!configPath || !candidateId) {
    throw new Error(
      'Usage: npm run optimize-batch -- --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 [--iteration 1] [--skip-download]',
    );
  }

  return { manifestPath, configPath, candidateId, iteration, skipDownload };
};

export const runOptimizeBatch = async (options: {
  manifestPath: string;
  configPath: string;
  candidateId: string;
  iteration: number;
  skipDownload: boolean;
}): Promise<BatchSummary> => {
  const manifestText = await readFile(options.manifestPath, 'utf8');
  const manifest = parseOptimizeManifest(parse(manifestText), options.manifestPath);
  const manifestSha256 = hashText(manifestText);

  const config = loadConfigWithEnv(options.configPath);
  const optimizeDir = manifest.paths.optimizeDataDir;
  await mkdir(optimizeDir, { recursive: true });

  const db = openDatabase(config.storage.sqlitePath);
  migrate(db);

  const periodMetrics: PeriodMetrics[] = [];

  try {
    for (const [i, period] of manifest.periods.entries()) {
      const from = parseStrictIsoDate(period.from, `periods[${i}].from`);
      const to = parseStrictIsoDate(period.to, `periods[${i}].to`);
      validateBacktestRange(from, to);

      console.error(
        `[${options.candidateId}] backtest ${period.from} → ${period.to} ...`,
      );

      const report = await runBacktest({
        config,
        db,
        from,
        to,
        symbols: config.symbols,
        mockSentiment: false,
        skipDownload: options.skipDownload,
      });

      periodMetrics.push({
        from: period.from,
        to: period.to,
        totalPnlUsdt: report.totalPnlUsdt,
        winRate: report.winRate,
        totalTrades: report.totalTrades,
        maxDrawdownPct: report.maxDrawdownPct,
      });

      console.error(
        `[${options.candidateId}] ${period.from}→${period.to} trades=${report.totalTrades} winRate=${(report.winRate * 100).toFixed(1)}% pnl=${report.totalPnlUsdt.toFixed(2)}`,
      );
    }
  } finally {
    db.close();
  }

  const score = computeCandidateScore(
    periodMetrics,
    config.sim.initialBalanceUsdt,
    manifest.targets.minWinRate,
    manifest.targets.targetPnlPercent,
  );

  const entry: LeaderboardEntry = {
    candidateId: options.candidateId,
    configPath: options.configPath,
    eligible: score.eligible,
    totalPnlUsdt: score.totalPnlUsdt,
    totalPnlPercent: score.totalPnlPercent,
    minWinRate: score.minWinRatePercent,
    periods: score.periods.map((p) => ({
      ...p,
      winRate: winRateToPercent(p.winRate),
    })),
    iteration: options.iteration,
  };

  const leaderboardPath = join(optimizeDir, 'leaderboard.json');
  let existingEntries: LeaderboardEntry[] = [];
  try {
    const raw = JSON.parse(await readFile(leaderboardPath, 'utf8')) as {
      entries?: LeaderboardEntry[];
    };
    existingEntries = raw.entries ?? [];
  } catch {
    existingEntries = [];
  }

  const merged = mergeLeaderboardEntry(existingEntries, entry);
  const leaderboard = buildLeaderboardFile(merged, manifestSha256);
  await writeFile(leaderboardPath, JSON.stringify(leaderboard, null, 2), 'utf8');

  const logLine = {
    ts: new Date().toISOString(),
    candidateId: options.candidateId,
    iteration: options.iteration,
    eligible: score.eligible,
    minWinRate: score.minWinRatePercent,
    totalPnlPercent: score.totalPnlPercent,
    targetMet: score.targetMet,
    reason: score.eligible ? 'ok' : 'below_min_win_rate',
  };
  await appendFile(join(optimizeDir, 'run-log.jsonl'), `${JSON.stringify(logLine)}\n`, 'utf8');

  const summary: BatchSummary = {
    eligible: score.eligible,
    totalPnlPercent: score.totalPnlPercent,
    minWinRate: score.minWinRatePercent,
    targetMet: score.targetMet,
    candidateId: options.candidateId,
    totalPnlUsdt: score.totalPnlUsdt,
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
};

const main = async (): Promise<void> => {
  const options = parseBatchArgs(process.argv.slice(2));
  await runOptimizeBatch(options);
};

const isMain =
  process.argv[1]?.endsWith('optimize-batch.ts') ||
  process.argv[1]?.endsWith('optimize-batch.js');

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
```

**Note:** Leaderboard stores period `winRate` as **percent** (0–100) in persisted JSON for human readability; internal scoring uses 0–1 from `BacktestReport`.

- [ ] **Step 3: Smoke-run batch (requires network or cached klines)**

Copy seed config to first candidate:

```bash
mkdir -p config/optimize
cp config/production.yaml config/optimize/candidate-001.yaml
npm run optimize-batch -- --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 --iteration 1 --skip-download
```

Expected: JSON stdout with `eligible`, `totalPnlPercent`, `targetMet`; files `data/optimize/leaderboard.json` and `run-log.jsonl` created.

If `--skip-download` fails (no cache), run once without it or `npm run prefetch-klines` first.

- [ ] **Step 4: Lint**

```bash
npm run lint
npm test
```

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-batch.ts .gitignore
git commit -m "feat(optimize): add optimize-batch multi-period backtest CLI"
```

---

### Task 4: optimize-finalize CLI

**Files:**
- Create: `scripts/optimize-finalize.ts`
- Modify: `package.json`

- [ ] **Step 1: Add npm script**

In `package.json` `"scripts"`:

```json
"optimize-finalize": "tsx scripts/optimize-finalize.ts"
```

- [ ] **Step 2: Implement finalize script**

Create `scripts/optimize-finalize.ts`:

```typescript
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
```

- [ ] **Step 3: Unit test finalize (no backtest)**

Add to `tests/unit/optimize-scoring.test.ts` or new `tests/unit/optimize-finalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pickBestEntry } from '../../scripts/lib/optimize-scoring.js';

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
```

- [ ] **Step 4: Commit**

```bash
git add scripts/optimize-finalize.ts package.json tests/unit/optimize-scoring.test.ts
git commit -m "feat(optimize): add optimize-finalize promotion CLI"
```

---

### Task 5: Cursor skill — optimize-strategy

**Files:**
- Create: `.cursor/skills/optimize-strategy/SKILL.md`
- Create: `.cursor/skills/optimize-strategy/reference.md`

- [ ] **Step 1: Create SKILL.md**

Create `.cursor/skills/optimize-strategy/SKILL.md`:

```markdown
---
name: optimize-strategy
description: Runs multi-period backtests and iteratively mutates trading config to maximize total PnL percent among configs meeting minimum win rate. Use when optimizing strategy, tuning production.yaml, improving backtest PnL, or running the strategy improve loop.
---

# Optimize Strategy

Automated improve loop for this repo. **Do not hand-calculate scores** — always use `npm run optimize-batch`.

## Prerequisites

- Klines cached: `npm run prefetch-klines` (or first batch run downloads).
- `config/optimize-periods.yaml` defines periods + targets.
- Technical mode recommended (`triggerMode: technical`, `newsVeto.enabled: false`).

## Workflow

```
- [ ] Read config/optimize-periods.yaml (periods, targets, symbolPool, denylist)
- [ ] Read data/optimize/leaderboard.json if exists
- [ ] N = max(iteration)+1 from leaderboard, or 1 if missing
- [ ] If N > targets.maxIterations → Finalize (below)
- [ ] Source = best eligible configPath from leaderboard, else seedConfig
- [ ] Copy source → config/optimize/candidate-{NNN}.yaml (zero-padded 3 digits)
- [ ] Apply 1–3 mutations (see reference.md); never edit denylist paths
- [ ] Run batch:
      npm run optimize-batch -- --manifest config/optimize-periods.yaml \
        --config config/optimize/candidate-{NNN}.yaml \
        --candidate-id candidate-{NNN} --iteration N [--skip-download]
- [ ] Parse last JSON stdout line for targetMet
- [ ] If targetMet → Finalize
- [ ] Else read run-log + latest backtest report for mutation hints; repeat or hand off to optimize-strategy-loop
```

## Finalize

```bash
npm run optimize-finalize -- --manifest config/optimize-periods.yaml
```

| Result | Action |
|--------|--------|
| `target_met` | Report success; show diff on production.yaml |
| `best_effort_cap` | Warn target not met; production.yaml updated to best eligible |
| `no_eligible_candidate` | Do NOT edit production.yaml; suggest lowering minWinRate |
| `leaderboard_missing` | Run at least one optimize-batch first |

Post message:

```markdown
## Optimize complete
- Best: {candidateId} (totalPnlPercent X%, minWinRate Y%)
- Target +60%: met / not met
- production.yaml: updated / unchanged
- Leaderboard: data/optimize/leaderboard.json
```

## Rules

- Max **3 param changes** per iteration; document why in chat.
- Keep `sim.leverage` === `binance.margin.leverage`.
- Symbols must stay within `symbolPool`.
- Overfit warning: good backtest ≠ live profit; rotate periods in manifest.

## Reference

See [reference.md](reference.md) for bounds and gate-reject heuristics.
```

- [ ] **Step 2: Create reference.md**

Create `.cursor/skills/optimize-strategy/reference.md` with bounds table and heuristics from spec §8 (EMA ranges, ATR, risk, symbol removal, quantity_too_small → raise maxNotionalUsdt).

Include report paths: `data/reports/backtest-*.json` — read `trades` by symbol, `gateRejects` top reasons.

- [ ] **Step 3: Commit**

```bash
git add .cursor/skills/optimize-strategy/
git commit -m "docs(skill): add optimize-strategy agent skill"
```

---

### Task 6: Cursor skill — optimize-strategy-loop

**Files:**
- Create: `.cursor/skills/optimize-strategy-loop/SKILL.md`

- [ ] **Step 1: Create loop skill**

Create `.cursor/skills/optimize-strategy-loop/SKILL.md`:

```markdown
---
name: optimize-strategy-loop
description: Continues the strategy optimize loop across agent sessions using Cursor loop wakes. Use when optimize-batch runs are long, target PnL not yet met, or the user asks to loop strategy optimization.
---

# Optimize Strategy Loop

Compose with the **loop** skill (`~/.cursor/skills-cursor/loop/SKILL.md`).

## When to use

- `optimize-strategy` finished one batch but `targetMet: false` and `iteration < maxIterations`.
- User says "loop optimize" or "tiếp tục optimize".

## Dynamic loop setup

1. Read `data/optimize/leaderboard.json` for latest `iteration` and `best.totalPnlPercent`.
2. Read `targets.maxIterations` from `config/optimize-periods.yaml`.
3. If done → run `optimize-finalize` and stop.
4. Otherwise arm one-shot wake (PowerShell example):

```powershell
Start-Sleep -Seconds 120
Write-Output 'AGENT_LOOP_WAKE_OPTIMIZE {"prompt":"Continue optimize-strategy from iteration N. Read leaderboard and run next candidate."}'
```

5. On wake: follow `optimize-strategy` checklist from "Determine iteration N".
6. Re-arm until `targetMet`, `iteration >= maxIterations`, or user stops.

## Stop conditions

- JSON summary `targetMet: true`
- `iteration >= maxIterations` → finalize best-effort
- User says stop → kill sleeper PID, do not re-arm

## Payload

Vary prompt each tick with current state:

```json
{"action":"continue","iteration":3,"bestPercent":42.5,"target":60}
```
```

- [ ] **Step 2: Commit**

```bash
git add .cursor/skills/optimize-strategy-loop/
git commit -m "docs(skill): add optimize-strategy-loop skill"
```

---

### Task 7: Operator docs

**Files:**
- Modify: `docs/LENH-THAM-CHIEU.md`

- [ ] **Step 1: Add section**

Append section **Strategy optimize loop**:

```markdown
## Strategy optimize loop

1. Edit periods/targets: `config/optimize-periods.yaml`
2. Seed first candidate: copy `config/production.yaml` → `config/optimize/candidate-001.yaml`
3. Run batch: `npm run optimize-batch -- --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 --iteration 1`
4. Agent: attach `@optimize-strategy` for automated mutations
5. Promote winner: `npm run optimize-finalize -- --manifest config/optimize-periods.yaml`

Artifacts: `data/optimize/leaderboard.json`, `data/optimize/run-log.jsonl`
```

- [ ] **Step 2: Commit**

```bash
git add docs/LENH-THAM-CHIEU.md
git commit -m "docs: add strategy optimize loop commands"
```

---

### Task 8: End-to-end verification

**Files:** (none new)

- [ ] **Step 1: Full test suite**

```bash
npm run lint
npm test
```

- [ ] **Step 2: Two-iteration dry path**

1. Copy `production.yaml` → `candidate-001.yaml`, run batch iteration 1.
2. Copy `candidate-001.yaml` → `candidate-002.yaml`, change one param (e.g. `tpAtrMultiplier: 3.5`), run batch iteration 2.
3. Confirm `leaderboard.json` has 2 entries sorted by eligible + PnL %.
4. Run `optimize-finalize` — confirm `production.yaml` updated to best eligible.

- [ ] **Step 3: Verify skill checklist**

Manually trace `optimize-strategy` SKILL.md steps against artifacts — no manual score math required.

- [ ] **Step 4: Final commit if verification edits needed**

```bash
git status
# commit any fixes
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|------------------|------|
| `optimize-periods.yaml` | Task 1 |
| Multi-period backtest + scoring | Task 2, 3 |
| Leaderboard + run-log | Task 3 |
| Filter min win rate → rank PnL % | Task 2 |
| targetPnlPercent 60 / minWinRate 55 | Task 1 manifest defaults |
| Candidate YAML isolation | Task 3 + gitignore |
| Auto-promote winner | Task 4 + skill finalize |
| Agent skills + loop | Task 5, 6 |
| Denylist in skill instructions | Task 5 |
| package.json optimize-batch | Task 3 (file created; script already in package.json) |
| Acceptance: 2+ iterations | Task 8 |

No placeholders remain. `BacktestReport.winRate` normalized 0–1 → percent in scoring lib.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-27-strategy-optimize-skill.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement all tasks in this session with checkpoints

Which approach?
