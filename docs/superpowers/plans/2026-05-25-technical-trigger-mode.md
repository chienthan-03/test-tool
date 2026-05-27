# Technical Trigger Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `strategy.triggerMode: news | technical` so the bot can trade on entry-TF candle closes using EMA context direction only—no RSS, no `news_signals`, same stack across sim/testnet/live/backtest.

**Architecture:** Shared `computeEmaTrendState()` feeds `resolveEmaContextDirection()` and `EmaTrendContextGate`. `StrategyEngine` branches on `triggerMode`: news keeps pending-signal flow; technical scans all symbols per entry `candleClose`. Bootstrap skips `NewsPipeline`/`RssPollerManager` when technical. Backtest skips DB signals and does not require `--mock-sentiment`.

**Tech Stack:** TypeScript, Zod, Vitest, existing `EntryGate` / `paper-trading-stack` / `backtest-replayer`

**Spec:** `docs/superpowers/specs/2026-05-25-technical-trigger-mode-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config/schema.ts` | Modify | `TriggerModeSchema`, `strategy.triggerMode` default `'news'` |
| `config/default.yaml` | Modify | `triggerMode: news` + comment |
| `config/production.yaml` | Modify | Commented `# triggerMode: technical` example |
| `config/experiments/backtest-technical-matrix.yaml` | Create | Matrix override for technical backtests |
| `src/config/profile-warnings.ts` | Modify | Warnings for technical + swing / enabled feeds |
| `src/strategy/context/ema-trend-state.ts` | Create | Shared EMA fast/slow/flat computation |
| `src/strategy/context/ema-trend-context-gate.ts` | Modify | Delegate to `ema-trend-state` |
| `src/strategy/technical-direction.ts` | Create | `resolveEmaContextDirection()` |
| `src/strategy/strategy-engine.ts` | Modify | Technical branch on `candleClose` |
| `src/app/bootstrap.ts` | Modify | Conditional news stack; optional RSS |
| `src/app/runtime-context.ts` | Modify | Optional `newsPipeline` / `rssManager` |
| `src/app/shutdown.ts` | Modify | `ctx.rssManager?.stop()` |
| `src/execution/backtest-replayer.ts` | Modify | Skip signals when technical |
| `src/cli/commands/backtest.ts` | Modify | Help text note (optional) |
| `tests/unit/ema-trend-state.test.ts` | Create | Flat/long/short/insufficient |
| `tests/unit/technical-direction.test.ts` | Create | Resolver wrapper cases |
| `tests/unit/strategy-engine-technical.test.ts` | Create | Intent emission without news |
| `tests/unit/config-loader.test.ts` | Modify | `triggerMode` default |
| `tests/unit/profile-warnings.test.ts` | Modify | Technical warnings |
| `tests/integration/backtest-technical-smoke.test.ts` | Create | Backtest without seed/mock |
| `docs/LENH-THAM-CHIEU.md` | Modify | Config + backtest notes |
| `docs/HUONG-DAN-FUTURES.md` | Modify | § bot thuần kỹ thuật |
| `docs/BACKTEST-SAT-LIVE.md` | Modify | Contrast vs news backtest |
| `README.md` | Modify | Table row `strategy.triggerMode` |
| `docs/LIVE-SAFETY-CHECKLIST.md` | Modify | Bullet: confirm trigger mode |

---

### Task 1: Config schema + YAML

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `config/default.yaml`
- Modify: `config/production.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Add schema**

In `src/config/schema.ts`, before or inside `strategy` object:

```typescript
export const TriggerModeSchema = z.enum(['news', 'technical']).default('news');
```

Inside `strategy: z.object({ ... })`, as first field:

```typescript
triggerMode: TriggerModeSchema,
```

Export type if other files need: `export type TriggerMode = z.infer<typeof TriggerModeSchema>;`

- [ ] **Step 2: `config/default.yaml`**

Under `strategy:` (top of block):

```yaml
  triggerMode: news   # news | technical — technical: no RSS, EMA 15m direction, scan symbols each entry candle
