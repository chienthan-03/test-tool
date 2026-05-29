---
name: optimize-strategy
description: Runs multi-period backtests and iteratively mutates trading config to maximize total PnL percent among configs meeting minimum win rate. Use when optimizing strategy, tuning production.yaml, improving backtest PnL, or running the strategy improve loop.
---

# Optimize Strategy

Automated improve loop for this repo. **Do not hand-calculate scores** — always use `npm run optimize-batch` (or the Windows fallback below).

## Prerequisites

- Klines cached: `npm run prefetch-klines` (or first batch run downloads).
- `config/optimize-periods.yaml` defines periods + targets.
- Technical mode recommended (`triggerMode: technical`, `newsVeto.enabled: false`).

## Windows / PowerShell

If `npm run optimize-batch -- --manifest ...` drops or mangles arguments on Windows, invoke the script directly:

```powershell
npx tsx scripts/optimize-batch.ts --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 --iteration 1 --skip-download
```

Same pattern for finalize:

```powershell
npx tsx scripts/optimize-finalize.ts --manifest config/optimize-periods.yaml
```

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

See [reference.md](reference.md) for bounds, gate-reject heuristics, report reading, and `quantity_too_small` guidance.
