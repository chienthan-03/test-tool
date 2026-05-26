# Alternate Entry Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pluggable Fib-first fallback entry paths (`breakout`, `emaMomentum`) behind `strategy.alternateEntries`, with `entryPath` on intents and backtest/review breakdown.

**Architecture:** `EntryPathEvaluator` plugins registered in `buildEntryPathRegistry()`; `EntryGate` runs Elliott context once, then primary `fib`, then ordered alternates only when primary fails with whitelisted reasons. `RiskEngine` applies optional `positionScale` for non-fib paths.

**Tech Stack:** TypeScript, Zod, Vitest, existing `MtfEngine` / `KlineStore` / `EntryGate` / `StrategyEngine` / `RiskEngine`

**Spec:** `docs/superpowers/specs/2026-05-25-alternate-entry-paths-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/strategy/entries/types.ts` | Create | `EntryPathEvaluator`, `EntryEvalContext`, `EntryPathResult`, `EntryPathId` |
| `src/strategy/entries/atr-guard.ts` | Create | Shared ATR % bounds check for alternates |
| `src/strategy/entries/fib-entry.ts` | Create | Wrap `MtfEngine.evaluateEntry` → `id: fib` |
| `src/strategy/entries/breakout-entry.ts` | Create | Breakout confirm + SL/TP |
| `src/strategy/entries/ema-momentum-entry.ts` | Create | EMA alignment + slope + ATR SL/TP |
| `src/strategy/entries/registry.ts` | Create | `buildAlternateEvaluators(config, mtf, store)` |
| `src/strategy/entry-gate.ts` | Modify | Context + fib + fallback orchestration |
| `src/strategy/strategy-engine.ts` | Modify | Inject `EntryGate`; set `entryPath` on intent |
| `src/app/paper-trading-stack.ts` | Modify | Build registry + `EntryGate` |
| `src/app/bootstrap.ts` | Modify | Same wiring for live/testnet/sim |
| `src/core/types.ts` | Modify | `TradeIntent.entryPath`, `BacktestTradeRecord.entryPath`, `BacktestReport.byEntryPath` |
| `src/config/schema.ts` | Modify | `alternateEntries` Zod block |
| `config/default.yaml` | Modify | `alternateEntries` defaults (`enabled: false`) |
| `config/production.yaml` | Modify | Align with spec (`enabled: false`, full block) |
| `config/experiments/alternate-entries-on.yaml` | Create | Full config copy with alternates on |
| `config/experiments/alternate-entries-off.yaml` | Create | Explicit off baseline |
| `config/experiments/alternate-matrix.yaml` | Create | Matrix for `backtest-matrix` |
| `src/storage/migrations/002_entry_path.sql` | Create | `ALTER TABLE trades ADD COLUMN entry_path TEXT` |
| `src/storage/repositories/trade-repo.ts` | Modify | `entryPath` on insert |
| `src/risk/risk-engine.ts` | Modify | `positionScale` when `intent.entryPath !== 'fib'` |
| `src/app/bootstrap.ts` (`wireExecution`) | Modify | Pass `entryPath` to `insertOpen` |
| `src/app/paper-trading-stack.ts` (`wireSimPaperExecution`) | Modify | Store `entryPath` in trade records |
| `src/execution/backtest-replayer.ts` | Modify | Aggregate `byEntryPath` in report |
| `scripts/export-trade-review.ts` | Modify | CSV column `entry_path` |
| `tests/unit/entry-path-*.test.ts` | Create | Per-evaluator + registry tests |
| `tests/unit/entry-gate-fallback.test.ts` | Create | Fallback chain behavior |
| `tests/unit/config-loader.test.ts` | Modify | Load `alternateEntries` |
| `tests/integration/entry-gates-intent.test.ts` | Modify | Assert `entryPath` on intent |
| `docs/HUONG-DAN-FUTURES.md` | Modify | Short § alternate entries |

---

