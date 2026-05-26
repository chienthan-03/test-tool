# Alternate Entry Paths (Plugin Fallback) — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-25-alternate-entry-paths-design` |
| **Status** | Approved (brainstorming) — ready for implementation plan |
| **Parent spec** | `2026-05-20-crypto-news-trader-design` |
| **Brainstorming choices** | Option A (xuôi trend + RSS); fallback order **1**; extensible plugin registry |
| **Version** | 1.0 |

---

## 1. Summary

Add **pluggable alternate entry paths** that run **only after** the primary **Fibonacci pullback** path (via `MtfEngine`) fails with specific, recoverable reasons. **Elliott context** (`evaluateContext`) remains a **shared gate** for all paths — alternates never bypass trend alignment with news direction.

MVP alternates: **`breakout`**, **`emaMomentum`**. New paths are added by implementing `EntryPathEvaluator` and registering in `EntryPathRegistry` — no changes to `StrategyEngine` per new strategy.

`TradeIntent` gains **`entryPath`** for audit, SQLite, backtest export, and trade review (`would_take_again` by path).

**Defaults for rollout:** `strategy.alternateEntries.enabled: false` in `config/production.yaml` until backtest matrix + optional testnet review; experiment YAMLs enable alternates for A/B comparison.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Increase entry count when Fib zone is missed but context trend still aligns with news
- Preserve **pro-trend** behavior (no counter-trend alternates)
- **Fib-first fallback** — at most one entry per pending signal per candle close
- Extensible registry: new entry path = new file + config block + registry line
- Same execution stack: `strategy:intent` → risk engine → adapter (sim / testnet / live / backtest)
- Tag intents with `entryPath` for review and reporting
- Configurable fallback reason whitelist and alternate evaluation order
- Optional `positionScale` for alternate paths (&lt; 1 reduces notional vs primary)

### 2.2 Non-Goals (v1)

- Parallel OR evaluation (Fib and breakout on same bar without fallback)
- Alternate paths when **context** fails (`elliott_context_conflict`, etc.)
- Counter-trend / mean-reversion strategies
- New RSS feeds, LLM, or symbol expansion (separate workstreams)
- Per-alternate leverage or margin settings
- Trailing stop or cooldown rules per path (use global `risk.*`)
- Config-driven DSL / YAML-defined indicators without TypeScript

---

## 3. Decisions Log

| Topic | Decision |
|-------|----------|
| Trigger | Fallback only after primary Fib `confirm: false` |
| Context | Single `evaluateContext` before any entry path |
| Order | Config `alternateEntries.order` — first `confirm` wins |
| Primary path id | `fib` (wraps existing `MtfEngine.evaluateEntry`) |
| SL/TP | Each evaluator returns `stopLoss` / `takeProfit`; risk uses existing plan if present, else ATR multipliers from `risk.*` |
| Position size | `positionPercent × alternateEntries.positionScale` when `entryPath !== 'fib'` |
| Production default | `alternateEntries.enabled: false` until validated |
| `production.yaml` draft keys | Keep `breakout` / `emaMomentum` blocks; align with schema in implementation |

---

## 4. Entry Evaluation Flow

### 4.1 Sequence (unchanged triggers)

1. `news:signal` → `PendingSignalStore` (unchanged)
2. `market:candleClose` on **entry timeframe** (unchanged)
3. Pending signal checks: pause, cooldown, `onePositionPerSymbol`, `waitForNextCandleClose` (unchanged)
4. **Entry resolution** (new orchestration inside `EntryGate`):

```text
if !entryGates.enabled:
  → evaluate primary fib only (legacy behavior for entry stage; context skipped)

if entryGates.enabled:
  context = mtf.evaluateContext(symbol, direction, strength)
  if !context.allow → REJECT (stage: context), NO alternates

  primary = fibEvaluator.evaluate(...)
  if primary.confirm → ALLOW (entryPath: fib)

  if !alternateEntries.enabled → REJECT (stage: entry, reason: primary.reason)

  if primary.reason NOT IN fallbackOnReasons → REJECT (stage: entry)

  for id in alternateEntries.order:
    if !config[id].enabled → continue
    alt = registry.get(id).evaluate(...)
    if alt.confirm → ALLOW (entryPath: id), STOP

  REJECT (stage: entry, reason: last primary or alternate reason)
```

