---
name: optimize-strategy
description: Runs multi-period backtests and iteratively mutates trading config to maximize total PnL percent among configs meeting minimum win rate. Use when optimizing strategy, tuning production.yaml, improving backtest PnL, or running the strategy improve loop.
---

# Optimize Strategy (v2)

Automated improve loop for this repo. **Do not hand-calculate scores** — use `optimize-batch`, `optimize-diagnose`, and `optimize-finalize`. Compose with [optimize-strategy-loop](../optimize-strategy-loop/SKILL.md) for cross-session wakes.

## Prerequisites

- `config/optimize-periods.yaml` — periods, targets, `symbolPool`, `denylist`.
- Technical mode recommended (`triggerMode: technical`, `newsVeto.enabled: false`).
- Klines must cover **all** manifest periods before trusting win rate / PnL (see Preflight).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run prefetch-klines` | Cache klines for manifest date span (+ warmup) |
| `npm run optimize-batch` | Multi-period backtest + leaderboard + run-log |
| `npm run optimize-diagnose` | Bottleneck JSON (`klinesOk`, weakest period, suggestions) |
| `npm run optimize-finalize` | Promote best candidate → `manifest.baseConfig` (production) |

### optimize-batch

```bash
npm run optimize-batch -- \
  --manifest config/optimize-periods.yaml \
  --config config/optimize/candidate-NNN.yaml \
  --candidate-id candidate-NNN \
  --iteration N \
  [--skip-download] \
  [--diagnose] \
  [--tier config|code]
```

- `--diagnose` — append diagnose JSON after batch summary (same as running diagnose separately).
- `--tier code` — record `tier: "code"` on the leaderboard entry after a code-tier iteration.

### optimize-diagnose

```bash
npm run optimize-diagnose -- \
  --manifest config/optimize-periods.yaml \
  --candidate-id candidate-NNN

# or explicit reports:
npm run optimize-diagnose -- \
  --manifest config/optimize-periods.yaml \
  --config config/optimize/candidate-NNN.yaml \
  --report data/reports/backtest-....json \
  --report data/reports/backtest-....json
```

Run after every batch (or use `--diagnose` on batch). **Do not interpret `winRate` / PnL until `klinesOk: true`.**

### prefetch-klines (mandatory when cache wrong)

```bash
npm run prefetch-klines -- \
  --config config/optimize/candidate-NNN.yaml \
  --from <minPeriodFrom> \
  --to <maxPeriodTo>
```

Use one span covering **all** manifest `periods[]` (diagnose prints exact command when `klinesOk: false`).

### optimize-finalize

```bash
npm run optimize-finalize -- --manifest config/optimize-periods.yaml
```

Only this script (or explicit user override) may update `config/production.yaml` (`manifest.baseConfig`).

## Windows / PowerShell

If `npm run … --` drops arguments:

```powershell
npx tsx scripts/optimize-batch.ts --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 --iteration 1 --skip-download
npx tsx scripts/optimize-diagnose.ts --manifest config/optimize-periods.yaml --candidate-id candidate-001
npx tsx scripts/optimize-finalize.ts --manifest config/optimize-periods.yaml
```

---

## Preflight

```
- [ ] Read config/optimize-periods.yaml (periods, targets, symbolPool, denylist, optional maxCodeIterations / plateauWindow)
- [ ] Read data/optimize/leaderboard.json (entries, best, bestNearEligible, bestPnl)
- [ ] Read last 5 lines of data/optimize/run-log.jsonl
- [ ] N = max(iteration)+1 from leaderboard, or 1 if missing
- [ ] If N > targets.maxIterations → run optimize-finalize (below); stop iterating
- [ ] Klines gate:
      - First iteration OR prior batch had totalTrades==0 on any period OR diagnose.klinesOk was false:
        npm run prefetch-klines -- --config <parent-or-candidate> --from <minPeriodFrom> --to <maxPeriodTo>
      - optimize-diagnose must report klinesOk:true before interpreting winRate/PnL or planning CONFIG mutations
```

---

## Iteration

```
- [ ] parent = pickMutationParent (from leaderboard fields or scripts/lib/optimize-scoring.ts logic):
      eligible → highest totalPnlPercent;
      else ineligible → highest minWinRate (tie-break totalPnlPercent);
      else seedConfig
