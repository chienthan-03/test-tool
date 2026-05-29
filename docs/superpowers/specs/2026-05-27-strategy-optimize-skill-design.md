# Strategy Optimize Skill Bundle — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-27-strategy-optimize-skill-design` |
| **Status** | Approved (brainstorming) — ready for implementation plan |
| **Parent spec** | `2026-05-20-crypto-news-trader-design` |
| **Related** | `2026-05-27-entry-profile-momentum-design`, `scripts/run-backtest-matrix.ts`, `src/cli/commands/backtest.ts` |
| **Brainstorming choices** | Filter-then-rank (min win rate → max PnL %); sum PnL across periods; user-defined periods file; tune strategy+risk+symbols; candidate YAMLs; auto-apply winner to `production.yaml`; stop at `targetPnlPercent: 60` or `maxIterations: 20`; defaults `minWinRate: 55%` |
| **Version** | 1.0 |

---

## 1. Summary

Replace ad-hoc chat-driven strategy tuning with a **repeatable agent loop** backed by:

1. **`config/optimize-periods.yaml`** — backtest windows, targets, denylist.
2. **`scripts/optimize-batch.ts`** — deterministic multi-period backtests + scoring + leaderboard.
3. **Cursor skill bundle** (`.cursor/skills/optimize-strategy/`, `optimize-strategy-loop/`) — agent mutates configs, invokes the script, iterates until target or cap.

**Selection rule (locked in brainstorming):**

1. Compute metrics per period, then aggregate.
2. **Eligibility:** `min(period.winRate) >= minWinRate` (conservative across all windows).
3. **Rank** eligible candidates by **`totalPnlPercent`** (highest wins).
4. **Stop** when best eligible `totalPnlPercent >= targetPnlPercent` (**+60%** default) or `iteration >= maxIterations` (**20** default).
5. On stop: write winner to **`config/production.yaml`** (if at least one eligible candidate exists).

PnL % formula:

```
totalPnlUsdt     = sum(period.totalPnlUsdt)
totalPnlPercent  = (totalPnlUsdt / initialBalanceUsdt) * 100
```

`initialBalanceUsdt` is read from the candidate config (`sim.initialBalanceUsdt`).

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Automate the improve loop an operator would do manually: backtest → read report → tweak YAML → repeat.
- **Reproducible scoring** via `optimize-batch.ts` (not agent hand-parsing JSON).
- Support **multiple backtest periods** declared in one file (operator-controlled).
- Allow tuning **strategy**, **risk**, and **symbols** (add/remove from configured pool).
- Keep **`production.yaml` untouched** during iterations; only promote winner at end.
- Persist **leaderboard** and **run log** under `data/optimize/`.
- Integrate with existing **`runBacktest`** / kline cache (`data/klines`).
- Skills usable via `@optimize-strategy` or explicit attach; loop skill composes with Cursor **`/loop`** for long runs.

### 2.2 Non-Goals (v1)

- Bayesian / grid search library (Optuna, etc.) — agent heuristics only.
- Changing **`mode`**, **`allowLive`**, storage paths, Binance URLs (denylist).
- Live or testnet order placement during optimize.
- LLM-based mutation or LLM sentiment in backtests (technical mode; mock sentiment ignored).
- Multi-objective score weights (PnL % + win rate composite) — filter-then-rank only.
- Automatic git commit of winner (operator commits manually).
- Parallel backtests across CPU cores (v1 sequential per candidate is acceptable).

---

## 3. Decisions Log

| Topic | Decision |
|-------|----------|
| Primary metric | `totalPnlPercent` among eligible configs |
| Win rate gate | `min(period.winRate) >= minWinRate` (default **55%**) |
| PnL aggregation | **Sum** `totalPnlUsdt` across periods |
| Periods | User-defined in `config/optimize-periods.yaml` |
| Tunable scope | `strategy.*`, `risk.*`, `symbols` |
| Iteration configs | `config/optimize/candidate-{NNN}.yaml` |
| Promotion | Auto-copy winner → `config/production.yaml` on loop end |
| Stop — success | `totalPnlPercent >= targetPnlPercent` (default **60**) |
| Stop — safety | `iteration >= maxIterations` (default **20**) |
| Stop — failure | No eligible candidate → **do not** overwrite `production.yaml` |
| Plateau early stop | **Not in v1** (only target or max iterations) |
| Best-effort on cap | If cap hit but target not met, still promote **best eligible** and log warning |
| Win rate on zero trades | `winRate` from report (0 if `totalTrades === 0`) → likely fails min gate |
| Script vs agent | **Hybrid:** script runs backtests + score; agent mutates YAML |
| Skill location | **Project** `.cursor/skills/` (versioned with repo) |
| Existing matrix script | Reuse patterns from `run-backtest-matrix.ts`; do not merge tools in v1 |