### 4.2 Fallback reason whitelist (default)

| Reason | Fallback? | Rationale |
|--------|-----------|-----------|
| `outside_fib_zone` | Yes | Price action valid; Fib timing missed |
| `no_matching_impulse_leg` | Yes | No fib leg; breakout/EMA may still apply |
| `risk_reward_too_low` | Yes | Fib levels poor; alternate may recompute SL/TP |
| `insufficient_entry_data` | No | Not enough bars — alternates share store |
| `insufficient_atr` | No | Market unsuitable |
| `atr_below_minimum` | No | Volatility filter |
| `atr_above_maximum` | No | Volatility filter |
| `insufficient_swings` | No | Structure not ready |

List is **configurable** via `strategy.alternateEntries.fallbackOnReasons`.

### 4.3 Context gate unchanged

Alternates **must not** run when `evaluateContext` returns `allow: false`. Rationale: user chose pro-trend + news; context conflict means no secondary path.

---

## 5. Architecture

### 5.1 Module layout

```
src/strategy/
  entry-gate.ts              # orchestrates context + entry chain
  mtf-engine.ts              # unchanged logic; used by FibEvaluator
  entries/
    types.ts                 # EntryPathEvaluator, EntryEvalContext, EntryPathResult
    fib-entry.ts             # wraps MtfEngine.evaluateEntry → id: fib
    breakout-entry.ts        # id: breakout
    ema-momentum-entry.ts    # id: emaMomentum
    registry.ts              # buildRegistry(config) → ordered evaluators
```

### 5.2 `EntryPathEvaluator` contract

```typescript
export type EntryPathId = 'fib' | 'breakout' | 'emaMomentum' | string;

export type EntryEvalContext = {
  symbol: string;
  direction: SignalDirection;
  strength: number;
  config: AppConfig;
  store: KlineStore;
};

export type EntryPathResult = {
  confirm: boolean;
  reason?: string;
  close: number;
  atr: number;
  stopLoss?: number;
  takeProfit?: number;
};

export interface EntryPathEvaluator {
  readonly id: EntryPathId;
  evaluate(ctx: EntryEvalContext): EntryPathResult;
}
```

### 5.3 `EntryGateResult` extension

```typescript
export type EntryGateResult = {
  allow: boolean;
  reason?: string;
  stage?: 'context' | 'entry';
  entry?: EntryPathResult;
  entryPath?: EntryPathId;  // set when allow === true
};
```

### 5.4 Registry

- `buildEntryPathRegistry(config: AppConfig): EntryPathEvaluator[]`
- Always includes **fib** as primary (not in `alternateEntries.order`)
- Alternates: iterate `config.strategy.alternateEntries.order`, skip if `enabled: false` or unknown id (log warn once)
- Unknown id in order → warn, skip (do not crash startup)

### 5.5 `StrategyEngine` changes

- Read `gate.entryPath ?? 'fib'` when building `TradeIntent`
- Add `entryPath` to `TradeIntent` interface (`src/core/types.ts`)
- Persist `entry_path` column on trade/intent storage if schema exists; migration additive nullable

### 5.6 Bootstrap

- `wireTradingStack` constructs `KlineStore`, `MtfEngine`, `buildEntryPathRegistry(config)`, passes registry to `EntryGate`
- Unit tests can inject mock evaluators via registry factory (test-only export optional)

---

## 6. Alternate Path Specifications (MVP)

All alternates use **entry timeframe** candles from `KlineStore`. Direction must match news `direction` (long/short).

### 6.1 `breakout`

**Config:**

```yaml
breakout:
  enabled: true
  lookbackBars: 20      # int, min 5, max 200
  bufferPercent: 0.001  # fraction of price added beyond high/low
```

**Logic (long):**