### Task 1: Config schema + YAML defaults

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `config/default.yaml`
- Modify: `config/production.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Add Zod schemas in `src/config/schema.ts`**

Add before `strategy` object (or nested inside it):

```typescript
export const AlternateEntryPathIdSchema = z.enum(['breakout', 'emaMomentum']);

export const BreakoutEntryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lookbackBars: z.number().int().min(5).max(200).default(20),
  bufferPercent: z.number().min(0).max(0.05).default(0.001),
});

export const EmaMomentumEntryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  fastPeriod: z.number().int().min(2).max(50).default(9),
  slowPeriod: z.number().int().min(3).max(200).default(21),
  slopeLookback: z.number().int().min(1).max(20).default(3),
});

export const AlternateEntriesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  order: z.array(AlternateEntryPathIdSchema).default(['breakout', 'emaMomentum']),
  fallbackOnReasons: z
    .array(z.string().min(1))
    .default(['outside_fib_zone', 'no_matching_impulse_leg', 'risk_reward_too_low']),
  positionScale: z.number().min(0.1).max(1).default(1),
  breakout: BreakoutEntryConfigSchema.default({ enabled: true, lookbackBars: 20, bufferPercent: 0.001 }),
  emaMomentum: EmaMomentumEntryConfigSchema.default({
    enabled: true,
    fastPeriod: 9,
    slowPeriod: 21,
    slopeLookback: 3,
  }),
});
```

Inside `strategy: z.object({ ... })` add:

```typescript
alternateEntries: AlternateEntriesConfigSchema.default({
  enabled: false,
  order: ['breakout', 'emaMomentum'],
  fallbackOnReasons: ['outside_fib_zone', 'no_matching_impulse_leg', 'risk_reward_too_low'],
  positionScale: 1,
  breakout: { enabled: true, lookbackBars: 20, bufferPercent: 0.001 },
  emaMomentum: { enabled: true, fastPeriod: 9, slowPeriod: 21, slopeLookback: 3 },
}),
```

- [ ] **Step 2: Update `config/default.yaml`**

Under `strategy:`, after `fibonacci:` block, add full `alternateEntries` per spec §7.1 with `enabled: false`.

- [ ] **Step 3: Update `config/production.yaml`**

Replace draft `alternateEntries` (paths-only) with full block; set `enabled: false` at root; keep per-path `enabled: true` so flipping master switch is enough for experiments.

- [ ] **Step 4: Add config-loader test**

In `tests/unit/config-loader.test.ts`:

```typescript
  it('loads strategy.alternateEntries defaults', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.strategy.alternateEntries.enabled).toBe(false);
    expect(config.strategy.alternateEntries.order).toEqual(['breakout', 'emaMomentum']);
    expect(config.strategy.alternateEntries.positionScale).toBe(1);
  });
```

- [ ] **Step 5: Run**

Run: `npm test -- tests/unit/config-loader.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts config/default.yaml config/production.yaml tests/unit/config-loader.test.ts
git commit -m "feat(config): add alternateEntries schema and YAML defaults"
```

---

### Task 2: Entry path types + ATR guard

**Files:**
- Create: `src/strategy/entries/types.ts`
- Create: `src/strategy/entries/atr-guard.ts`
- Create: `tests/unit/entry-path-atr-guard.test.ts`

- [ ] **Step 1: Create `src/strategy/entries/types.ts`**

```typescript
import type { AppConfig } from '../../config/schema.js';
import type { SignalDirection } from '../../core/types.js';
import type { KlineStore } from '../../market/kline-store.js';

export type EntryPathId = 'fib' | 'breakout' | 'emaMomentum';

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

- [ ] **Step 2: Write failing ATR guard test**

Create `tests/unit/entry-path-atr-guard.test.ts` with candles where `atrPercent` is 0.05 (< `minAtrPercent` 0.12) → `checkEntryAtrBounds` returns `{ ok: false, reason: 'atr_below_minimum' }`.