---

## 4. Configuration

### 4.1 `config/optimize-periods.yaml` (new)

Operator-edited manifest. Not validated by main `AppConfig` schema — separate Zod schema in `scripts/optimize-batch.ts` (or `scripts/lib/optimize-manifest.ts`).

```yaml
# Backtest windows — add/remove freely
periods:
  - from: "2024-10-01"
    to: "2024-12-31"
  - from: "2025-10-01"
    to: "2025-12-31"

targets:
  targetPnlPercent: 60      # stop success threshold (+60% total)
  minWinRate: 55            # min win rate % per period (all must pass)
  maxIterations: 20         # agent loop safety cap

baseConfig: config/production.yaml

# Starting point for iteration 1 (copy of base unless overridden)
seedConfig: config/production.yaml

# Symbols agent may add (must be subset of supported futures symbols)
symbolPool:
  - BTCUSDT
  - ETHUSDT
  - XRPUSDT
  - SOLUSDT
  - BNBUSDT

# Dot-paths or top-level keys never mutated by agent
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
  klineCacheDir: ./data/klines   # informational; uses candidate's backtest.klineCacheDir
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `periods[].from` | ISO date | required | Passed to `runBacktest` |
| `periods[].to` | ISO date | required | |
| `targets.targetPnlPercent` | number | `60` | Total PnL % across periods |
| `targets.minWinRate` | number | `55` | 0–100 |
| `targets.maxIterations` | number | `20` | Agent reads; script ignores |
| `baseConfig` | path | `config/production.yaml` | Reference only |
| `seedConfig` | path | same as base | First candidate copy source |
| `symbolPool` | string[] | see example | Bounds symbol mutations |
| `denylist` | string[] | see example | Agent must not edit |

### 4.2 Candidate files

- Path: `config/optimize/candidate-001.yaml`, `candidate-002.yaml`, …
- Each file is a **full valid `AppConfig`** YAML (loadable by `loadConfigWithEnv`).
- Agent creates the next file by copying the current **leader** (best eligible so far) or `seedConfig` for iteration 1, then applying a **small diff** (1–3 logical changes per iteration).

### 4.3 Environment

- `optimize-batch` uses `loadEnvFile()` like other scripts.
- `CONFIG_PATH` is **not** used; config path is always CLI `--config <candidate.yaml>`.

---

## 5. Scoring & Leaderboard

### 5.1 Per-period run

For each `(period, candidate)`:

```ts
report = await runBacktest({ config, db, from, to, symbols: config.symbols, mockSentiment: false })
```

Technical mode + `newsVeto.enabled: false` → no news DB required.

### 5.2 Aggregates

```ts
totalPnlUsdt = periods.reduce((s, p) => s + p.totalPnlUsdt, 0)
totalPnlPercent = (totalPnlUsdt / config.sim.initialBalanceUsdt) * 100
minWinRate = Math.min(...periods.map(p => p.winRate * 100))  // report.winRate is 0–1
eligible = minWinRate >= targets.minWinRate
```

### 5.3 Leaderboard entry

`data/optimize/leaderboard.json`:

```json
{
  "updatedAt": "2026-05-27T12:00:00.000Z",
  "manifestSha256": "...",
  "entries": [
    {
      "candidateId": "candidate-003",
      "configPath": "config/optimize/candidate-003.yaml",
      "eligible": true,
      "totalPnlUsdt": 360.5,
      "totalPnlPercent": 60.08,
      "minWinRate": 56.2,
      "periods": [
        { "from": "2024-10-01", "to": "2024-12-31", "totalPnlUsdt": 200, "winRate": 58, "totalTrades": 40 },
        { "from": "2025-10-01", "to": "2025-12-31", "totalPnlUsdt": 160.5, "winRate": 56.2, "totalTrades": 35 }
      ],
      "iteration": 3
    }
  ],
  "best": { "candidateId": "candidate-003", "totalPnlPercent": 60.08 }
}
```

Sorted: eligible first, then descending `totalPnlPercent`.

### 5.4 Run log

Append-only `data/optimize/run-log.jsonl` — one JSON object per batch invocation:

```json
{"ts":"...","candidateId":"candidate-002","eligible":false,"minWinRate":48.1,"totalPnlPercent":72.3,"reason":"below_min_win_rate"}
```

---

## 6. `scripts/optimize-batch.ts` (new)

### 6.1 CLI

```bash
npm run optimize-batch -- \
  --manifest config/optimize-periods.yaml \
  --config config/optimize/candidate-001.yaml \
  --candidate-id candidate-001 \
  --iteration 1