```

- [ ] **Step 3: `config/production.yaml`**

Add commented line near `strategy:`:

```yaml
  # triggerMode: technical   # enable after backtest; disables RSS (see spec 2026-05-25-technical-trigger-mode)
```

- [ ] **Step 4: Config loader test**

In `tests/unit/config-loader.test.ts`:

```typescript
  it('defaults strategy.triggerMode to news', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.strategy.triggerMode).toBe('news');
  });
```

- [ ] **Step 5: Run**

```bash
npm test -- tests/unit/config-loader.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts config/default.yaml config/production.yaml tests/unit/config-loader.test.ts
git commit -m "feat(config): add strategy.triggerMode news|technical"
```

---

### Task 2: Shared EMA trend state

**Files:**
- Create: `src/strategy/context/ema-trend-state.ts`
- Modify: `src/strategy/context/ema-trend-context-gate.ts`
- Create: `tests/unit/ema-trend-state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/ema-trend-state.test.ts` with cases:
- Uptrend candles → `{ direction: 'long', isFlat: false }`
- Downtrend candles → `{ direction: 'short', isFlat: false }`
- Near-flat EMA spread → `{ direction: null, isFlat: true }`
- Too few bars → `{ direction: null, reason: 'ema_context_insufficient_data' }`

Use same candle seeding pattern as `tests/unit/ema-trend-context-gate.test.ts`.

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npm test -- tests/unit/ema-trend-state.test.ts
```

- [ ] **Step 3: Implement `ema-trend-state.ts`**

```typescript
import { ema, last } from '../../market/indicators.js';
import type { AppConfig } from '../../config/schema.js';
import type { SignalDirection } from '../../core/types.js';
import type { KlineStore } from '../../market/kline-store.js';

export type EmaTrendState =
  | { ok: false; reason: 'ema_context_insufficient_data' | 'ema_context_flat' }
  | { ok: true; fast: number; slow: number; close: number; isFlat: boolean; direction: SignalDirection };

export const computeEmaTrendState = (
  symbol: string,
  store: KlineStore,
  config: AppConfig,
): EmaTrendState => {
  const emaCfg = config.strategy.profiles.intraday.contextEma;
  const tf = config.timeframes.context;
  const candles = store.getCandles(symbol, tf);
  const minBars = emaCfg.slowPeriod + 5;

  if (candles.length < minBars) {
    return { ok: false, reason: 'ema_context_insufficient_data' };
  }

  const closes = candles.map((c) => c.close);
  const fast = last(ema(closes, emaCfg.fastPeriod));
  const slow = last(ema(closes, emaCfg.slowPeriod));
  const close = last(closes);

  if (
    fast === undefined ||
    slow === undefined ||
    close === undefined ||
    Number.isNaN(fast) ||
    Number.isNaN(slow)
  ) {
    return { ok: false, reason: 'ema_context_insufficient_data' };
  }

  const spreadRatio = Math.abs(fast - slow) / close;
  const isFlat = spreadRatio < emaCfg.flatPercent;

  if (isFlat) {
    return { ok: false, reason: 'ema_context_flat' };
  }

  const direction: SignalDirection = fast > slow ? 'long' : 'short';
  return { ok: true, fast, slow, close, isFlat: false, direction };
};
```

- [ ] **Step 4: Refactor `EmaTrendContextGate`**

Replace inline EMA math with `computeEmaTrendState`:

- `!state.ok` + `reason === insufficient` → `{ allow: false, reason }`
- `!state.ok` + `reason === flat` → `strongEnough ? allow : ema_context_flat` (preserve existing news behavior)
- `state.ok` → compare `direction` param vs `state.direction` (long + fast>slow already encoded in state)

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/ema-trend-state.test.ts tests/unit/ema-trend-context-gate.test.ts
```

Expected: PASS (existing gate tests must still pass)

- [ ] **Step 6: Commit**

```bash
git add src/strategy/context/ema-trend-state.ts src/strategy/context/ema-trend-context-gate.ts tests/unit/ema-trend-state.test.ts
git commit -m "refactor(strategy): shared computeEmaTrendState for context gate"
```

---

### Task 3: Technical direction resolver

**Files:**
- Create: `src/strategy/technical-direction.ts`
- Create: `tests/unit/technical-direction.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { resolveEmaContextDirection } from '../../src/strategy/technical-direction.js';
// expect 'long' | 'short' | null aligned with ema-trend-state tests
```

- [ ] **Step 2: Implement**

```typescript
import type { AppConfig } from '../config/schema.js';
import type { SignalDirection } from '../core/types.js';
import type { KlineStore } from '../market/kline-store.js';
import { computeEmaTrendState } from './context/ema-trend-state.js';