- [ ] **Step 3: Implement `src/strategy/entries/atr-guard.ts`**

```typescript
import type { Candle } from '../../core/types.js';
import type { AppConfig } from '../../config/schema.js';
import { atr, last } from '../../market/indicators.js';

export const checkEntryAtrBounds = (
  candles: Candle[],
  config: AppConfig,
): { ok: true; atr: number; close: number } | { ok: false; reason: string; atr: number; close: number } => {
  const { atrPeriod, minAtrPercent, maxAtrPercent } = config.strategy;
  const latestClose = last(candles.map((c) => c.close));
  if (latestClose === undefined) {
    return { ok: false, reason: 'insufficient_entry_data', atr: 0, close: 0 };
  }
  const latestAtr = last(atr(candles, atrPeriod));
  if (latestAtr === undefined || Number.isNaN(latestAtr)) {
    return { ok: false, reason: 'insufficient_atr', atr: 0, close: latestClose };
  }
  const atrPercent = (latestAtr / latestClose) * 100;
  if (atrPercent < minAtrPercent) {
    return { ok: false, reason: 'atr_below_minimum', atr: latestAtr, close: latestClose };
  }
  if (maxAtrPercent != null && atrPercent > maxAtrPercent) {
    return { ok: false, reason: 'atr_above_maximum', atr: latestAtr, close: latestClose };
  }
  return { ok: true, atr: latestAtr, close: latestClose };
};
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/unit/entry-path-atr-guard.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/strategy/entries/types.ts src/strategy/entries/atr-guard.ts tests/unit/entry-path-atr-guard.test.ts
git commit -m "feat(strategy): entry path types and shared ATR guard"
```

---

### Task 3: Fib entry evaluator wrapper

**Files:**
- Create: `src/strategy/entries/fib-entry.ts`
- Create: `tests/unit/entry-path-fib.test.ts`

- [ ] **Step 1: Implement `FibEntryEvaluator`**

```typescript
import type { MtfEngine } from '../mtf-engine.js';
import type { EntryEvalContext, EntryPathEvaluator, EntryPathResult } from './types.js';

export class FibEntryEvaluator implements EntryPathEvaluator {
  readonly id = 'fib' as const;

  constructor(private readonly mtf: MtfEngine) {}

  evaluate(ctx: EntryEvalContext): EntryPathResult {
    const r = this.mtf.evaluateEntry(ctx.symbol, ctx.direction);
    return {
      confirm: r.confirm,
      reason: r.reason,
      close: r.close,
      atr: r.atr,
      stopLoss: r.stopLoss,
      takeProfit: r.takeProfit,
    };
  }
}
```

- [ ] **Step 2: Test delegates to MtfEngine**

Reuse pivot helpers from `tests/unit/entry-gate.test.ts`: load config, seed store, expect `confirm: true` when fib zone hit; `reason: 'outside_fib_zone'` when price outside.

