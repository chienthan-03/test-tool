# Entry Profile (Swing vs Intraday Momentum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `strategy.entryProfile: swing | intraday` so one `production.yaml` switches between Elliott+Fib swing and EMA-context momentum (breakout → emaMomentum) without calling Fib on intraday.

**Architecture:** `ContextGate` interface (Elliott vs EMA trend); `EntryGate` branches on `entryProfile`; `buildEntryPathRegistry` stays swing-oriented; new `buildIntradayEntryChain` for momentum paths; `RiskEngine.resolvePositionScale` profile-aware.

**Tech Stack:** TypeScript, Zod, Vitest, existing entry evaluators

**Spec:** `docs/superpowers/specs/2026-05-27-entry-profile-momentum-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/strategy/context/types.ts` | Create | `ContextGate`, `ContextGateResult` |
| `src/strategy/context/elliott-context-gate.ts` | Create | Delegate `MtfEngine.evaluateContext` |
| `src/strategy/context/ema-trend-context-gate.ts` | Create | EMA 20/50 bias on context TF |
| `src/strategy/context/build-context-gate.ts` | Create | Factory from `entryProfile` |
| `src/strategy/entries/intraday-chain.ts` | Create | `buildIntradayEntryChain(config)` |
| `src/strategy/entry-gate.ts` | Modify | Profile branches `evaluateSwing` / `evaluateIntraday` |
| `src/config/schema.ts` | Modify | `entryProfile`, `profiles.swing`, `profiles.intraday` |
| `src/config/profile-warnings.ts` | Create | TF vs profile warnings for validate |
| `src/cli/commands/validate.ts` | Modify | Print profile/TF warnings |
| `src/risk/position-scale.ts` | Create | `resolvePositionScaleMultiplier(config, entryPath)` |
| `src/risk/risk-engine.ts` | Modify | Use position scale helper |
| `config/default.yaml` | Modify | `entryProfile`, `profiles` blocks |
| `config/production.yaml` | Modify | Default `swing` + `1d/4h`; document intraday switch |
| `config/experiments/profile-*.yaml` | Create | Swing baseline, intraday, matrix |
| `tests/unit/ema-trend-context-gate.test.ts` | Create | Context gate tests |
| `tests/unit/entry-gate-intraday.test.ts` | Create | Intraday flow |
| `tests/unit/entry-gate-swing-regression.test.ts` | Create | Snapshot swing behavior |
| `tests/unit/risk-position-scale-profile.test.ts` | Create | Intraday 0.75 always |
| `tests/unit/config-loader.test.ts` | Modify | Profile defaults |
| `docs/HUONG-DAN-FUTURES.md` | Modify | § entryProfile switch |

---

### Task 1: Config schema + YAML

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `config/default.yaml`
- Modify: `config/production.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Add Zod schemas to `src/config/schema.ts`**

```typescript
export const EntryProfileSchema = z.enum(['swing', 'intraday']);

export const ContextEmaSchema = z.object({
  fastPeriod: z.number().int().min(2).max(100).default(20),
  slowPeriod: z.number().int().min(3).max(200).default(50),
  flatPercent: z.number().min(0).max(0.01).default(0.0005),
});

export const SwingProfileSchema = z.object({
  contextMode: z.literal('elliott'),
  entryPaths: z.object({ primary: z.literal('fib') }),
  useAlternateFallback: z.boolean().default(true),
});

export const IntradayProfileSchema = z.object({
  contextMode: z.literal('emaTrend'),
  contextEma: ContextEmaSchema.default({ fastPeriod: 20, slowPeriod: 50, flatPercent: 0.0005 }),
  entryPaths: z.object({
    order: z.array(AlternateEntryPathIdSchema).min(1).default(['breakout', 'emaMomentum']),
  }),
  positionScale: z.number().min(0.1).max(1).default(0.75),
});

export const StrategyProfilesSchema = z.object({
  swing: SwingProfileSchema.default({
    contextMode: 'elliott',
    entryPaths: { primary: 'fib' },
    useAlternateFallback: true,
  }),
  intraday: IntradayProfileSchema.default({
    contextMode: 'emaTrend',
    contextEma: { fastPeriod: 20, slowPeriod: 50, flatPercent: 0.0005 },
    entryPaths: { order: ['breakout', 'emaMomentum'] },
    positionScale: 0.75,
  }),
});
```

Inside `strategy` object add **before** `alternateEntries`:

```typescript
entryProfile: EntryProfileSchema.default('swing'),
profiles: StrategyProfilesSchema,
```

- [ ] **Step 2: Update `config/default.yaml` and `config/production.yaml`**

Add under `strategy:` (after `onePositionPerSymbol` block, before `alternateEntries`):

```yaml
  entryProfile: swing
  profiles:
    swing:
      contextMode: elliott
      entryPaths:
        primary: fib
      useAlternateFallback: true
    intraday:
      contextMode: emaTrend
      contextEma:
        fastPeriod: 20
        slowPeriod: 50
        flatPercent: 0.0005
      entryPaths:
        order: [breakout, emaMomentum]
      positionScale: 0.75