export const resolveEmaContextDirection = (
  symbol: string,
  store: KlineStore,
  config: AppConfig,
): SignalDirection | null => {
  const state = computeEmaTrendState(symbol, store, config);
  if (!state.ok) {
    return null;
  }
  return state.direction;
};
```

- [ ] **Step 3: Run**

```bash
npm test -- tests/unit/technical-direction.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/strategy/technical-direction.ts tests/unit/technical-direction.test.ts
git commit -m "feat(strategy): resolveEmaContextDirection for technical trigger mode"
```

---

### Task 4: StrategyEngine technical branch

**Files:**
- Modify: `src/strategy/strategy-engine.ts`
- Create: `tests/unit/strategy-engine-technical.test.ts`

- [ ] **Step 1: Write failing integration-style unit test**

Setup: `AppEventBus`, `KlineStore` with seeded 1h/15m or 15m/5m candles (match intraday), `EntryGate` with real wiring from `createPaperTradingStack` pattern or minimal mocks.

Config override:

```typescript
strategy: { ...base.strategy, triggerMode: 'technical', entryProfile: 'intraday' }
```

Emit `market:candleClose` on entry TF for one symbol; spy `bus.emit('strategy:intent')`.

Assert:
- At least one intent when trend + breakout conditions met OR zero when flat (document which fixture you use)
- `intent.newsId === 'technical'`
- `intent.newsSignalId.startsWith('technical-')`

No `news:signal` emitted in test.

- [ ] **Step 2: Implement in `strategy-engine.ts`**

Constants:

```typescript
const TECHNICAL_NEWS_ID = 'technical';
const TECHNICAL_STRENGTH = 1.0;
```

Changes:

1. `handleNewsSignal`: first line `if (this.config.strategy.triggerMode === 'technical') return;`

2. `handleCandleClose`: after entry-TF check and pause:

```typescript
if (this.config.strategy.triggerMode === 'technical') {
  await this.handleTechnicalCandleClose(event);
  return;
}
// existing pending-signal flow unchanged
```

3. New private method `handleTechnicalCandleClose`:

```typescript
private async handleTechnicalCandleClose(event: CandleCloseEvent): Promise<void> {
  for (const symbol of this.config.symbols) {
    if (this.isInCooldown(symbol)) continue;
    if (this.config.strategy.onePositionPerSymbol && (await this.hasPosition(symbol))) continue;

    const direction = resolveEmaContextDirection(symbol, this._store, this.config);
    if (!direction) continue;

    const gate = this.entryGate.evaluate(symbol, direction, TECHNICAL_STRENGTH);
    if (!gate.allow || !gate.entry) continue;

    const intent: TradeIntent = {
      id: randomUUID(),
      symbol,
      side: direction === 'long' ? 'BUY' : 'SELL',
      newsSignalId: `technical-${symbol}-${this.getNow().toISOString()}`,
      newsId: TECHNICAL_NEWS_ID,
      entryPrice: gate.entry.close,
      atr: gate.entry.atr,
      stopLoss: gate.entry.stopLoss,
      takeProfit: gate.entry.takeProfit,
      contextTimeframe: this.config.timeframes.context,
      entryTimeframe: this.config.timeframes.entry,
      entryPath: gate.entryPath ?? 'fib',
      createdAt: this.getNow(),
    };
    this.bus.emit('strategy:intent', intent);
  }
}
```

**Note:** Do not call `pending.pruneExpired` / `waitForNextCandleClose` in technical path.

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/unit/strategy-engine-technical.test.ts
```

- [ ] **Step 4: Regression**