```

| Flag | Required | Description |
|------|----------|-------------|
| `--manifest` | yes | Path to `optimize-periods.yaml` |
| `--config` | yes | Candidate config to backtest |
| `--candidate-id` | yes | Label for leaderboard |
| `--iteration` | no | Metadata (default 0) |
| `--skip-download` | no | Reuse cached klines |

### 6.2 Behavior

1. Parse manifest + load candidate config.
2. Validate date ranges (`validateBacktestRange`).
3. Open DB, migrate.
4. For each period in manifest: `runBacktest(...)`.
5. Compute aggregates + eligibility.
6. Merge into `leaderboard.json`.
7. Append `run-log.jsonl`.
8. Print stdout summary (machine-readable JSON last line):

```json
{"eligible":true,"totalPnlPercent":60.08,"minWinRate":56.2,"targetMet":true,"candidateId":"candidate-003"}
```

Exit code `0` always if script completes; `targetMet` is informational.

### 6.3 Errors

- Invalid manifest → exit `1`, stderr message.
- Backtest throw (e.g. network) → exit `1`, log period index.
- Partial period failure → do not write leaderboard (atomic per candidate run).

---

## 7. Agent Loop (Skills)

### 7.1 Skill: `optimize-strategy`

**Path:** `.cursor/skills/optimize-strategy/SKILL.md`

**Description (frontmatter):**  
Runs multi-period backtests and iteratively mutates trading config to maximize total PnL percent among configs meeting minimum win rate. Use when optimizing strategy, tuning production.yaml, improving backtest PnL, or running the strategy improve loop.

**Workflow (checklist):**

```
- [ ] Read config/optimize-periods.yaml
- [ ] Read data/optimize/leaderboard.json (if exists) for current best
- [ ] Determine iteration N (leaderboard max iteration + 1, or 1)
- [ ] If N > maxIterations → finalize (section 7.3)
- [ ] Copy leader or seedConfig → config/optimize/candidate-{NNN}.yaml
- [ ] Apply 1–3 mutations (section 8); respect denylist + symbolPool
- [ ] Run: npm run optimize-batch -- --manifest ... --config ... --candidate-id ... --iteration N
- [ ] Parse JSON summary line; read leaderboard
- [ ] If targetMet → finalize
- [ ] Else analyze run-log / gateRejects / per-symbol PnL → plan next mutation
- [ ] Repeat or invoke optimize-strategy-loop if backtests exceed context/time
```

**reference.md** contains:

- Parameter bounds table (section 8 of this spec).
- Mutation heuristics (gate reject reasons → param direction).
- How to read `data/reports/backtest-*.json` `gateRejects` and `trades` by symbol.
- Example mutation diffs.

### 7.2 Skill: `optimize-strategy-loop`

**Path:** `.cursor/skills/optimize-strategy-loop/SKILL.md`

Composes with Cursor **`loop`** skill:

- After each `optimize-batch` that did **not** `targetMet`, arm dynamic loop wake.
- Prompt payload: `{"action":"continue","iteration":N,"bestPercent":...}`.
- On wake: resume `optimize-strategy` from checklist step "Determine iteration N".
- Stop loop when `targetMet` or `iteration > maxIterations` or user says stop.

### 7.3 Finalize (both skills)

| Condition | Action |
|-----------|--------|
| `targetMet === true` | Copy best eligible `configPath` → `config/production.yaml`; log success |
| `iteration > maxIterations` && eligible exists | Copy best eligible; log **warning** target not met |
| No eligible entries | **Do not** modify `production.yaml`; log failure + suggest lowering `minWinRate` or widening periods |

Post-finalize message template:

```markdown
## Optimize complete
- Best: candidate-00N (totalPnlPercent X%, minWinRate Y%)
- Target +60%: met / not met
- production.yaml: updated / unchanged
- Leaderboard: data/optimize/leaderboard.json
```

---

## 8. Mutation Heuristics (reference.md content)

Agent applies **small, justified** changes. Suggested bounds:

| Parameter | Path | Suggested range |
|-----------|------|-----------------|
| Context fast EMA | `strategy.profiles.intraday.contextEma.fastPeriod` | 15–30 |
| Context slow EMA | `...slowPeriod` | 50–150 |
| flatPercent | `...flatPercent` | 0.0005–0.002 |
| Entry fast EMA | `...emaMomentum.fastPeriod` | 8–15 |
| Entry slow EMA | `...emaMomentum.slowPeriod` | 20–35 |
| slopeLookback | `...slopeLookback` | 3–8 |
| minAtrPercent | `strategy.minAtrPercent` | 0.1–0.35 |
| maxAtrPercent | `strategy.maxAtrPercent` | 2–4 |
| slAtrMultiplier | `risk.slAtrMultiplier` | 1.5–3 |
| tpAtrMultiplier | `risk.tpAtrMultiplier` | 2–4 |
| cooldown hours | `risk.cooldownAfterLoss.durationHours` | 4–24 |
| maxNotionalUsdt | `risk.maxNotionalUsdt` | must allow min BTC qty |
| leverage | `sim.leverage`, `binance.margin.leverage` | keep equal, 5–20 |

**Heuristic examples:**

| Observation | Action |
|-------------|--------|
| High `gateRejects` `ema_flat` | Increase `flatPercent` or slow periods |
| High `ema_context_price_filter` | Toggle `requireCloseBeyondSlow` or widen slow EMA |
| Many losses one symbol | Remove symbol from list |
| `quantity_too_small` | Raise `maxNotionalUsdt` or leverage |
| Win rate ok but low PnL | Widen `tpAtrMultiplier` or loosen ATR max |
| Win rate below gate | Tighten entry (slopeLookback up, minAtrPercent up) |

---

## 9. File Tree (deliverables)

```
config/
  optimize-periods.yaml          # new — operator manifest
  optimize/
    candidate-001.yaml           # generated per iteration
    ...