```

Set `production.yaml` `timeframes` to `1d/4h`, `entryProfile: swing`, `alternateEntries.enabled: false`.

- [ ] **Step 3: Config loader test**

```typescript
  it('loads entryProfile and profiles defaults', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.strategy.entryProfile).toBe('swing');
    expect(config.strategy.profiles.intraday.positionScale).toBe(0.75);
    expect(config.strategy.profiles.intraday.entryPaths.order).toEqual(['breakout', 'emaMomentum']);
  });
```

- [ ] **Step 4: Run**

Run: `npm test -- tests/unit/config-loader.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts config/default.yaml config/production.yaml tests/unit/config-loader.test.ts
git commit -m "feat(config): add entryProfile swing and intraday profiles"
```

---

### Task 2: Context gate abstraction + EMA trend gate

**Files:**
- Create: `src/strategy/context/types.ts`
- Create: `src/strategy/context/elliott-context-gate.ts`
- Create: `src/strategy/context/ema-trend-context-gate.ts`
- Create: `src/strategy/context/build-context-gate.ts`
- Create: `tests/unit/ema-trend-context-gate.test.ts`

- [ ] **Step 1: Create `src/strategy/context/types.ts`**

```typescript
import type { SignalDirection } from '../../core/types.js';
import type { EntryEvalContext } from '../entries/types.js';

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

- [ ] **Step 2: `elliott-context-gate.ts`**

```typescript
export class ElliottContextGate implements ContextGate {
  constructor(private readonly mtf: MtfEngine) {}
  evaluate(symbol, direction, strength, _ctx): ContextGateResult {
    return this.mtf.evaluateContext(symbol, direction, strength);
  }
}
```

- [ ] **Step 3: `ema-trend-context-gate.ts`**

- Load candles: `ctx.store.getCandles(symbol, ctx.config.timeframes.context)`
- `minBars = slowPeriod + 5`
- `ema(fastPeriod)`, `ema(slowPeriod)` on closes; take `last` values
- Long + fast > slow → allow; short + fast < slow → allow
- Else `ema_context_conflict`
- If `|fast - slow| / close < flatPercent` → `ema_context_flat` unless `strength >= ctx.config.sentiment.rules.strongNewsThreshold`

- [ ] **Step 4: `build-context-gate.ts`**

```typescript
export const buildContextGate = (config: AppConfig, mtf: MtfEngine): ContextGate => {
  if (config.strategy.entryProfile === 'intraday') {
    return new EmaTrendContextGate();
  }
  return new ElliottContextGate(mtf);
};
```

- [ ] **Step 5: Tests** — seed 1h candles with rising closes (long allow), falling (short allow), mixed (conflict), flat EMA (reject unless high strength).

Run: `npm test -- tests/unit/ema-trend-context-gate.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/strategy/context tests/unit/ema-trend-context-gate.test.ts
git commit -m "feat(strategy): EMA trend and Elliott context gates"
```

---

### Task 3: Intraday entry chain builder

**Files:**
- Create: `src/strategy/entries/intraday-chain.ts`
- Create: `tests/unit/intraday-entry-chain.test.ts`

- [ ] **Step 1: Implement `buildIntradayEntryChain`**

```typescript
export const buildIntradayEntryChain = (config: AppConfig): EntryPathEvaluator[] => {
  const order = config.strategy.profiles.intraday.entryPaths.order;
  const paths: EntryPathEvaluator[] = [];
  for (const id of order) {
    const cfg = config.strategy.alternateEntries[id];
    if (!cfg?.enabled) continue;
    if (id === 'breakout') paths.push(new BreakoutEntryEvaluator());
    if (id === 'emaMomentum') paths.push(new EmaMomentumEntryEvaluator());
  }
  return paths;
};
```

- [ ] **Step 2: Test** — order `[emaMomentum, breakout]` with breakout disabled → chain length 1.

- [ ] **Step 3: Commit**

```bash
git add src/strategy/entries/intraday-chain.ts tests/unit/intraday-entry-chain.test.ts
git commit -m "feat(strategy): intraday entry path chain builder"
```

---

### Task 4: EntryGate profile branches

**Files:**
- Modify: `src/strategy/entry-gate.ts`
- Modify: `src/app/paper-trading-stack.ts`
- Modify: `src/app/bootstrap.ts` (if EntryGate constructed there — only paper-trading-stack today)
- Create: `tests/unit/entry-gate-intraday.test.ts`
- Modify: `tests/unit/entry-gate.test.ts`, `tests/unit/entry-gate-fallback.test.ts`