- [ ] Determine tier: 1 CONFIG (default) | 2 CODE | 3 MANIFEST (ask user)
- [ ] Copy parent → config/optimize/candidate-{NNN}.yaml (3-digit id)
- [ ] Tier 1: apply 1–3 YAML mutations (reference.md + diagnose.suggestedMutations)
- [ ] Tier 2: code change per reference-code.md; npm test; then batch with --tier code
- [ ] npm run optimize-batch [--diagnose] (see Commands)
- [ ] If diagnose.klinesOk === false → run prefetch from klinesWarning; re-batch; do NOT tune params yet
- [ ] If targetMet (batch JSON) → optimize-finalize; report and stop
- [ ] Else plan next mutation from diagnose.suggestedMutations (≤3); do not invent aggregate scores
- [ ] If iteration < maxIterations and not targetMet → continue or hand off to optimize-strategy-loop
```

**Parent selection:** Never copy `seedConfig` when a later candidate improved `minWinRate` or `totalPnlPercent` unless the operator resets the leaderboard.

---

## Tier escalation

### Tier 1 — CONFIG (default)

Every iteration until config plateau or `targetMet`.

- Mutate only paths in [reference.md](reference.md); respect `denylist` and `symbolPool`.
- After batch: `optimize-diagnose` (or `optimize-batch --diagnose`).

### Tier 2 — CODE

Escalate when **all** hold:

- `optimize-diagnose.plateau.detected === true` on last `plateauWindow` (default 3) **config-tier** iterations, and
- `aggregate.gapWinRatePoints > 0` OR zero trades persist after `klinesOk: true`, and
- `iteration < maxIterations` (or `< maxIterations + maxCodeIterations` if manifest sets it).

Workflow: hypothesis → minimal diff + tests → [reference-code.md](reference-code.md) → batch `--tier code`.

Stop tier 2 when plateau on `minWinRate` for `codePlateauWindow` (default 2) code iterations → tier 3.

### Tier 3 — MANIFEST (human approval)

When config **and** code plateaus (or operator rejects code), targets still not met.

**Ask once** (never silently edit): lower `minWinRate` / `targetPnlPercent`? change `periods[]`? expand `symbolPool`?

On approval: edit manifest, note `manifest_reset` in run-log, continue from tier 1.

---

## Finalize (v2)

When `targetMet`, `iteration > maxIterations`, or loop cap — run:

```bash
npm run optimize-finalize -- --manifest config/optimize-periods.yaml
```

| `reason` | `production.yaml` | Agent message |
|----------|-------------------|---------------|
| `target_met` | Updated | Success: eligible + PnL target met |
| `best_effort_cap` | Updated | Warning: eligible but PnL below `targetPnlPercent` |
| `best_effort_near_miss` | Updated | Warning: win gate not met; promoted best near-miss (`promotedAs: near_miss`) |
| `leaderboard_missing` | Unchanged | Run at least one optimize-batch |
| `leaderboard_empty` | Unchanged | No candidates in leaderboard |
| `no_eligible_candidate` | Unchanged | Failure when no entries to promote (legacy path) |

Post message template:

```markdown
## Optimize complete
- Best: {candidateId} (totalPnlPercent X%, minWinRate Y%)
- Finalize: {reason} / promotedAs {eligible|near_miss}
- Target: met / not met
- production.yaml: updated / unchanged
- Leaderboard: data/optimize/leaderboard.json
```

---

## Anti-patterns

- **Do NOT** hand-edit `config/production.yaml` — use `optimize-finalize` unless the user explicitly requests manual override (log in chat).
- **Do NOT** `cp candidate-*.yaml → production.yaml` to “save progress” when finalize would fail.
- **Do NOT** mutate from `seedConfig` when leaderboard has a better parent (`bestNearEligible` / higher `minWinRate`).
- **Do NOT** treat `totalTrades: 0` or collapsed win rate as “bad config” before `klinesOk: true`.
- **Do NOT** recompute `totalPnlPercent`, `eligible`, or `minWinRate` by hand — use batch stdout and `leaderboard.json`.
- **Do NOT** change manifest targets or periods without user approval (tier 3).

---

## Rules

- Max **3** param or suggestion-driven changes per config iteration; document rationale in chat.
- Keep `sim.leverage` === `binance.margin.leverage`.
- Symbols only from `symbolPool`.
- Overfit: rotate periods; hold-out dates before live.

## Reference

| Doc | Use |
|-----|-----|
| [reference.md](reference.md) | Parameter bounds, gate heuristics, **gap-to-target** table |
| [reference-code.md](reference-code.md) | Tier 2 allowed files, tests, example hypothesis |