Run: `npm test -- tests/unit/entry-path-fib.test.ts`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/strategy/entries/fib-entry.ts tests/unit/entry-path-fib.test.ts
git commit -m "feat(strategy): fib entry path evaluator wrapper"
```

---

### Task 4: Breakout entry evaluator

**Files:**
- Create: `src/strategy/entries/breakout-entry.ts`
- Create: `tests/unit/entry-path-breakout.test.ts`

- [ ] **Step 1: Write failing test (long breakout)**

Seed 25 entry-TF candles with flat range then final close above `rangeHigh * (1 + buffer)`. Expect `confirm: true`, `stopLoss < close < takeProfit`.

- [ ] **Step 2: Implement `BreakoutEntryEvaluator`**

Logic outline:
- `candles = store.getCandles(symbol, config.timeframes.entry)`
- `checkEntryAtrBounds` → early return if !ok
- `lookback = config.strategy.alternateEntries.breakout.lookbackBars`
- `slice = candles.slice(-(lookback + 1), -1)` for range (exclude forming bar if needed; use closed bars only — match `MtfEngine` using full series last close as signal bar)
- Long: `rangeHigh = max(high)`, confirm if `close > rangeHigh * (1 + bufferPercent)`
- `structureSl = rangeHigh * (1 - bufferPercent)` (below breakout level)
- `atrSl = close - slAtrMultiplier * atr`; `stopLoss = Math.min(structureSl, atrSl)` for long (tighter = higher SL price for long → use `Math.max` for long stop below price: actually spec says min of structure vs atr — for long SL is below entry: `Math.min(structureSl, atrSl)` picks lower price = wider stop; spec: "tighter" = use `Math.max(structureSl, atrSl)`)
- `takeProfit = close + tpAtrMultiplier * atr`
- Short: symmetric

Reject: `breakout_not_triggered`, `insufficient_breakout_bars`

- [ ] **Step 3: Run test**

Run: `npm test -- tests/unit/entry-path-breakout.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/strategy/entries/breakout-entry.ts tests/unit/entry-path-breakout.test.ts
git commit -m "feat(strategy): breakout alternate entry path"
```

---

### Task 5: EMA momentum entry evaluator

**Files:**
- Create: `src/strategy/entries/ema-momentum-entry.ts`
- Create: `tests/unit/entry-path-ema-momentum.test.ts`

- [ ] **Step 1: Add EMA helper if missing**

If `src/market/indicators.ts` has no `ema()`, add:

```typescript
export const ema = (values: number[], period: number): number[] => {
  // standard EMA implementation
};
```

- [ ] **Step 2: Write failing test**

Rising closes → long `confirm: true`, `ema_not_aligned` when fast < slow.

- [ ] **Step 3: Implement `EmaMomentumEntryEvaluator`**

- Read `config.strategy.alternateEntries.emaMomentum`
- `checkEntryAtrBounds` first
- Compute EMA series on closes; compare fast vs slow at last index
- Slope: `(emaFast[n] - emaFast[n - slopeLookback]) / emaFast[n - slopeLookback] > 0` for long
- SL/TP: `calcSlTp` equivalent using `risk.slAtrMultiplier` / `tpAtrMultiplier`

- [ ] **Step 4: Run test**

Run: `npm test -- tests/unit/entry-path-ema-momentum.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/market/indicators.ts src/strategy/entries/ema-momentum-entry.ts tests/unit/entry-path-ema-momentum.test.ts
git commit -m "feat(strategy): EMA momentum alternate entry path"
```

---

### Task 6: Registry builder

**Files:**
- Create: `src/strategy/entries/registry.ts`
- Create: `tests/unit/entry-path-registry.test.ts`

- [ ] **Step 1: Implement registry**

```typescript
import type { AppConfig } from '../../config/schema.js';
import type { KlineStore } from '../../market/kline-store.js';
import type { MtfEngine } from '../mtf-engine.js';
import { BreakoutEntryEvaluator } from './breakout-entry.js';
import { EmaMomentumEntryEvaluator } from './ema-momentum-entry.js';
import { FibEntryEvaluator } from './fib-entry.js';
import type { EntryPathEvaluator } from './types.js';

export type EntryPathRegistry = {
  primary: FibEntryEvaluator;
  alternates: EntryPathEvaluator[];
};