- [ ] **Step 1: Extend `EntryGate` constructor**

```typescript
constructor(
  private readonly config: AppConfig,
  private readonly mtf: MtfEngine,
  private readonly registry: EntryPathRegistry,
  private readonly intradayChain: EntryPathEvaluator[],
  private readonly contextGate: ContextGate,
  private readonly store: KlineStore,
  ...
)
```

Update `createPaperTradingStack`:

```typescript
const registry = buildEntryPathRegistry(config, mtf, store);
const intradayChain = buildIntradayEntryChain(config);
const contextGate = buildContextGate(config, mtf);
const entryGate = new EntryGate(config, mtf, registry, intradayChain, contextGate, store, bus, getNow);
```

- [ ] **Step 2: Refactor `evaluate()`**

```typescript
evaluate(...): EntryGateResult {
  const ctx = { symbol, direction, strength, config: this.config, store: this.store };
  if (this.config.strategy.entryProfile === 'intraday') {
    return this.evaluateIntraday(ctx, symbol, direction, strength);
  }
  return this.evaluateSwing(ctx, symbol, direction, strength);
}
```

Extract existing body into `evaluateSwing` unchanged (uses `this.mtf.evaluateContext` OR switch to `this.contextGate` — both equivalent for swing).

`evaluateIntraday`:

```typescript
if (this.config.entryGates.enabled) {
  const context = this.contextGate.evaluate(symbol, direction, strength, ctx);
  if (!context.allow) { logReject...; return { allow: false, stage: 'context', reason: context.reason }; }
}
for (const evaluator of this.intradayChain) {
  const r = evaluator.evaluate(ctx);
  if (r.confirm) return { allow: true, entry: r, entryPath: evaluator.id };
}
return { allow: false, stage: 'entry', reason: 'intraday_no_entry_path' };
```

When `entryGates.enabled: false` on intraday: skip context block, run chain only.

**Critical:** `entryGates.enabled: false` on swing must still use `registry.primary` (fib), NOT intraday chain.

- [ ] **Step 3: Intraday tests**

- Mock store: 1h bullish EMA + 15m breakout bar → `entryPath: 'breakout'`
- Spy: `FibEntryEvaluator.evaluate` never called when profile intraday (mock registry or vi.spy on MtfEngine.evaluateEntry)

- [ ] **Step 4: Swing regression**

Run existing: `npm test -- tests/unit/entry-gate.test.ts tests/unit/entry-gate-fallback.test.ts`  
Expected: PASS (no behavior change when `entryProfile: swing`)

- [ ] **Step 5: Commit**

```bash
git add src/strategy/entry-gate.ts src/app/paper-trading-stack.ts tests/unit/entry-gate-intraday.test.ts
git commit -m "feat(strategy): EntryGate swing vs intraday profile branches"
```

---

### Task 5: Risk position scale by profile

**Files:**
- Create: `src/risk/position-scale.ts`
- Modify: `src/risk/risk-engine.ts`
- Create: `tests/unit/risk-position-scale-profile.test.ts`
- Modify: `tests/unit/risk-alternate-scale.test.ts` if needed

- [ ] **Step 1: Helper**

```typescript
export const resolvePositionScaleMultiplier = (
  config: AppConfig,
  entryPath: EntryPathId,
): number => {
  if (config.strategy.entryProfile === 'intraday') {
    return config.strategy.profiles.intraday.positionScale;
  }
  if (entryPath !== 'fib' && config.strategy.alternateEntries.enabled) {
    return config.strategy.alternateEntries.positionScale;
  }
  return 1;
};
```

- [ ] **Step 2: RiskEngine**

Replace lines 55–59 with:

```typescript
positionPercent *= resolvePositionScaleMultiplier(this.config, intent.entryPath);
```

- [ ] **Step 3: Tests**

- `entryProfile: intraday`, `entryPath: breakout`, scale 0.75 → notional 1125 on 10k/15%
- `entryProfile: swing`, `entryPath: fib` → scale 1
- `entryProfile: swing`, `entryPath: breakout`, `alternateEntries.enabled: true`, scale 0.5 → 750

Run: `npm test -- tests/unit/risk-position-scale-profile.test.ts tests/unit/risk-alternate-scale.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/risk/position-scale.ts src/risk/risk-engine.ts tests/unit/risk-position-scale-profile.test.ts
git commit -m "feat(risk): position scale by entryProfile"
```

---

### Task 6: Validate CLI profile warnings

**Files:**
- Create: `src/config/profile-warnings.ts`
- Modify: `src/cli/commands/validate.ts`
- Create: `tests/unit/profile-warnings.test.ts`

