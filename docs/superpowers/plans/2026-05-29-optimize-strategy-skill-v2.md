# Strategy Optimize Skill v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the optimize loop so agents reliably move toward manifest targets via script-backed diagnosis, klines preflight, smarter parent selection, best-effort finalize, and three-tier escalation (CONFIG → CODE → MANIFEST) documented in skills.

**Architecture:** Extend `scripts/lib/optimize-scoring.ts` and `optimize-manifest.ts` (pure, unit-tested). Return `reportPath` from `runBacktest`. New `scripts/lib/optimize-diagnose.ts` holds analysis rules; `scripts/optimize-diagnose.ts` is a thin CLI. `optimize-batch` persists `reportPaths` and optional `--diagnose`. `optimize-finalize` promotes best-effort when no eligible candidate. Skills are documentation-only but required for acceptance.

**Tech Stack:** TypeScript, Zod, Vitest, YAML, existing `runBacktest` / `loadConfigWithEnv` / `prefetch-klines`

**Spec:** `docs/superpowers/specs/2026-05-29-optimize-strategy-skill-v2-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/lib/optimize-scoring.ts` | Modify | `pickMutationParent`, `pickBestEffortEntry`, `isPlateau`, leaderboard meta |
| `scripts/lib/optimize-manifest.ts` | Modify | Optional `plateauWindow`, `plateauEpsilonWinRate`, `maxCodeIterations` |
| `scripts/lib/optimize-diagnose.ts` | Create | Klines check, report analysis, mutation suggestions |
| `scripts/optimize-diagnose.ts` | Create | CLI wrapper |
| `scripts/optimize-batch.ts` | Modify | `reportPaths`, `--diagnose` |
| `scripts/optimize-finalize.ts` | Modify | Best-effort promotion, extended `FinalizeResult` |
| `src/core/types.ts` | Modify | `BacktestReport.reportPath?: string` |
| `src/execution/backtest-replayer.ts` | Modify | Set `report.reportPath` before return |
| `src/cli/commands/backtest.ts` | Modify | Log `reportPath` in summary (optional) |
| `tests/unit/optimize-scoring.test.ts` | Modify | New function tests |
| `tests/unit/optimize-manifest.test.ts` | Modify | Optional target defaults |
| `tests/unit/optimize-diagnose.test.ts` | Create | Fixture-based diagnose tests |
| `tests/fixtures/optimize/` | Create | Minimal `report.json` snippets |
| `package.json` | Modify | `"optimize-diagnose"` script |
| `.cursor/skills/optimize-strategy/SKILL.md` | Modify | v2 workflow, tiers, anti-patterns |
| `.cursor/skills/optimize-strategy/reference.md` | Modify | Gap-to-target table |
| `.cursor/skills/optimize-strategy/reference-code.md` | Create | Tier 2 allowed files + tests |
| `.cursor/skills/optimize-strategy-loop/SKILL.md` | Modify | Wake payload, finalize-before-stop |
| `docs/LENH-THAM-CHIEU.md` | Modify | `optimize-diagnose` commands |
| `config/optimize-periods.yaml` | Modify (optional) | Add commented optional target keys |

**Out of scope for this plan:** Automated tier-2 code changes (agent applies per `reference-code.md` when plateau detected). No Optuna/grid search.

---

### Task 1: Manifest optional target fields

**Files:**
- Modify: `scripts/lib/optimize-manifest.ts`
- Modify: `tests/unit/optimize-manifest.test.ts`
- Modify: `config/optimize-periods.yaml` (commented examples only)

- [ ] **Step 1: Extend Zod schema**

In `scripts/lib/optimize-manifest.ts`, extend `TargetsSchema`:

```typescript
const TargetsSchema = z.object({
  targetPnlPercent: z.number(),
  minWinRate: z.number().min(0).max(100),
  maxIterations: z.number().int().min(1),
  maxCodeIterations: z.number().int().min(0).default(0),
  plateauWindow: z.number().int().min(2).default(3),
  plateauEpsilonWinRate: z.number().min(0).default(1),
});
```

Export type unchanged (`OptimizeManifest` infers).

- [ ] **Step 2: Add failing test**

In `tests/unit/optimize-manifest.test.ts`:

