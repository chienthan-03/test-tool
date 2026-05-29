# Optimize Strategy — Reference

Companion to [SKILL.md](SKILL.md). Use when planning mutations after a batch run.

---

## Parameter bounds

Apply **1–3 changes** per iteration. Stay within these ranges; never edit paths listed in `config/optimize-periods.yaml` `denylist`.

| Parameter | Path | Suggested range |
|-----------|------|-----------------|
| Context fast EMA | `strategy.profiles.intraday.contextEma.fastPeriod` | 15–30 |
| Context slow EMA | `strategy.profiles.intraday.contextEma.slowPeriod` | 50–150 |
| flatPercent | `strategy.profiles.intraday.contextEma.flatPercent` | 0.0005–0.002 |
| Entry fast EMA | `strategy.profiles.intraday.emaMomentum.fastPeriod` | 8–15 |
| Entry slow EMA | `strategy.profiles.intraday.emaMomentum.slowPeriod` | 20–35 |
| slopeLookback | `strategy.profiles.intraday.emaMomentum.slopeLookback` | 3–8 (YAML edits); diagnose may suggest up to **10** when win gate is binding |
| minAtrPercent | `strategy.minAtrPercent` | 0.1–0.35 |
| maxAtrPercent | `strategy.maxAtrPercent` | 2–4 |
| slAtrMultiplier | `risk.slAtrMultiplier` | 1.5–3 |
| tpAtrMultiplier | `risk.tpAtrMultiplier` | 2–4 |
| cooldown hours | `risk.cooldownAfterLoss.durationHours` | 4–24 |
| maxNotionalUsdt | `risk.maxNotionalUsdt` | must allow min BTC qty (see below) |
| leverage | `sim.leverage`, `binance.margin.leverage` | keep equal, 5–20 |

Symbols: only add/remove from `symbolPool` in the manifest.

---

## Gap-to-target (from `optimize-diagnose`)

Use `aggregate.gapWinRatePoints` and `aggregate.gapPnlPercentPoints` after `klinesOk: true`. Prefer `suggestedMutations` (≤3) over ad-hoc sweeps.

| `gapWinRatePoints` | Priority actions |
|--------------------|------------------|
| > 10 | Consider **tier 2** (code); prune worst symbols; tighten `risk.tpAtrMultiplier` + widen `risk.slAtrMultiplier` |
| 5–10 | Raise `strategy.minAtrPercent`; increase `slopeLookback` (up to 10 in suggestions only); raise `contextEma.flatPercent`; try BTC-only symbol set |
| < 5 | Fine-tune `tpAtrMultiplier` / `slAtrMultiplier`; adjust `risk.cooldownAfterLoss.durationHours` |

When PnL gap dominates but win rate passes: widen `tpAtrMultiplier` or loosen `maxAtrPercent` per gate-reject table below.

---

## Gate-reject heuristics