data/optimize/
  leaderboard.json
  run-log.jsonl
scripts/
  optimize-batch.ts              # new
  lib/
    optimize-manifest.ts         # optional — Zod parse manifest
.cursor/skills/
  optimize-strategy/
    SKILL.md
    reference.md
  optimize-strategy-loop/
    SKILL.md
docs/superpowers/
  specs/2026-05-27-strategy-optimize-skill-design.md   # this file
  plans/2026-05-27-strategy-optimize-skill.md          # created by writing-plans skill
```

**Note:** `package.json` already declares `"optimize-batch": "tsx scripts/optimize-batch.ts"` — implementation must add the file.

---

## 10. Integration Points

| Component | Usage |
|-----------|--------|
| `runBacktest` | `src/execution/backtest-replayer.ts` |
| `loadConfigWithEnv` | candidate YAML |
| `validateBacktestRange` | each period |
| `run-backtest-matrix.ts` | Reference for manifest parsing, summary JSON, experiments dir patterns |
| `production.yaml` | Promotion target only |
| Cursor `loop` skill | Long-running multi-iteration sessions |

---

## 11. Acceptance Criteria

1. `config/optimize-periods.yaml` example committed with defaults (`targetPnlPercent: 60`, `minWinRate: 55`, `maxIterations: 20`).
2. `npm run optimize-batch -- ...` runs all manifest periods and prints JSON summary.
3. `leaderboard.json` updates with correct `eligible` / `totalPnlPercent` / `minWinRate`.
4. Agent following `optimize-strategy` skill can complete ≥2 iterations without manual score math.
5. On `targetMet`, `production.yaml` matches best candidate content (byte-identical aside from comments).
6. On zero eligible runs after max iterations, `production.yaml` unchanged.
7. Denylist paths are never modified in candidate files (skill instructs; optional script validation in v2).
8. Skills discoverable: description includes "optimize strategy", "backtest PnL", "production.yaml".

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Overfit to chosen periods | Document in skill: rotate periods; don't treat +60% as live guarantee |
| Infinite loop | `maxIterations` in manifest; loop skill stops arming |
| `production.yaml` corrupted | Candidates isolated; git diff before commit |
| Binance fetch failures | `prefetch-klines` documented in skill; `--skip-download` after cache warm |
| BTC `quantity_too_small` | reference.md leverage/notional guidance |
| Agent random large diffs | Skill enforces 1–3 changes + bounds table |

---

## 13. Spec Self-Review

| Check | Result |
|-------|--------|
| Placeholders / TBD | None |
| Internal consistency | Scoring, stop rules, and promotion aligned with brainstorming |
| Scope | Single feature: optimize loop; no Optuna/live trading |
| Ambiguity | `winRate` in report treated as 0–1 ratio × 100 for comparison to `minWinRate` percent — **confirm in implementation** against `BacktestReport.winRate` actual scale |
| `package.json` script without file | Called out in §9 |

**Implementation note:** Verify `BacktestReport.winRate` is `0–1` or `0–100` in `backtest-replayer.ts` and normalize in `optimize-batch.ts` accordingly.

---

## 14. Next Step

After operator approval of this spec:

1. Invoke **writing-plans** skill → `docs/superpowers/plans/2026-05-27-strategy-optimize-skill.md`
2. Implement in order: manifest example → `optimize-batch.ts` → skills → dry-run 2 iterations
