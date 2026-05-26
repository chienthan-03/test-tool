# Entry Profile (Swing vs Intraday Momentum) — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-27-entry-profile-momentum-design` |
| **Status** | Approved (brainstorming) — ready for implementation plan |
| **Parent spec** | `2026-05-20-crypto-news-trader-design` |
| **Related** | `2026-05-25-alternate-entry-paths-design` |
| **Brainstorming choices** | **B** one YAML + `entryProfile` switch; **Momentum** intraday (EMA context, breakout → EMA entry, no Fib) |
| **Version** | 1.0 |

---

## 1. Summary

Add **`strategy.entryProfile: swing | intraday`** in a single config file (e.g. `config/production.yaml`). The bot selects **context gate** and **entry path chain** from `strategy.profiles.*` — no second process, no duplicate repo presets required for mode switching.

| Profile | Suggested TF | Context | Entry chain |
|---------|--------------|---------|-------------|
| **`swing`** (default) | `1d` / `4h` | Elliott (`MtfEngine.evaluateContext`) | **Fib** primary → optional **alternate fallback** (existing `alternateEntries`) |
| **`intraday`** | `1h` / `15m` | **EMA trend** on context TF | **breakout** → **emaMomentum** (sequential); **Fib/Elliott not invoked** |

Intraday uses shared parameter blocks under `strategy.alternateEntries.breakout` / `emaMomentum` for lookback and EMA periods. Risk applies **`profiles.intraday.positionScale`** (default `0.75`) to all intraday entries via existing `entryPath !== 'fib'` logic (extended to treat any intraday path as scaled).

**Production default remains `entryProfile: swing`** with `timeframes: 1d/4h` until intraday is validated by backtest matrix + optional testnet review.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- One config file, one switch: `entryProfile` changes strategy behavior without code edits
- **Turn off** Elliott + Fib when `intraday` — replace with momentum-appropriate gates
- Reuse existing `BreakoutEntryEvaluator`, `EmaMomentumEntryEvaluator`, `entryPath`, backtest `byEntryPath`
- Preserve **100% backward compatibility** for `swing` profile (same flow as post–alternate-entry-paths behavior)
- CLI `validate` warns when profile and `timeframes` are mismatched (e.g. intraday profile + `1d/4h`)
- Extensible: future profiles (`scalp`, etc.) follow same pattern

### 2.2 Non-Goals (v1)

- Auto-changing `timeframes` when `entryProfile` changes (warn only)
- `newsImpulse` entry path (phase 2)
- Mean reversion / RSI / VWAP paths
- Different RSS poll intervals per profile
- Separate `production-intraday.yaml` as the primary workflow (optional experiment file allowed)
- Replacing or removing swing profile code paths

---

## 3. Decisions Log

| Topic | Decision |
|-------|----------|
| Config surface | `strategy.entryProfile` + `strategy.profiles.swing` / `intraday` |
| Intraday context | `emaTrend` on `timeframes.context` (default EMA 20/50) |
| Intraday entry order | `breakout` then `emaMomentum`; first `confirm` wins |
| Fib in intraday | Never called |
| `alternateEntries.enabled` | Applies only to **swing** Fib fallback; ignored for intraday chain |
| Intraday position size | `profiles.intraday.positionScale` (default `0.75`) on all intraday `entryPath` values |
| Elliott in intraday | Never called |
| Default profile | `swing` |
| TF guidance | `swing` → `1d/4h`; `intraday` → `1h/15m` (validate warns) |

---

## 4. Configuration

### 4.1 Top-level switch

```yaml
strategy:
  entryProfile: swing   # swing | intraday

  profiles:
    swing:
      contextMode: elliott
      entryPaths:
        primary: fib
      useAlternateFallback: true   # honors alternateEntries.enabled + fallbackOnReasons

    intraday:
      contextMode: emaTrend
      contextEma:
        fastPeriod: 20
        slowPeriod: 50
      entryPaths:
        order: [breakout, emaMomentum]
      positionScale: 0.75

  # Shared path parameters (both profiles)
  alternateEntries:
    enabled: false          # swing fallback master switch only
    order: [breakout, emaMomentum]
    fallbackOnReasons: [...]
    positionScale: 1.0      # swing: scale only non-fib alternates when fallback used
    breakout: { enabled: true, lookbackBars: 20, bufferPercent: 0.001 }
    emaMomentum: { enabled: true, fastPeriod: 9, slowPeriod: 21, slopeLookback: 3 }
```