```typescript
it('applies plateau target defaults', () => {
  const manifest = parseOptimizeManifest(
    {
      periods: [{ from: '2024-10-01', to: '2024-12-31' }],
      targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 },
    },
    'test',
  );
  expect(manifest.targets.plateauWindow).toBe(3);
  expect(manifest.targets.plateauEpsilonWinRate).toBe(1);
  expect(manifest.targets.maxCodeIterations).toBe(0);
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/unit/optimize-manifest.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/optimize-manifest.ts tests/unit/optimize-manifest.test.ts config/optimize-periods.yaml
git commit -m "feat(optimize): optional plateau targets in manifest schema"
```

---

### Task 2: Scoring lib — parent pick, best-effort, plateau, leaderboard meta

**Files:**
- Modify: `scripts/lib/optimize-scoring.ts`
- Modify: `tests/unit/optimize-scoring.test.ts`

- [ ] **Step 1: Extend types**

```typescript
export type LeaderboardEntry = {
  // ...existing fields...
  reportPaths?: string[];
  tier?: 'config' | 'code';
};

export type LeaderboardFile = {
  // ...existing...
  best?: { candidateId: string; totalPnlPercent: number };
  bestNearEligible?: { candidateId: string; minWinRate: number; totalPnlPercent: number };
  bestPnl?: { candidateId: string; totalPnlPercent: number; eligible: boolean };
};
```

- [ ] **Step 2: Write failing tests for `pickMutationParent`**

```typescript
describe('pickMutationParent', () => {
  it('prefers eligible highest pnl', () => {
    const parent = pickMutationParent(
      [
        { candidateId: 'a', eligible: true, totalPnlPercent: 50, minWinRate: 56, /* ... */ },
        { candidateId: 'b', eligible: true, totalPnlPercent: 60, minWinRate: 57, /* ... */ },
      ],
      'config/production.yaml',
    );
    expect(parent.candidateId).toBe('b');
  });

  it('falls back to highest minWinRate when none eligible', () => {
    const parent = pickMutationParent(
      [
        { candidateId: 'low', eligible: false, totalPnlPercent: 90, minWinRate: 40, /* ... */ },
        { candidateId: 'near', eligible: false, totalPnlPercent: 10, minWinRate: 53, /* ... */ },
      ],
      'config/production.yaml',
    );
    expect(parent.candidateId).toBe('near');
    expect(parent.reason).toMatch(/near/i);
  });

  it('uses seed when leaderboard empty', () => {
    const parent = pickMutationParent([], 'config/production.yaml');
    expect(parent.configPath).toBe('config/production.yaml');
  });
});
```

Fill required `LeaderboardEntry` fields in test objects (copy from existing tests).

- [ ] **Step 3: Write failing tests for `pickBestEffortEntry` and `isPlateau`**

```typescript
describe('pickBestEffortEntry', () => {
  it('returns eligible best by pnl when any eligible', () => { /* ... */ });
  it('returns ineligible best by minWinRate when none eligible', () => { /* ... */ });
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
  it('returns false when improvement exceeds epsilon', () => { /* ... */ });
});
```

- [ ] **Step 4: Run tests (expect FAIL)**

```bash
npm test -- tests/unit/optimize-scoring.test.ts
```

- [ ] **Step 5: Implement functions**

```typescript
export const pickMutationParent = (
  entries: LeaderboardEntry[],
  seedConfigPath: string,
): { configPath: string; candidateId?: string; reason: string } => {
  const eligible = entries.filter((e) => e.eligible);
  if (eligible.length > 0) {
    const best = [...eligible].sort((a, b) => b.totalPnlPercent - a.totalPnlPercent)[0]!;
    return { configPath: best.configPath, candidateId: best.candidateId, reason: 'eligible_best_pnl' };
  }
  const ineligible = [...entries].sort((a, b) => {
    if (b.minWinRate !== a.minWinRate) return b.minWinRate - a.minWinRate;
    return b.totalPnlPercent - a.totalPnlPercent;
  });
  if (ineligible.length > 0) {
    const near = ineligible[0]!;
    return { configPath: near.configPath, candidateId: near.candidateId, reason: 'near_miss_best_win_rate' };
  }
  return { configPath: seedConfigPath, reason: 'seed' };
};

export const pickBestEffortEntry = (entries: LeaderboardEntry[]): LeaderboardEntry | undefined => {
  const eligible = entries.filter((e) => e.eligible);
  if (eligible.length > 0) {
    return [...eligible].sort((a, b) => b.totalPnlPercent - a.totalPnlPercent)[0];
  }
  if (entries.length === 0) return undefined;
  return [...entries].sort((a, b) => {
    if (b.minWinRate !== a.minWinRate) return b.minWinRate - a.minWinRate;
    return b.totalPnlPercent - a.totalPnlPercent;
  })[0];
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
```