```bash
npm test -- tests/integration/entry-gates-intent.test.ts tests/integration/strategy-sim.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/strategy/strategy-engine.ts tests/unit/strategy-engine-technical.test.ts
git commit -m "feat(strategy): technical triggerMode scans symbols on entry candle close"
```

---

### Task 5: Profile warnings

**Files:**
- Modify: `src/config/profile-warnings.ts`
- Modify: `tests/unit/profile-warnings.test.ts`

- [ ] **Step 1: Add warnings**

```typescript
if (config.strategy.triggerMode === 'technical') {
  if (config.strategy.entryProfile === 'swing') {
    warnings.push('triggerMode technical with swing entryProfile; use intraday recommended');
  }
  if (config.feeds.some((f) => f.enabled)) {
    warnings.push('triggerMode technical ignores feeds; set feeds[].enabled: false to avoid confusion');
  }
}
```

- [ ] **Step 2: Tests** for both messages

- [ ] **Step 3: Run**

```bash
npm test -- tests/unit/profile-warnings.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/config/profile-warnings.ts tests/unit/profile-warnings.test.ts
git commit -m "chore(config): profile warnings for technical triggerMode"
```

---

### Task 6: Bootstrap + shutdown (no RSS when technical)

**Files:**
- Modify: `src/app/runtime-context.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/app/shutdown.ts`
- Test: `tests/integration/testnet-stack-smoke.test.ts` (ensure still passes with `news` default)

- [ ] **Step 1: Optional types in `runtime-context.ts`**

```typescript
newsPipeline?: NewsPipeline;
rssManager?: RssPollerManager;
```

- [ ] **Step 2: Conditional wiring in `wireTradingStack`**

```typescript
const isTechnical = config.strategy.triggerMode === 'technical';

let newsPipeline: NewsPipeline | undefined;
let rssManager: RssPollerManager | undefined;

if (!isTechnical) {
  newsPipeline = new NewsPipeline({ ... });
  rssManager = new RssPollerManager({ ... });
}

// ... after market.start:
if (rssManager) {
  rssManager.start();
}
```

Pass `newsPipeline` and `rssManager` into `RuntimeContext` (may be undefined).

- [ ] **Step 3: `shutdown.ts`**

```typescript
ctx.rssManager?.stop();
```

- [ ] **Step 4: Log at startup**

```typescript
log.info(
  { triggerMode: config.strategy.triggerMode, rss: !isTechnical },
  `${mode}_runtime_started`,
);
```

- [ ] **Step 5: Run integration smoke (news mode unchanged)**

```bash
npm test -- tests/integration/testnet-stack-smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/runtime-context.ts src/app/bootstrap.ts src/app/shutdown.ts
git commit -m "feat(app): skip RSS and NewsPipeline when triggerMode technical"
```

---

### Task 7: Backtest replayer

**Files:**
- Modify: `src/execution/backtest-replayer.ts`

- [ ] **Step 1: Branch signal loading**

At top of `run()` after `signalRepo` setup:

```typescript
const isTechnical = config.strategy.triggerMode === 'technical';
let signals: NewsSignal[] = [];

if (!isTechnical) {
  signals = signalRepo.listBetween(from, to);
  if (mockSentiment) {
    signals = generateMockSignals(...);
  } else if (signals.length === 0) {
    throw new Error('No news_signals in date range. Run sim first or pass --mock-sentiment.');
  }
} else if (mockSentiment) {
  log or console.warn once: 'mock-sentiment ignored when triggerMode is technical';
}
```

Use existing `createLogger` if available in replayer, else `console.warn`.

- [ ] **Step 2: Skip signal emit loop when technical**

Wrap existing block:

```typescript
if (!isTechnical) {
  for (const signal of signalsInBar(signals, candle)) {
    bus.emit('news:signal', signal);
  }
}
```

`market:candleClose` emit stays unchanged.