- [ ] **Step 1: `collectProfileWarnings(config): string[]`**

```typescript
export const collectProfileWarnings = (config: AppConfig): string[] => {
  const warnings: string[] = [];
  const { context, entry } = config.timeframes;
  if (config.strategy.entryProfile === 'intraday') {
    if (context === '1d' || entry === '4h') {
      warnings.push('entryProfile intraday with swing timeframes (1d/4h); use 1h/15m recommended');
    }
  }
  if (config.strategy.entryProfile === 'swing') {
    if (entry === '15m' || entry === '5m' || entry === '3m' || entry === '1m') {
      warnings.push('entryProfile swing with intraday entry TF; use 4h entry recommended');
    }
  }
  return warnings;
};
```

- [ ] **Step 2: In `validate` action after config load**

```typescript
for (const w of collectProfileWarnings(config)) {
  console.warn(`[validate] ${w}`);
}
```

- [ ] **Step 3: Tests + run validate**

Run: `npm test -- tests/unit/profile-warnings.test.ts`  
Run: `npm run dev -- validate -- --config config/production.yaml`

- [ ] **Step 4: Commit**

```bash
git add src/config/profile-warnings.ts src/cli/commands/validate.ts tests/unit/profile-warnings.test.ts
git commit -m "feat(validate): warn on entryProfile and timeframe mismatch"
```

---

### Task 7: Integration test + experiments

**Files:**
- Create: `config/experiments/profile-swing-baseline.yaml`
- Create: `config/experiments/profile-intraday-momentum.yaml`
- Create: `config/experiments/profile-matrix.yaml`
- Modify: `tests/integration/entry-gates-intent.test.ts` (optional second case intraday)

- [ ] **Step 1: Experiment YAMLs**

`profile-swing-baseline.yaml`: copy `phase6-production` or `default`, ensure `entryProfile: swing`, `1d/4h`.

`profile-intraday-momentum.yaml`: `entryProfile: intraday`, `1h/15m`, `entryGates.enabled: true`.

`profile-matrix.yaml`:

```yaml
from: 2024-10-01
to: 2024-12-31
mockSentiment: true
runs:
  - id: profile-swing
    config: config/experiments/profile-swing-baseline.yaml
  - id: profile-intraday
    config: config/experiments/profile-intraday-momentum.yaml
```

- [ ] **Step 2: Integration test intraday**

Load `profile-intraday-momentum.yaml` (or inline config with `entryProfile: intraday`), seed 1h+15m candles, emit intent with `entryPath` in `breakout` | `emaMomentum`.

- [ ] **Step 3: Matrix dry-run**

```powershell
npx tsx scripts/run-backtest-matrix.ts --matrix config/experiments/profile-matrix.yaml --dry-run
```

- [ ] **Step 4: Swing regression backtest (manual record)**

```powershell
npm run dev -- backtest -- --from 2024-10-01 --to 2024-12-31 --config config/experiments/profile-swing-baseline.yaml --mock-sentiment
```

Record `totalTrades` — compare to pre-feature baseline (~47–63 depending on preset); document in PR notes.

- [ ] **Step 5: Commit**

```bash
git add config/experiments/profile-*.yaml tests/integration/entry-gates-intent.test.ts
git commit -m "chore: entry profile experiment presets and integration test"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/HUONG-DAN-FUTURES.md`
- Modify: `README.md`

- [ ] **Step 1: HUONG-DAN §7.x `entryProfile`**

Vietnamese: `swing` vs `intraday`, TF pairs, `positionScale`, validate warnings, example YAML switch.

- [ ] **Step 2: README bullet** linking spec `2026-05-27-entry-profile-momentum-design.md`

- [ ] **Step 3: Commit**

```bash
git add docs/HUONG-DAN-FUTURES.md README.md
git commit -m "docs: entryProfile swing vs intraday operator guide"
```

---

## Spec Coverage

| Spec § | Task |
|--------|------|
| entryProfile switch | 1, 4 |
| profiles.swing / intraday | 1 |
| EmaTrendContextGate | 2 |
| Intraday breakout → ema chain | 3, 4 |
| Swing unchanged | 4, 7 |
| positionScale intraday | 5 |
| validate warnings | 6 |
| Experiments | 7 |
| Docs | 8 |

## Plan Self-Review

| Check | Result |
|-------|--------|
| Placeholders | None |
| `entryGates.enabled: false` swing vs intraday | Task 4 explicit |
| Risk scale bug (intraday + alt.enabled false) | Task 5 fixes via profile branch |
| Type consistency | `ContextGate` used in EntryGate constructor |

## Final Verification

```bash
npm run lint
npm test
npm run dev -- validate -- --config config/production.yaml
```

---

**Plan complete.** Execution options: subagent-driven per task, or inline in session.