Update `buildLeaderboardFile` to set `best`, `bestNearEligible`, `bestPnl`.

- [ ] **Step 6: Run tests (expect PASS)**

```bash
npm test -- tests/unit/optimize-scoring.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/optimize-scoring.ts tests/unit/optimize-scoring.test.ts
git commit -m "feat(optimize): parent pick, plateau detection, leaderboard meta"
```

---

### Task 3: `reportPath` on backtest reports

**Files:**
- Modify: `src/core/types.ts` (`BacktestReport`)
- Modify: `src/execution/backtest-replayer.ts`
- Modify: `src/cli/commands/backtest.ts` (optional log line)

- [ ] **Step 1: Add field to type**

In `src/core/types.ts`, on `BacktestReport`:

```typescript
reportPath?: string;
```

- [ ] **Step 2: Set path before return**

In `backtest-replayer.ts` after `writeFile`:

```typescript
report.reportPath = reportPath;
return report;
```

- [ ] **Step 3: Run existing integration smoke**

```bash
npm test -- tests/integration/backtest-technical-smoke.test.ts
```

Expected: PASS (no assertion on new field required).

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/execution/backtest-replayer.ts src/cli/commands/backtest.ts
git commit -m "feat(backtest): expose reportPath on BacktestReport"
```

---

### Task 4: `optimize-batch` — persist `reportPaths`, optional `--diagnose`

**Files:**
- Modify: `scripts/optimize-batch.ts`
- Test: extend `tests/unit/optimize-scoring.test.ts` or add `tests/unit/optimize-batch.test.ts` (mock `runBacktest` if needed; prefer light integration)

- [ ] **Step 1: Collect report paths in batch loop**

```typescript
const reportPaths: string[] = [];
// inside period loop:
const report = await runBacktest({ ... });
if (report.reportPath) reportPaths.push(report.reportPath);
```

- [ ] **Step 2: Attach to leaderboard entry**

```typescript
const entry: LeaderboardEntry = {
  // ...existing,
  reportPaths,
  tier: options.tier, // optional CLI --tier config|code, default omit
};
```

- [ ] **Step 3: Add `--diagnose` flag**

Parse `--diagnose` in `parseBatchArgs`. After printing batch summary JSON, if set:

```typescript
import { runOptimizeDiagnose } from './lib/optimize-diagnose.js';
const diagnosis = await runOptimizeDiagnose({ manifest, candidateId, reportPaths, config });
console.log(JSON.stringify(diagnosis));
```

(Implement `runOptimizeDiagnose` in Task 5 first, or stub returning `{}` then wire in Task 5.)

- [ ] **Step 4: Manual smoke**

```bash
npx tsx scripts/optimize-batch.ts \
  --manifest config/optimize-periods.yaml \
  --config config/production.yaml \
  --candidate-id smoke-v2 \
  --iteration 99 \
  --skip-download
```

Expected: last JSON line has `candidateId`; `data/optimize/leaderboard.json` entry includes `reportPaths` array with 2 paths.

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-batch.ts
git commit -m "feat(optimize): store reportPaths on batch leaderboard entries"
```

---

### Task 5: Diagnose library + CLI

**Files:**
- Create: `scripts/lib/optimize-diagnose.ts`
- Create: `scripts/optimize-diagnose.ts`
- Create: `tests/fixtures/optimize/report-two-periods.json` (minimal)
- Create: `tests/unit/optimize-diagnose.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Create fixture**

`tests/fixtures/optimize/report-q4-2025.json` — small report with `gateRejects`, `trades` (2 symbols), `winRate`, `totalPnlUsdt`.

- [ ] **Step 2: Failing tests for analysis helpers**

```typescript
import { analyzeReports, checkKlinesCoverage, suggestMutations } from '../../scripts/lib/optimize-diagnose.js';

describe('analyzeReports', () => {
  it('picks weakest period by win rate', () => { /* load fixture */ });
  it('aggregates gate reject counts', () => { /* ... */ });
  it('sums symbol pnl', () => { /* ... */ });
});