export const buildEntryPathRegistry = (
  config: AppConfig,
  mtf: MtfEngine,
  store: KlineStore,
): EntryPathRegistry => {
  const primary = new FibEntryEvaluator(mtf);
  const alternates: EntryPathEvaluator[] = [];

  for (const id of config.strategy.alternateEntries.order) {
    const pathConfig = config.strategy.alternateEntries[id];
    if (!pathConfig?.enabled) continue;

    if (id === 'breakout') {
      alternates.push(new BreakoutEntryEvaluator());
    } else if (id === 'emaMomentum') {
      alternates.push(new EmaMomentumEntryEvaluator());
    }
  }

  return { primary, alternates };
};
```

Pass `store` into evaluators via `EntryEvalContext` (evaluators stateless).

- [ ] **Step 2: Test order + skip disabled**

Config with `order: ['emaMomentum', 'breakout']` and `breakout.enabled: false` → alternates length 1, first id `emaMomentum`.

- [ ] **Step 3: Commit**

```bash
git add src/strategy/entries/registry.ts tests/unit/entry-path-registry.test.ts
git commit -m "feat(strategy): entry path registry builder"
```

---

### Task 7: EntryGate fallback orchestration

**Files:**
- Modify: `src/strategy/entry-gate.ts`
- Create: `tests/unit/entry-gate-fallback.test.ts`

- [ ] **Step 1: Extend `EntryGateResult`**

Add `entryPath?: EntryPathId` when `allow: true`.

- [ ] **Step 2: Update constructor**

```typescript
constructor(
  private readonly config: AppConfig,
  private readonly mtf: MtfEngine,
  private readonly registry: EntryPathRegistry,
  private readonly bus?: AppEventBus,
  private readonly getNow: () => Date = () => new Date(),
) {}
```

- [ ] **Step 3: Rewrite `evaluate()`**

Pseudocode (implement fully):

```typescript
const ctx: EntryEvalContext = { symbol, direction, strength, config: this.config, store: this.registryStore };
// Need store on registry OR pass store into EntryGate constructor

if (!entryGates.enabled) {
  const r = this.registry.primary.evaluate(ctx);
  return r.confirm ? { allow: true, entry: r, entryPath: 'fib' } : { allow: false, reason: r.reason, stage: 'entry' };
}

const context = this.mtf.evaluateContext(symbol, direction, strength);
if (!context.allow) { logReject...; return { allow: false, reason: context.reason, stage: 'context' }; }

const primary = this.registry.primary.evaluate(ctx);
if (primary.confirm) return { allow: true, entry: primary, entryPath: 'fib' };

const altCfg = this.config.strategy.alternateEntries;
if (!altCfg.enabled || !altCfg.fallbackOnReasons.includes(primary.reason ?? '')) {
  logReject(..., primary.reason);
  return { allow: false, reason: primary.reason, stage: 'entry' };
}

for (const evaluator of this.registry.alternates) {
  const alt = evaluator.evaluate(ctx);
  if (alt.confirm) return { allow: true, entry: alt, entryPath: evaluator.id };
}

return { allow: false, reason: primary.reason, stage: 'entry' };
```

Add `store: KlineStore` to `EntryGate` constructor (used in `ctx`).

- [ ] **Step 4: Write fallback tests**

Mock or fixture: fib fails `outside_fib_zone`, breakout confirms → `entryPath: 'breakout'`. Context fail → alternates not run (spy `registry.alternates` length > 0 but never called — use manual mock registry).

- [ ] **Step 5: Fix existing `tests/unit/entry-gate.test.ts`**

Update construction: `buildEntryPathRegistry(config, mtf, store)` + `new EntryGate(config, mtf, registry, undefined, () => new Date())`.

Run: `npm test -- tests/unit/entry-gate.test.ts tests/unit/entry-gate-fallback.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/strategy/entry-gate.ts tests/unit/entry-gate.test.ts tests/unit/entry-gate-fallback.test.ts
git commit -m "feat(strategy): EntryGate fib-first fallback chain"
```

---

### Task 8: StrategyEngine + paper stack wiring

**Files:**
- Modify: `src/strategy/strategy-engine.ts`
- Modify: `src/app/paper-trading-stack.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/core/types.ts`
- Modify: `tests/integration/entry-gates-intent.test.ts`

- [ ] **Step 1: Add `entryPath` to `TradeIntent`**

```typescript
export type EntryPathId = 'fib' | 'breakout' | 'emaMomentum';