- [ ] **Step 3: Manual smoke**

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 --config config/production.yaml
```

(Requires temporary `strategy.triggerMode: technical` in a test YAML or production override.)

Expected: runs without seed/mock; JSON summary printed.

- [ ] **Step 4: Commit**

```bash
git add src/execution/backtest-replayer.ts
git commit -m "feat(backtest): support triggerMode technical without news_signals"
```

---

### Task 8: Integration test + experiment YAML

**Files:**
- Create: `tests/integration/backtest-technical-smoke.test.ts`
- Create: `config/experiments/backtest-technical-matrix.yaml`

- [ ] **Step 1: Experiment YAML**

```yaml
# Run via backtest-matrix or copy overrides into local config
name: backtest-technical
configs:
  - path: config/default.yaml
    overrides:
      strategy.triggerMode: technical
      strategy.entryProfile: intraday
      symbols: [BTCUSDT]
      timeframes:
        context: 15m
        entry: 5m
```

- [ ] **Step 2: Integration test**

Mirror `backtest-smoke.test.ts`:
- Copy cached `BTCUSDT_15m.json` and `BTCUSDT_5m.json` from `data/klines` (or 1h/15m if fixtures only have those—**use intervals matching test config**).
- Set `triggerMode: 'technical'`, `mockSentiment: false`, empty DB.
- Assert `report.totalTrades >= 0` (prefer `>= 1` if fixture window produces trades; if flaky, assert no throw + defined report).

```bash
npm test -- tests/integration/backtest-technical-smoke.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/backtest-technical-smoke.test.ts config/experiments/backtest-technical-matrix.yaml
git commit -m "test: backtest smoke for technical triggerMode"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/LENH-THAM-CHIEU.md`
- Modify: `docs/HUONG-DAN-FUTURES.md`
- Modify: `docs/BACKTEST-SAT-LIVE.md`
- Modify: `README.md`
- Modify: `docs/LIVE-SAFETY-CHECKLIST.md`

- [ ] **Step 1: `LENH-THAM-CHIEU.md`**

Add under config section:

- `strategy.triggerMode`: `news` (default) | `technical`
- Backtest example without `seed-signals` / `--mock-sentiment` when technical

- [ ] **Step 2: `HUONG-DAN-FUTURES.md`**

New subsection **Bot thuần kỹ thuật (không tin)**:
- Set `triggerMode: technical`
- RSS tắt; EMA 15m direction; quét symbol mỗi nến 5m
- Khuyến nghị testnet trước live

- [ ] **Step 3: `BACKTEST-SAT-LIVE.md`**

Contrast table: news-realistic (seed) vs technical (klines only)

- [ ] **Step 4: `README.md` + `LIVE-SAFETY-CHECKLIST.md`**

One row / bullet each

- [ ] **Step 5: Commit**

```bash
git add docs/LENH-THAM-CHIEU.md docs/HUONG-DAN-FUTURES.md docs/BACKTEST-SAT-LIVE.md README.md docs/LIVE-SAFETY-CHECKLIST.md
git commit -m "docs: technical triggerMode operator guide"
```

---

### Task 10: Full verification

- [ ] **Step 1: Lint**

```bash
npm run lint
```

- [ ] **Step 2: Unit + integration**

```bash
npm test
```

Expected: all PASS

- [ ] **Step 3: Optional parity note**

If `mode-parity-replay` assumes news signals, add a skipped test or comment in `tests/integration/mode-parity-replay.test.ts` documenting technical mode is a separate matrix (do not block this PR).

- [ ] **Step 4: Final commit** (if doc/test fixes only)

```bash
git status
# commit any remaining fixes
```

---

## Execution Notes

| Risk | Mitigation |
|------|------------|
| Too many trades in technical mode | Document; operator uses `cooldownAfterLoss`, lower `positionPercent` |
| Missing 15m klines in backtest | `prefetch-klines` for context + entry TFs |
| `testnet-stack-smoke` uses news path | Default config stays `news`; smoke unchanged |

## Out of Scope (follow-up PRs)

- Hybrid `news` + `technical` same run
- `directionSource: entryPath` (brainstorming option B)
- Per-mode `triggerMode` override

---

## Approval

| Item | Status |
|------|--------|
| Spec `2026-05-25-technical-trigger-mode-design.md` | Approved |
| Plan | Ready for execution |