describe('suggestMutations', () => {
  it('returns at most 3 items when win rate below target', () => { /* ... */ });
});
```

- [ ] **Step 3: Implement `scripts/lib/optimize-diagnose.ts`**

Exports:

- `checkKlinesCoverage(config, manifest): { ok: boolean; warning?: string; prefetchCommand?: string }`
  - Reuse `loadKlines` / `cacheFilePath` from `src/market/kline-cache.js`
  - Warmup: 200 bars × max(context, entry) interval (mirror `prefetch-klines.ts`)
- `analyzeReports(reports: BacktestReport[], targets): { weakestPeriod, perPeriod, gateRejectTop, symbolPnl, aggregate }`
- `suggestMutations(analysis, targets): SuggestedMutation[]` — rule table from spec §5.1 / reference gap table
- `runOptimizeDiagnose(options): DiagnoseResult` — combines klines, analysis, plateau from run-log

- [ ] **Step 4: CLI `scripts/optimize-diagnose.ts`**

Parse:

- `--manifest`, `--candidate-id`, `--report` (repeatable), `--config`

Load reports from paths; if `--candidate-id`, read `leaderboard.json` entry `reportPaths`.

Print one JSON line; exit `1` on missing files.

- [ ] **Step 5: Add npm script**

```json
"optimize-diagnose": "tsx scripts/optimize-diagnose.ts"
```

- [ ] **Step 6: Run unit tests**

```bash
npm test -- tests/unit/optimize-diagnose.test.ts
```

- [ ] **Step 7: Wire `--diagnose` in batch (if stubbed in Task 4)**

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/optimize-diagnose.ts scripts/optimize-diagnose.ts tests/unit/optimize-diagnose.test.ts tests/fixtures/optimize package.json scripts/optimize-batch.ts
git commit -m "feat(optimize): optimize-diagnose script and analysis lib"
```

---

### Task 6: `optimize-finalize` best-effort

**Files:**
- Modify: `scripts/optimize-finalize.ts`
- Modify: `tests/unit/optimize-scoring.test.ts` (or new `tests/unit/optimize-finalize.test.ts`)

- [ ] **Step 1: Failing test via exported `runOptimizeFinalize`**

Use temp dir or mock filesystem is heavy; prefer testing selection logic:

```typescript
import { pickBestEffortEntry } from '../../scripts/lib/optimize-scoring.js';
// already tested in Task 2
```

Add integration-style test file that imports `runOptimizeFinalize` with temp leaderboard fixture under `tests/fixtures/optimize/leaderboard-near-miss.json` if feasible; else document manual step only.

- [ ] **Step 2: Update finalize logic**

```typescript
let best = pickBestEntry(leaderboard.entries);
let promotedAs: 'eligible' | 'near_miss' | undefined;

if (!best) {
  best = pickBestEffortEntry(leaderboard.entries);
  if (!best) return { promoted: false, reason: 'leaderboard_empty' };
  promotedAs = best.eligible ? 'eligible' : 'near_miss';
} else {
  promotedAs = 'eligible';
}

const targetMet = best.eligible && best.totalPnlPercent >= manifest.targets.targetPnlPercent;
await copyFile(best.configPath, manifest.baseConfig);

let reason: FinalizeResult['reason'];
if (targetMet) reason = 'target_met';
else if (best.eligible) reason = 'best_effort_cap';
else reason = 'best_effort_near_miss';

return { promoted: true, reason, promotedAs, candidateId: best.candidateId, ... };
```

Remove old `no_eligible_candidate` path that skipped copy — only `leaderboard_missing` / `leaderboard_empty` skip copy.

- [ ] **Step 3: Manual test**

```bash
# With existing data/optimize/leaderboard.json from prior runs (no eligible)
npm run optimize-finalize -- --manifest config/optimize-periods.yaml
```

Expected: `promoted: true`, `reason: "best_effort_near_miss"` or `"best_effort_cap"`, `production.yaml` updated.

- [ ] **Step 4: Commit**

```bash
git add scripts/optimize-finalize.ts
git commit -m "feat(optimize): finalize best-effort when no eligible candidate"
```

---

### Task 7: Skills + operator docs

**Files:**
- Modify: `.cursor/skills/optimize-strategy/SKILL.md`
- Modify: `.cursor/skills/optimize-strategy/reference.md`
- Create: `.cursor/skills/optimize-strategy/reference-code.md`
- Modify: `.cursor/skills/optimize-strategy-loop/SKILL.md`
- Modify: `docs/LENH-THAM-CHIEU.md`

- [ ] **Step 1: Rewrite `optimize-strategy/SKILL.md`**

Include from spec §7.1:

- Preflight (manifest, leaderboard, run-log, klines, prefetch command)
- Iteration (parent selection via `pickMutationParent` or diagnose output)
- Tier 1 / 2 / 3 gates
- Commands: `optimize-batch`, `optimize-diagnose`, `optimize-finalize`, `prefetch-klines`
- Anti-patterns (no manual `production.yaml`, no seed when near-miss exists)
- Finalize result table (v2 reasons)