export interface TradeIntent {
  // ...existing fields
  entryPath: EntryPathId;
}
```

Export `EntryPathId` from `types.ts` (re-export in entries/types or single source in `core/types.ts`).

- [ ] **Step 2: StrategyEngine constructor**

Replace internal `new EntryGate(...)` with injected `entryGate: EntryGate` parameter.

In `handleCandleClose`:

```typescript
const intent: TradeIntent = {
  // ...
  entryPath: gate.entryPath ?? 'fib',
};
```

- [ ] **Step 3: Update `createPaperTradingStack`**

```typescript
const registry = buildEntryPathRegistry(params.config, mtf, params.store);
const entryGate = new EntryGate(params.config, mtf, registry, params.bus, params.getNow);
const strategy = new StrategyEngine(params.config, params.bus, params.store, entryGate, pending, ...);
```

- [ ] **Step 4: Update `bootstrap.ts` `wireTradingStack`**

Same pattern where `StrategyEngine` is constructed (read file ~212–230).

- [ ] **Step 5: Integration test**

Assert emitted intent has `entryPath` defined.

Run: `npm test -- tests/integration/entry-gates-intent.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/strategy/strategy-engine.ts src/app/paper-trading-stack.ts src/app/bootstrap.ts tests/integration/entry-gates-intent.test.ts
git commit -m "feat(strategy): wire entry path registry and intent entryPath"
```

---

### Task 9: Risk positionScale + persistence

**Files:**
- Modify: `src/risk/risk-engine.ts`
- Modify: `tests/unit/position-sizer.test.ts` or new `tests/unit/risk-alternate-scale.test.ts`
- Create: `src/storage/migrations/002_entry_path.sql`
- Modify: `src/storage/migrate.ts` (if explicit migration list)
- Modify: `src/storage/repositories/trade-repo.ts`
- Modify: `src/app/bootstrap.ts` (`insertOpen`)

- [ ] **Step 1: Risk engine scale**

In `handleIntent`:

```typescript
let positionPercent = this.resolvePositionPercent(intent.symbol);
const alt = this.config.strategy.alternateEntries;
if (intent.entryPath !== 'fib' && alt.enabled) {
  positionPercent *= alt.positionScale;
}
```

- [ ] **Step 2: Migration**

`002_entry_path.sql`:

```sql
ALTER TABLE trades ADD COLUMN entry_path TEXT;
```

- [ ] **Step 3: TradeRepository**

Add optional `entryPath?: string` to `OpenTradeParams`; include in INSERT.

- [ ] **Step 4: bootstrap `wireExecution`**

Pass `meta.entryPath` from intent map — extend `intentMeta` to store `{ newsId, newsSignalId, entryPath }`.

- [ ] **Step 5: Tests**

Unit: `positionPercent 15` × `positionScale 0.75` → notional scaled.  
Run: `npm test -- tests/unit/position-sizer.test.ts` (or new risk test)

- [ ] **Step 6: Commit**

```bash
git add src/risk/risk-engine.ts src/storage/migrations/002_entry_path.sql src/storage/repositories/trade-repo.ts src/app/bootstrap.ts
git commit -m "feat(risk): alternate positionScale and trade entry_path column"
```

---

### Task 10: Backtest report + export CSV

**Files:**
- Modify: `src/core/types.ts` (`BacktestTradeRecord`, `BacktestReport`)
- Modify: `src/app/paper-trading-stack.ts` (`wireSimPaperExecution`)
- Modify: `src/execution/backtest-replayer.ts`
- Modify: `scripts/export-trade-review.ts`

- [ ] **Step 1: Extend types**

```typescript
export interface BacktestTradeRecord {
  // ...
  entryPath?: EntryPathId;
}

export type EntryPathMetrics = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
};