- `close` = last closed candle close on entry TF
- `rangeHigh` = max high of previous `lookbackBars` candles (excluding current bar if engine passes closed bar only — use same candle set as Fib entry evaluation)
- Confirm if `close > rangeHigh * (1 + bufferPercent)`
- **SL:** below `rangeHigh` or ATR-based: `close - slAtrMultiplier * atr` — **pick tighter of structure vs ATR** (document in impl: use `min(structureSl, atrSl)` for long)
- **TP:** `close + tpAtrMultiplier * atr` (align with global risk)
- Short: symmetric with range low

**Reject reasons:** `breakout_not_triggered`, `insufficient_breakout_bars`

### 6.2 `emaMomentum`

**Config:**

```yaml
emaMomentum:
  enabled: true
  fastPeriod: 9
  slowPeriod: 21
  slopeLookback: 3   # bars to confirm fast EMA slope
```

**Logic (long):**

- Compute EMA(fast), EMA(slow) on entry TF closes
- Confirm if `EMA_fast > EMA_slow` at close
- Slope: `(EMA_fast[now] - EMA_fast[now - slopeLookback]) / EMA_fast[now - slopeLookback] > 0`
- Short: inverse
- **SL/TP:** ATR-based using `risk.slAtrMultiplier` / `risk.tpAtrMultiplier` from latest ATR on entry TF (same `atrPeriod` as strategy)

**Reject reasons:** `ema_not_aligned`, `ema_slope_weak`, `insufficient_ema_bars`

### 6.3 Shared volatility guard (optional, recommended)

Alternates should **reuse** the same ATR percent bounds as Fib (`minAtrPercent`, `maxAtrPercent`) before confirming — extract small helper `checkAtrBounds(candles, config)` in `src/market/` or `entries/atr-guard.ts` to avoid drift.

---

## 7. Configuration Schema

### 7.1 YAML shape

```yaml
strategy:
  # ... existing strategy fields ...
  alternateEntries:
    enabled: false
    order:
      - breakout
      - emaMomentum
    fallbackOnReasons:
      - outside_fib_zone
      - no_matching_impulse_leg
      - risk_reward_too_low
    positionScale: 1.0    # (0, 1], applies when entryPath != fib
    breakout:
      enabled: true
      lookbackBars: 20
      bufferPercent: 0.001
    emaMomentum:
      enabled: true
      fastPeriod: 9
      slowPeriod: 21
      slopeLookback: 3
```

### 7.2 Zod (`src/config/schema.ts`)

- Add `AlternateEntriesSchema` under `strategy`
- `order`: array of `z.enum(['breakout', 'emaMomentum'])` for v1; extend enum when new paths ship
- `positionScale`: `z.number().min(0.1).max(1).default(1)`
- `fallbackOnReasons`: array of `z.string().min(1)` with default list above
- Per-path blocks: strict objects as above
- **Default entire `alternateEntries`:** `{ enabled: false, order: [...], ... }` so missing key = safe

### 7.3 Config files to update

| File | Change |
|------|--------|
| `config/default.yaml` | Add `alternateEntries` with `enabled: false` |
| `config/production.yaml` | Set `enabled: false` until Phase 11 validation; keep path blocks for documentation |
| `config/experiments/alternate-entries-on.yaml` | New preset: `enabled: true` |
| `config/experiments/alternate-entries-off.yaml` | Explicit off (baseline) |
| `config/experiments/alternate-matrix.yaml` | Matrix for backtest comparison |

---

## 8. Risk & Execution

### 8.1 Position sizing

- `RiskEngine` / position sizer reads `intent.entryPath`
- If `entryPath !== 'fib'` and `alternateEntries.positionScale < 1`, multiply computed notional by `positionScale` before `maxNotionalUsdt` cap
- Fib path: unchanged (`positionScale` ignored)

### 8.2 Order plan

- `stopLoss` / `takeProfit` on intent from evaluator when set
- If alternate omits TP, fall back to existing ATR TP logic in risk module (same as today)

### 8.3 One position per symbol

Unchanged — first successful path emits one intent; pending signal removed.

---

## 9. Observability & Review

### 9.1 Logging

When `entryGates.logRejects: true`, log alternate attempts at **debug** (optional v1) or **info**:

`{ symbol, direction, entryPath, reason, stage: 'entry', fallback: true }`