- [ ] **Step 2: Update `reference.md`**

Add gap-to-target table (spec §7.2). Note `slopeLookback` suggest up to 10 in diagnose only.

- [ ] **Step 3: Create `reference-code.md`**

Allowed paths: `src/strategy/entry-gate.ts`, `context/*`, `entries/*`, tests. Template: hypothesis → minimal diff → `npm test -- <paths>` → batch with `tier: code` on entry (document `--tier code` if added to batch CLI).

- [ ] **Step 4: Update `optimize-strategy-loop/SKILL.md`**

Wake JSON schema; stop conditions; run finalize before last wake when `iteration >= maxIterations`.

- [ ] **Step 5: Update `docs/LENH-THAM-CHIEU.md`**

Add section:

```bash
npm run optimize-diagnose -- --manifest config/optimize-periods.yaml --candidate-id candidate-005
npm run optimize-batch -- ... --diagnose
```

- [ ] **Step 6: Commit**

```bash
git add .cursor/skills/optimize-strategy .cursor/skills/optimize-strategy-loop docs/LENH-THAM-CHIEU.md
git commit -m "docs(optimize): v2 skills and command reference"
```

---

### Task 8: Acceptance dry-run (manual + automated)

**Files:** none new

- [ ] **Step 1: Full unit suite**

```bash
npm test -- tests/unit/optimize-manifest.test.ts tests/unit/optimize-scoring.test.ts tests/unit/optimize-diagnose.test.ts
```

Expected: all PASS

- [ ] **Step 2: Klines false positive check**

Temporarily point manifest at wrong cache or empty symbol file; run:

```bash
npm run optimize-diagnose -- --manifest config/optimize-periods.yaml --config config/production.yaml --report data/reports/<any>.json
```

Expected: `klinesOk: false` and `prefetchCommand` in JSON.

- [ ] **Step 3: End-to-end mini loop (3 iterations)**

Agent or operator:

1. Prefetch `2024-10-01` → `2025-12-31`
2. Run batch `candidate-901`, `902`, `903` with small config diffs
3. Confirm `pickMutationParent` would choose `902` if it has highest `minWinRate` among ineligible
4. Run `optimize-diagnose` after each batch
5. Run `optimize-finalize` at cap

- [ ] **Step 4: Verify acceptance criteria from spec §10**

Checklist in commit message or PR description.

- [ ] **Step 5: Commit any fixture/leaderboard test artifacts** (do not commit `data/optimize` unless project already tracks it — prefer gitignored)

---

## Dependency Order

```
Task 1 (manifest) ─┐
Task 2 (scoring) ──┼─► Task 4 (batch) ─► Task 5 (diagnose) ─► Task 6 (finalize)
Task 3 (reportPath)┘                              │
                                                   └─► Task 7 (skills) ─► Task 8 (acceptance)
```

Implement **Task 3 before Task 4**. Task 5 lib can start in parallel with Task 4 after Task 3 lands.

---

## Testing Summary

| Area | Command |
|------|---------|
| Manifest | `npm test -- tests/unit/optimize-manifest.test.ts` |
| Scoring | `npm test -- tests/unit/optimize-scoring.test.ts` |
| Diagnose | `npm test -- tests/unit/optimize-diagnose.test.ts` |
| Backtest smoke | `npm test -- tests/integration/backtest-technical-smoke.test.ts` |
| Manual batch | `npx tsx scripts/optimize-batch.ts ...` |
| Manual diagnose | `npm run optimize-diagnose -- ...` |
| Manual finalize | `npm run optimize-finalize -- ...` |

---

## Risks During Implementation

| Risk | Mitigation |
|------|------------|
| `runBacktest` callers ignore `reportPath` | Optional field; only batch requires it |
| Diagnose rules too aggressive | Cap 3 suggestions; skills say hints only |
| Finalize near-miss promotes bad config | Log `promotedAs`; skill warns operator |
| Windows npm arg dropping | Document `npx tsx scripts/...` in skills (already present) |

---

## Spec Cross-Reference

| Spec § | Task |
|--------|------|
| §4.2 Leaderboard extensions | Task 2, 4 |
| §4.3 pickMutationParent | Task 2 |
| §5.1 optimize-diagnose | Task 5 |
| §5.2 batch + diagnose flag | Task 4, 5 |
| §5.4 finalize | Task 6 |
| §6 Three-tier model | Task 7 (docs) |
| §8 Manifest optional fields | Task 1 |
| §10 Acceptance | Task 8 |