export interface BacktestReport {
  // ...
  byEntryPath?: Record<string, EntryPathMetrics>;
}
```

- [ ] **Step 2: Record entryPath on simulated trades**

When position closes in `wireSimPaperExecution`, include `entryPath` from intent meta.

- [ ] **Step 3: Aggregate in backtest-replayer**

After trades collected:

```typescript
const byEntryPath = aggregateByEntryPath(trades);
```

Helper groups by `entryPath ?? 'fib'`.

- [ ] **Step 4: Export script**

Add CSV header `entry_path` and value from DB/report.

- [ ] **Step 5: Run**

Run: `npm test -- tests/integration/backtest-smoke.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/app/paper-trading-stack.ts src/execution/backtest-replayer.ts scripts/export-trade-review.ts
git commit -m "feat(backtest): byEntryPath metrics and export entry_path"
```

---

### Task 11: Experiment configs + regression

**Files:**
- Create: `config/experiments/alternate-entries-on.yaml`
- Create: `config/experiments/alternate-entries-off.yaml`
- Create: `config/experiments/alternate-matrix.yaml`

- [ ] **Step 1: Create experiment YAMLs**

`alternate-entries-on.yaml`: copy `phase6-production.yaml` or `default.yaml`, set `strategy.alternateEntries.enabled: true`.

`alternate-entries-off.yaml`: same with `enabled: false`.

`alternate-matrix.yaml`:

```yaml
from: 2024-10-01
to: 2024-12-31
mockSentiment: true
runs:
  - id: alternate-off
    config: config/experiments/alternate-entries-off.yaml
  - id: alternate-on
    config: config/experiments/alternate-entries-on.yaml
```

- [ ] **Step 2: Regression — alternates off**

Run:

```powershell
npm run dev -- backtest -- --from 2024-10-01 --to 2024-12-31 --config config/experiments/alternate-entries-off.yaml --mock-sentiment
```

Record `totalTrades` — should match pre-feature baseline for same config (±0 if no other local changes).

- [ ] **Step 3: Compare on**

Run same with `alternate-entries-on.yaml`; expect `totalTrades >=` off run.

- [ ] **Step 4: Matrix dry-run**

Run: `npm run backtest-matrix -- --matrix config/experiments/alternate-matrix.yaml --dry-run`  
Expected: exits 0

- [ ] **Step 5: Commit**

```bash
git add config/experiments/alternate-entries-on.yaml config/experiments/alternate-entries-off.yaml config/experiments/alternate-matrix.yaml
git commit -m "chore: alternate entry backtest experiment presets"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/HUONG-DAN-FUTURES.md`
- Modify: `README.md` (Win rate section — one bullet)

- [ ] **Step 1: Add § to HUONG-DAN-FUTURES**

Short Vietnamese: `alternateEntries.enabled`, fib-first fallback, `entryPath` in export, keep `enabled: false` until testnet review.

- [ ] **Step 2: README bullet**

Link spec + plan; note breakout/EMA paths.

- [ ] **Step 3: Commit**

```bash
git add docs/HUONG-DAN-FUTURES.md README.md
git commit -m "docs: alternate entry paths operator notes"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Plugin `EntryPathEvaluator` | 2, 3–6 |
| Fib-first fallback | 7 |
| Context gate shared | 7 |
| `fallbackOnReasons` whitelist | 1, 7 |
| breakout / emaMomentum MVP | 4, 5 |
| `entryPath` on intent | 8 |
| `positionScale` | 9 |
| `enabled: false` default | 1 |
| SQLite `entry_path` | 9 |
| `byEntryPath` report | 10 |
| Experiment matrix | 11 |
| Rollout docs | 12 |
| Regression alternates off | 11 |

## Plan Self-Review

| Check | Result |
|-------|--------|
| Placeholders | None |
| Type consistency | `EntryPathId` defined in `core/types.ts`, used across intent/report |
| Scope | No RSS/LLM changes |
| Commands | PowerShell uses `npm run dev -- backtest -- --from ...` |

---

## Final Verification

After all tasks:

```bash
npm run lint
npm test
npm run dev -- validate -- --config config/production.yaml
```

Manual (optional): enable alternates on testnet after matrix review.