### 9.2 Gate reject capture

Extend `strategy:gateReject` payload (optional field):

`attemptedPath?: EntryPathId`

Only when `captureRejects: true`.

### 9.3 Trade review / export

- CSV column: `entry_path`
- Checklist: compare `would_take_again` for `fib` vs `breakout` vs `emaMomentum` samples (≥20 per path before enabling production)

### 9.4 Backtest report

`report.json` metrics optional breakdown:

```json
"byEntryPath": {
  "fib": { "totalTrades": 0, "winRate": 0, "totalPnlUsdt": 0 },
  "breakout": { ... },
  "emaMomentum": { ... }
}
```

---

## 10. Testing

| Level | Scope |
|-------|--------|
| Unit | `breakout-entry`, `ema-momentum-entry`, `fib-entry` with fixture candles |
| Unit | `EntryGate` fallback: fib fail `outside_fib_zone` → breakout confirm |
| Unit | Context fail → no alternate called (spy/mock registry) |
| Unit | `fallbackOnReasons` excludes `atr_below_minimum` |
| Integration | Backtest Oct–Dec 2024 window: `alternate-entries-off` vs `on` |
| Regression | Existing backtest parity with alternates **disabled** matches prior report ±0 trades |

---

## 11. Rollout & Acceptance

### 11.1 Phase 11 workflow (suggested)

1. Implement registry + gate orchestration + `entryPath` on intent
2. Ship MVP evaluators behind `enabled: false`
3. Run `backtest-matrix` with `alternate-matrix.yaml` (mock + real signal runs documented separately)
4. Export trade review; primary metric `would_take_again` by path
5. Enable on testnet 1 week with `alternateEntries.enabled: true`, `positionScale: 0.75` optional experiment
6. Production: only after checklist; document in `HUONG-DAN-FUTURES.md` § strategy

### 11.2 Acceptance criteria

- [ ] With `alternateEntries.enabled: false`, backtest trade list identical to pre-change baseline (same config/window)
- [ ] With `enabled: true`, trade count ≥ baseline on same mock window (Oct–Dec 2024, production symbols)
- [ ] No intent emitted when `evaluateContext` fails
- [ ] Every filled trade has `entryPath` populated
- [ ] New path can be added by new file + registry + Zod enum without editing `StrategyEngine`
- [ ] `validate` CLI passes with updated YAML

---

## 12. Adding a New Entry Path (Playbook)

1. Create `src/strategy/entries/my-path-entry.ts` implementing `EntryPathEvaluator`
2. Add config block under `strategy.alternateEntries.myPath`
3. Extend Zod enum in `order` array
4. Register in `registry.ts`: `registry.set('myPath', new MyPathEntry())`
5. Add experiment YAML + matrix row
6. Document behavior and reject reasons in this spec appendix or `MTF-ENTRY-RULES.md` sibling doc

---

## 13. Related Documents

| Document | Relevance |
|----------|-----------|
| `2026-05-20-crypto-news-trader-design.md` | Parent architecture |
| `.planning/phases/04-mtf-entry-alignment/MTF-ENTRY-RULES.md` | Primary Fib/context rules |
| `.planning/phases/06-entry-quality-gates/ENTRY-GATES-DESIGN.md` | EntryGate behavior |
| `.planning/phases/08-trade-review-workflow/TRADE-REVIEW-CHECKLIST.md` | Review by `entry_path` |
| `.planning/phases/02-backtest-experiments/EXPERIMENT-PROTOCOL.md` | Matrix comparison |
| `docs/HUONG-DAN-FUTURES.md` | Operator docs (update after implementation) |

---

## 14. Spec Self-Review (2026-05-25)

| Check | Result |
|-------|--------|
| Placeholders / TBD | None |
| Internal consistency | Fallback only after context pass; fib first; registry extensibility consistent |
| Scope | Single feature; no RSS/LLM scope creep |
| Ambiguity | SL merge rule for breakout noted; impl picks documented min(structure, atr) for long |
| Contradictions with parent spec | Parent says no trailing stop phase 2 — unchanged; leverage unchanged |

---

*End of specification.*