### 4.2 Zod (`src/config/schema.ts`)

- `EntryProfileSchema = z.enum(['swing', 'intraday'])`
- `SwingProfileSchema`: `contextMode: z.literal('elliott')`, `entryPaths.primary: z.literal('fib')`, `useAlternateFallback: z.boolean().default(true)`
- `IntradayProfileSchema`: `contextMode: z.literal('emaTrend')`, `contextEma: { fastPeriod, slowPeriod }`, `entryPaths.order` array of `breakout | emaMomentum` (min 1), `positionScale` default `0.75`
- Default `entryProfile: 'swing'`
- Schema refine (non-fatal in loader, fatal on `validate` command optional): warn if `entryProfile === 'intraday'` and `context` is `1d` or `entry` is `4h`

### 4.3 `config/production.yaml` (operator)

- Default: `entryProfile: swing`, `timeframes: { context: 1d, entry: 4h }`
- Operator sets `entryProfile: intraday` and `timeframes: { context: 1h, entry: 15m }` when desired
- Document in `HUONG-DAN-FUTURES.md` § profile switch

### 4.4 Experiment files

| File | Purpose |
|------|---------|
| `config/experiments/profile-swing-baseline.yaml` | `entryProfile: swing`, `1d/4h` |
| `config/experiments/profile-intraday-momentum.yaml` | `entryProfile: intraday`, `1h/15m` |
| `config/experiments/profile-matrix.yaml` | Mock window comparison |

---

## 5. Architecture

### 5.1 New: context gate abstraction

```typescript
export type ContextGateResult = { allow: boolean; reason?: string };

export interface ContextGate {
  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
    ctx: EntryEvalContext,
  ): ContextGateResult;
}
```

| Implementation | File | Behavior |
|----------------|------|----------|
| `ElliottContextGate` | `src/strategy/context/elliott-context-gate.ts` | Delegates to `MtfEngine.evaluateContext` |
| `EmaTrendContextGate` | `src/strategy/context/ema-trend-context-gate.ts` | EMA fast/slow on **context TF** candles |

### 5.2 `EmaTrendContextGate` rules

Uses `profiles.intraday.contextEma` periods on `config.timeframes.context` closes.

| Condition | Result |
|-----------|--------|
| Insufficient bars | `allow: false`, `ema_context_insufficient_data` |
| Long signal + `EMA_fast > EMA_slow` | `allow: true` |
| Short signal + `EMA_fast < EMA_slow` | `allow: true` |
| Direction opposes EMA bias | `allow: false`, `ema_context_conflict` |
| `\|EMA_fast - EMA_slow\| / close < flatThreshold` (default 0.05%) | `allow: false`, `ema_context_flat` unless `strength >= strongNewsThreshold` |

`flatThreshold` configurable under `profiles.intraday.contextEma.flatPercent` (default `0.0005`).

### 5.3 Registry refactor

Replace fib-fixed `EntryPathRegistry` with:

```typescript
export type EntryPathChain = {
  paths: EntryPathEvaluator[];  // ordered; first confirm wins
};

export const buildEntryPathChain = (
  config: AppConfig,
  mtf: MtfEngine,
): EntryPathChain => { ... };
```

| Profile | Chain |
|---------|-------|
| `swing` | `[FibEntryEvaluator]` as primary; alternates appended only for fallback logic in `EntryGate` (keep existing fib-first + fallback semantics) |
| `intraday` | `[BreakoutEntryEvaluator, EmaMomentumEntryEvaluator]` filtered by `enabled` + `order` |

### 5.4 `EntryGate.evaluate()` profiles

**Swing** (preserve existing behavior):

```text
if !entryGates.enabled → fib only (no Elliott), same as today
else:
  elliottContext → if !allow REJECT context
  fib → if confirm ALLOW fib
  if useAlternateFallback && alternateEntries.enabled && reason in whitelist:
    for alt in alternates → first confirm ALLOW
  REJECT entry
```

**Intraday**:

```text
if !entryGates.enabled → skip context; run entry chain only (document in operator guide)
else:
  emaTrendContext → if !allow REJECT context
  for path in [breakout, emaMomentum] (enabled, in order):
    if path.evaluate confirm → ALLOW entryPath=path.id
  REJECT entry (last reason)
```

`entryGates.enabled: true` recommended for intraday so EMA context always runs.

### 5.5 Risk / `positionScale`

| Profile | Scale rule |
|---------|------------|
| `swing` | `entryPath !== 'fib'` → `× alternateEntries.positionScale` (unchanged) |
| `intraday` | any entry → `× profiles.intraday.positionScale` |

Implement in `RiskEngine` via resolved helper `resolvePositionScale(config, entryPath)`.

### 5.6 Unchanged components

- `StrategyEngine`, `PendingSignalStore`, RSS pipeline, `TradeIntent.entryPath`
- `MtfEngine` remains for swing; intraday does not delete it

---

## 6. Validation CLI

Extend `validate` command (or config loader warnings):

| Condition | Severity |
|-----------|----------|
| `entryProfile: intraday` and (`context` in `1d` or `entry` in `4h`) | **warn** |
| `entryProfile: swing` and (`entry` in `1m`,`3m`,`5m`,`15m`) | **warn** |
| `intraday` + `profiles.intraday.entryPaths.order` empty | **error** |
| Unknown `entryProfile` | **error** (Zod) |

---

## 7. Testing

| Test | Assert |
|------|--------|
| `ema-trend-context-gate.test.ts` | long/short align; conflict; flat; strong news bypass flat |
| `entry-gate-swing.test.ts` | Regression: identical allow/reject to pre-profile baseline fixture |
| `entry-gate-intraday.test.ts` | No fib call; breakout then ema order; context block skips entry |
| `entry-path-chain.test.ts` | swing vs intraday chain composition |
| `config-loader.test.ts` | Defaults; invalid profile |
| `risk-position-scale-profile.test.ts` | intraday 0.75 scale on breakout |
| Integration | `entry-gates-intent` with `entryProfile: intraday` emits `entryPath: breakout` |

**Regression gate:** `entryProfile: swing` + `1d/4h` + mock backtest Oct–Dec 2024 → **same** `totalTrades` as commit before this feature (±0).

---

## 8. Rollout

1. Implement profile resolver + `EmaTrendContextGate`
2. Refactor `EntryGate` + `buildEntryPathChain`
3. Schema + `default.yaml` / `production.yaml` (`swing` default)
4. Experiment matrix `profile-swing` vs `profile-intraday`
5. Document `HUONG-DAN-FUTURES.md`
6. Enable `entryProfile: intraday` on testnet only after review — not default for live

---

## 9. Operator quick reference

```yaml
# Swing (research baseline)
strategy:
  entryProfile: swing
timeframes:
  context: 1d
  entry: 4h

# Intraday momentum
strategy:
  entryProfile: intraday
timeframes:
  context: 1h
  entry: 15m
```

```powershell
npm run dev -- validate -- --config config/production.yaml
npm run dev -- backtest -- --from 2024-10-01 --to 2024-12-31 --config config/experiments/profile-intraday-momentum.yaml --mock-sentiment
```

---

## 10. Future extensions (out of v1)

- `entryProfile: scalp` with faster TF and tighter ATR
- `newsImpulse` path in intraday chain after strong RSS signals
- Per-profile `symbols` override in `profiles.intraday.symbols`

---

## 11. Spec Self-Review (2026-05-27)

| Check | Result |
|-------|--------|
| Placeholders / TBD | None |
| Consistency with alternate-entry spec | Swing path unchanged; intraday uses same evaluators, different orchestration |
| Scope | Single feature; no RSS/LLM |
| Ambiguity | `entryGates.enabled: false` on intraday documented as context-skipped mode |
| Backward compatibility | `swing` default explicit |

---

## 12. Related Documents

| Document | Relevance |
|----------|-----------|
| `2026-05-25-alternate-entry-paths-design.md` | Swing fallback paths |
| `.planning/phases/04-mtf-entry-alignment/MTF-TIMEFRAME-COMPARISON.md` | Why `1d/4h` for swing |
| `docs/HUONG-DAN-FUTURES.md` | Operator guide (update after impl) |
| `docs/superpowers/plans/2026-05-25-alternate-entry-paths.md` | Prior implementation pattern |

---

*End of specification.*