After each batch, inspect the **latest** backtest JSON (see [Reading backtest reports](#reading-backtest-reports)). Group `gateRejects` by `reason` and count; prefer fixing the top 1–2 blockers before chasing PnL.

| Observation / top `reason` | Likely cause | Suggested action |
|----------------------------|--------------|------------------|
| `ema_context_flat` | Context EMAs too close | Increase `contextEma.flatPercent` or widen slow/fast separation |
| `ema_context_price_filter` | Price vs slow EMA filter | Toggle `contextEma.requireCloseBeyondSlow` or widen `slowPeriod` |
| `ema_context_insufficient_data` | Warm-up / period too short | Widen backtest window or lower EMA periods slightly (within bounds) |
| `ema_context_conflict` | Context gate conflict | Review context profile; small tweak to `flatPercent` or slow period |
| `ema_not_aligned` | Entry EMA stack misaligned | Adjust entry fast/slow periods or `slopeLookback` |
| `ema_slope_weak` | Slope filter too strict | Lower `slopeLookback` or relax entry fast/slow spread |
| `ema_price_beyond_slow` | Price-beyond-slow entry rule | Align with context `requireCloseBeyondSlow` or loosen entry slow period |
| `insufficient_ema_bars` | Not enough bars on entry TF | Lower entry EMA periods or ensure klines cover full range |
| `intraday_no_entry_path` | No path fired | Broader entry params or check `triggerMode` / profile enabled |
| Many losses on one symbol | Symbol-specific drag | Remove symbol from `symbols` (must stay in pool if re-added later) |
| Win rate ok but low PnL | Exits too tight or few trades | Widen `tpAtrMultiplier` or loosen `maxAtrPercent` |
| Win rate below gate (`below_min_win_rate` in run-log) | Too many marginal entries | Tighten entry: raise `slopeLookback`, raise `minAtrPercent`, or tighten context flat filter |
| `quantity_too_small` (risk engine log / no trades) | Notional too low for LOT_SIZE | See [quantity_too_small](#quantity_too_small) |

`quantity_too_small` is logged by the risk engine when computed size is below exchange minimums — often shows up as **zero or very few trades**, not always as a `gateRejects` row.

---

## Reading backtest reports

Each `runBacktest` call writes a full report under the candidate’s `backtest.reportDir` (typically `./data/reports`):

```
data/reports/backtest-<timestamp>.json
```

Pick the **newest** file by modification time after a batch (one file per manifest period per run).

### Top-level fields

| Field | Use |
|-------|-----|
| `totalTrades`, `wins`, `losses`, `winRate` | `winRate` is **0–1** in the file; compare to manifest `minWinRate` as percent (55 = 55%) |
| `totalPnlUsdt`, `maxDrawdownPct` | Period PnL; batch aggregates across periods in `leaderboard.json` |
| `trades[]` | Per-trade `symbol`, `side`, `pnl`, `exitReason` (`SL` / `TP`) |
| `gateRejects[]` | `symbol`, `reason`, `stage` (`context` \| `entry`), `direction`, `at` |
| `byEntryPath` | Optional breakdown if multiple entry paths |

### Per-symbol PnL

```javascript
// Conceptual: sum trades by symbol
trades.reduce((m, t) => ({ ...m, [t.symbol]: (m[t.symbol] ?? 0) + t.pnl }), {})
```

Remove chronic losers from `symbols` if win rate gate passes but total PnL is dragged down.

### Gate reject rollup

```javascript
// Conceptual: count by reason
gateRejects.reduce((m, g) => ({ ...m, [g.reason]: (m[g.reason] ?? 0) + 1 }), {})
```

Fix the highest-count `reason` first (see table above).

### Batch artifacts (multi-period)

| File | Contents |
|------|----------|
| `data/optimize/leaderboard.json` | All candidates, `eligible`, `totalPnlPercent`, `reportPaths`, optional `tier`; `best`, `bestNearEligible`, `bestPnl` |
| `data/optimize/run-log.jsonl` | One line per batch: `eligible`, `minWinRate`, `totalPnlPercent`, `targetMet`, `reason` |

**Do not recompute** `totalPnlPercent` or eligibility by hand — use `optimize-batch` stdout, `leaderboard.json`, and `optimize-diagnose` JSON.

### Diagnose instead of hand-parsing reports

```bash
npm run optimize-diagnose -- --manifest config/optimize-periods.yaml --candidate-id candidate-NNN
```

Key fields: `klinesOk`, `weakestPeriod`, `gateRejectTop`, `symbolPnl`, `suggestedMutations`, `plateau`, `suggestedTier`.

---

## quantity_too_small

Occurs when `risk.maxNotionalUsdt` × leverage (and balance caps) produce a quantity below Binance `minQty` / `minNotional` — common on **micro accounts** with BTC only.

**Symptoms:** `totalTrades` near zero, risk logs `quantity_too_small`, little or no `gateRejects`.

**Mitigations (pick 1–2, keep leverage fields equal):**

1. Raise `risk.maxNotionalUsdt` until backtest places at least min BTC size (watch drawdown).
2. Raise `sim.leverage` and `binance.margin.leverage` together (within 5–20 bounds).
3. Prefer symbols with lower min notional (e.g. `XRPUSDT`) if in `symbolPool`.
4. Do **not** lower `minAtrPercent` just to force entries if size is still too small.

Re-run batch after change; confirm `totalTrades > 0` on each manifest period.

---

## Overfit warning

Strong results on **only** the manifest periods do not guarantee live or forward performance.

- Rotate or add periods in `config/optimize-periods.yaml` before trusting +60% targets.
- Prefer candidates that are **eligible** (min win rate across **all** periods) over a single lucky window.
- Treat promoted `production.yaml` as a hypothesis — review diff and run manual backtests on held-out dates before live.
- Document iteration rationale in chat; avoid large random sweeps (bounds table + 3 changes max).

---

## Example mutation diff

Iteration 2 — gate dominated by `ema_context_flat`, win rate OK, PnL low:

```yaml
# candidate-002.yaml (excerpt)
strategy:
  profiles:
    intraday:
      contextEma:
        flatPercent: 0.0012   # was 0.0008
risk:
  tpAtrMultiplier: 3.5        # was 3.0
```

Document both changes in the agent message before running the next batch.
