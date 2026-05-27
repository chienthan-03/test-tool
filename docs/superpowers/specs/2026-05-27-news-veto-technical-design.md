# News Veto on Technical Mode (2a) — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-27-news-veto-technical-design` |
| **Status** | Approved (brainstorming) — ready for implementation plan |
| **Parent spec** | `2026-05-20-crypto-news-trader-design` |
| **Related** | `2026-05-25-technical-trigger-mode-design`, `2026-05-27-entry-profile-momentum-design` |
| **Brainstorming choices** | Asymmetric veto (counter-direction only); tags `macro`/`hack`/`etf`; BTC leader cross-symbol; rule-only phase 1; `newsVeto.enabled` flag on `triggerMode: technical` |
| **Version** | 1.0 |

---

## 1. Summary

Extend **`triggerMode: technical`** with an optional **`strategy.newsVeto`** block. When **`newsVeto.enabled: true`**:

- **Trade trigger and direction remain technical** — every entry-TF candle close scans all symbols; direction from EMA context; entry via existing **`EntryGate`** (intraday paths).
- **RSS and `NewsPipeline` run at runtime** (rule-only in phase 1; `sentiment.llm.enabled` stays `false`).
- **`NewsPipeline` does not open trades** — signals feed a **`NewsVetoStore`**, not `PendingSignalStore`.
- Before emitting `strategy:intent`, **`NewsVetoEvaluator`** blocks the trade if an **active, qualifying news signal** opposes the technical direction.
- **BTC leader rule:** signals mapped to **`leaderSymbol` (`BTCUSDT`)** veto trades on **all** configured symbols; signals on other symbols veto **only that symbol**.

This implements **2a**: a quant-style **risk overlay** on top of systematic technical entries — news filters macro shocks without becoming the alpha source.

**Relationship to `2026-05-25-technical-trigger-mode-design`:** That spec’s v1 non-goal “hybrid mode” is addressed here as an **opt-in sub-flag** (`newsVeto.enabled`) rather than a third `triggerMode` enum value. Pure technical behavior is preserved when `newsVeto.enabled: false` (default).

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Keep **technical intraday** as the sole trade trigger (production profile: `4h` context / `1h` entry, BTC+ETH).
- **Veto only** strong, tagged, rule-resolved counter-news — do not require confirming news to enter.
- **BTC market-leader semantics** for large-cap pairs (BTC news affects entire whitelist; alt-coin news does not affect BTC).
- **Rule-only phase 1** — reproducible backtests, no `OPENROUTER_API_KEY` required.
- Reuse existing **`RuleScorer`**, **`SignalMerger`**, **`NewsPipeline`**, RSS feeds, and sentiment YAML blocks.
- Parity across **`sim`**, **`testnet`**, **`live`**, and **`backtest`** when veto is enabled.
- Preserve intent metadata `newsId: 'technical'` for trades that execute (veto is a pre-intent gate, not a news-driven entry).
- Unit-testable **`NewsVetoEvaluator`** independent of WebSocket/RSS timing.

### 2.2 Non-Goals (phase 1)

- **LLM** in the veto path (`sentiment.llm.enabled` must remain `false`; phase 2 may enable LLM in pipeline without changing veto API).
- **LLM entry gate (2b)** — technical setup approval by LLM.
- **Symmetric veto** (requiring bullish news to enter long).
- New `triggerMode: hybrid` enum value (use `technical` + `newsVeto.enabled` instead).
- Veto from tags outside configured `vetoTags`.
- Neutral rule sentiment (`ruleSentiment === 0`) causing veto — rule-only skips these at merger.
- Auto-changing `feeds`, `symbols`, or `entryProfile`.
- Portfolio-level exposure caps (future work).
- Closing open positions when veto triggers mid-trade (veto applies to **new** intents only).

---

## 3. Decisions Log

| Topic | Decision |
|-------|----------|
| Config surface | `strategy.newsVeto.enabled` (+ nested fields) while `triggerMode: technical` |
| Veto policy | Asymmetric: block only when active signal **opposes** trade direction |
| Qualifying tags | `macro`, `hack`, `etf` (configurable via `vetoTags`) |
| Strength gate | `strength >= newsVeto.minStrength` (default mirrors `sentiment.rules.strongNewsThreshold` = `0.75`) |
| Sentiment source | Rule-only phase 1; signals with `source: 'rule'` only (LLM disabled) |
| BTC leader | `leaderSymbol: BTCUSDT` — its signals apply to all `config.symbols` for veto lookup |
| Non-leader symbols | Veto scope limited to symbols listed on the signal |
| RSS startup | Start `RssPollerManager` + `NewsPipeline` when `newsVeto.enabled` even if `triggerMode === 'technical'` |
| News → trade path | Disabled in technical mode (`handleNewsSignal` still no-ops for `PendingSignalStore`) |
| Signal tags | Add `tags: string[]` to `NewsSignal` (from `RuleScoreResult.tags` at merge time) |
| Veto store | In-memory `NewsVetoStore` updated on `news:signal` bus event |
| Intent metadata | Unchanged: `newsId: 'technical'`, synthetic `newsSignalId` |
| Backtest | When `technical` + `newsVeto.enabled`, load `news_signals` in range for veto replay (tags required in DB or signal objects) |
| Observability | Log `news_veto_blocked` at info; optional bus event `strategy:newsVeto` for future CSV export |

---

## 4. Configuration

### 4.1 Schema (`src/config/schema.ts`)

```yaml
strategy:
  triggerMode: technical
  newsVeto:
    enabled: false
    minStrength: 0.75
    vetoTags:
      - macro
      - hack
      - etf
    leaderSymbol: BTCUSDT
```

Zod defaults:

| Field | Type | Default |
|-------|------|---------|
| `enabled` | `boolean` | `false` |
| `minStrength` | `number` 0–1 | `0.75` (or inherit from `sentiment.rules.strongNewsThreshold` at load if omitted) |
| `vetoTags` | `string[]` min 1 | `['macro', 'hack', 'etf']` |
| `leaderSymbol` | futures symbol | `BTCUSDT` |

Validation rules:

- If `newsVeto.enabled` and no feed has `enabled: true` → **fatal** validate error.
- If `leaderSymbol` not in `symbols` → **warn** (leader rule inactive until symbol added).
- If `newsVeto.enabled` and `sentiment.llm.enabled` → **warn** (phase 1 expects rule-only; LLM ignored for veto eligibility in v1).

### 4.2 Example operator profile (`config/production.yaml` — after validation)

```yaml
strategy:
  triggerMode: technical
  entryProfile: intraday
  newsVeto:
    enabled: true
    minStrength: 0.75
    vetoTags: [macro, hack, etf]
    leaderSymbol: BTCUSDT

sentiment:
  llm:
    enabled: false   # phase 1 rule-only
```

### 4.3 Load-time warnings (`profile-warnings.ts`)

| Condition | Message intent |
|-----------|----------------|
| `triggerMode === 'technical'` && `!newsVeto.enabled` && feeds enabled | Feeds ignored at runtime (existing warning) |
| `triggerMode === 'technical'` && `newsVeto.enabled` && feeds enabled | Feeds active for veto layer only — trades remain technical |
| `newsVeto.enabled` && `entryProfile === 'swing'` | News veto optimized for intraday technical; swing may rarely reach veto check |

---

## 5. Runtime Behavior

### 5.1 Mode comparison

| Aspect | `technical` (default) | `technical` + `newsVeto.enabled` | `news` |
|--------|----------------------|----------------------------------|--------|
| RSS / pipeline | Off | **On** (rule-only v1) | On |
| Trade trigger | Entry candle close | Entry candle close | News signal → pending → entry candle |
| Direction source | EMA context | EMA context | News signal |
| News role | None | **Veto filter** | Trigger + direction |
| `PendingSignalStore` | Unused | Unused | Used |
| `newsId` on intent | `technical` | `technical` | Real news id |

### 5.2 End-to-end flow

```text
[RSS poll] → NewsPipeline → RuleScorer → SignalMerger → news:signal
                                                              ↓
                                                    NewsVetoStore.register()

[entry TF candle close] → StrategyEngine.handleTechnicalCandleClose()
  FOR EACH symbol IN config.symbols:
    direction ← resolveEmaContextDirection()
    gate ← entryGate.evaluate(symbol, direction, 1.0)
    IF NOT gate.allow → CONTINUE
    IF newsVetoEvaluator.shouldVeto(symbol, direction, now) → LOG + CONTINUE
    EMIT strategy:intent (newsId: 'technical', ...)
```

### 5.3 NewsVetoStore

**Register** on each `news:signal` event:

1. Skip if `signal.strength < newsVeto.minStrength`.
2. Skip if `signal.tags ∩ newsVeto.vetoTags` is empty.
3. Skip if signal already expired (`now > expiresAt`).
4. Append to per-symbol index:
   - For each `s` in `signal.symbols`: add to `store[s]`.
   - If `signal.symbols` includes `leaderSymbol`: also mark entry as **market-wide** (or duplicate registration under all `config.symbols`).

**Prune** expired entries on each register and each `shouldVeto` call (or periodic on candle close).

Store record shape (in-memory):

```typescript
type VetoRecord = {
  signalId: string;
  newsId: string;
  symbols: string[];       // as emitted
  direction: SignalDirection;
  strength: number;
  tags: string[];
  expiresAt: Date;
  isLeader: boolean;       // true if leaderSymbol ∈ symbols
};
```

### 5.4 NewsVetoEvaluator.shouldVeto

Input: `(symbol, tradeDirection, now)` → `{ veto: boolean; reason?: string; blockingSignalId?: string }`

Algorithm:

1. Collect candidate records affecting `symbol`:
   - All records indexed under `symbol`.
   - All records where `isLeader === true` (BTC market-wide).
2. Drop expired records.
3. If any candidate has `direction` **opposite** to `tradeDirection` → **`veto: true`**, reason e.g. `news_veto_counter_macro`.
4. Else → **`veto: false`**.

**Examples** (symbols: `BTCUSDT`, `ETHUSDT`; leader: `BTCUSDT`):

| Trade | Active signal | Veto? |
|-------|---------------|-------|
| Long ETH | BTC bearish, tags `[macro]`, strength 0.8 | Yes |
| Long BTC | ETH bearish hack, strength 0.9 | No |
| Short BTC | BTC bearish macro, strength 0.85 | Yes |
| Long ETH | BTC bullish macro, strength 0.9 | No (same direction — asymmetric) |
| Long ETH | No active qualifying signal | No |

### 5.5 Bootstrap changes (`src/app/bootstrap.ts`)

Current:

```typescript
if (config.strategy.triggerMode !== 'technical') {
  // start NewsPipeline + RSS
}
```

New:

```typescript
const startNews =
  config.strategy.triggerMode !== 'technical' ||
  config.strategy.newsVeto?.enabled === true;

if (startNews) {
  // existing NewsPipeline + RssPollerManager setup
}
```

Wire `NewsVetoStore` to `bus.on('news:signal', ...)`. Pass store/evaluator into `StrategyEngine` constructor when `newsVeto.enabled`.

### 5.6 StrategyEngine changes

In `handleTechnicalCandleClose`, after successful `entryGate.evaluate`:

```typescript
if (this.newsVeto?.shouldVeto(symbol, direction, this.getNow()).veto) {
  this.log.debug({ symbol, direction, ... }, 'news_veto_blocked');
  continue;
}
```

`handleNewsSignal` remains:

```typescript
if (this.config.strategy.triggerMode === 'technical') {
  return; // do not populate PendingSignalStore
}
```

### 5.7 SignalMerger / NewsSignal type

Extend `NewsSignal`:

```typescript
interface NewsSignal {
  // ... existing fields
  tags: string[];  // from RuleScoreResult.tags; default []
}
```

`SignalMerger.build` sets `tags: rule.tags`.

Persist `tags_json` on `news_signals` table (migration `003`) for backtest replay parity.

---

## 6. Backtest

### 6.1 Behavior matrix

| `triggerMode` | `newsVeto.enabled` | Klines | Signals DB |
|---------------|-------------------|--------|--------------|
| `technical` | `false` | Required | Not used |
| `technical` | `true` | Required | **Required** (with `tags_json`) |
| `news` | n/a | Required | Required (existing) |

### 6.2 Replayer changes (`backtest-replayer.ts`)

When `isTechnical && config.strategy.newsVeto?.enabled`:

- Load signals via `SignalRepository.listBetween(from, to)` (same as news mode).
- If empty and not `--mock-sentiment` → error: `No news_signals in date range (required for newsVeto backtest). Run seed-signals or sim.`
- Feed signals into timeline: emit `news:signal` at `signal.createdAt` before corresponding candle-close evaluations (same ordering as news-mode replayer).
- `--mock-sentiment` may be used for smoke tests; mock signals must include qualifying `tags` for veto tests.

### 6.3 Success metrics (quant)

Compare backtests **same window**, same klines:

| Metric | Expectation |
|--------|-------------|
| `totalTrades` | ≤ baseline technical (veto removes entries) |
| `maxDrawdown` / worst streak | Prefer ↓ vs baseline (primary hypothesis) |
| `winRate` | May ↑ or stay flat; not sole KPI |
| `news_veto_blocked` count | > 0 in windows with seeded macro fixtures |

---

## 7. Components & Files

| Unit | Responsibility |
|------|----------------|
| `NewsVetoStore` | In-memory registry; register/prune/list by symbol |
| `NewsVetoEvaluator` | BTC leader + opposite-direction check |
| `NewsPipeline` | Unchanged orchestration; emits tagged signals |
| `StrategyEngine` | Call evaluator in technical path |
| `bootstrap.ts` | Conditional RSS start; wire store |

| File | Change |
|------|--------|
| `src/config/schema.ts` | `NewsVetoConfigSchema` |
| `src/core/types.ts` | `NewsSignal.tags` |
| `src/sentiment/signal-merger.ts` | Pass `rule.tags` |
| `src/strategy/news-veto-store.ts` | **New** |
| `src/strategy/news-veto-evaluator.ts` | **New** |
| `src/strategy/strategy-engine.ts` | Veto hook |
| `src/app/bootstrap.ts` | RSS conditional + DI |
| `src/config/profile-warnings.ts` | Updated warnings |
| `src/execution/backtest-replayer.ts` | Signal replay for veto |
| `src/storage/migrations/003_news_signal_tags.sql` | **New** — `tags_json TEXT` |
| `src/storage/repositories/signal-repo.ts` | Read/write tags |
| `config/experiments/news-veto-on.yaml` | Experiment preset |
| `tests/unit/news-veto-evaluator.test.ts` | **New** |
| `tests/unit/strategy-engine-news-veto.test.ts` | **New** |

**Out of scope:** `RiskEngine`, adapters, `LlmGateway`, `EntryGate` internals, `PendingSignalStore`.

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|------|----------|
| RSS poll failure | Existing feed status / circuit breaker; veto store may be stale — no new vetoes until signals arrive |
| Signal expires mid-candle | Prune on check; trade allowed if expired before evaluate |
| Multiple opposing signals | Veto if **any** qualifies (strongest not required) |
| Same-direction news | No veto (asymmetric) |
| `leaderSymbol` not in `symbols` | Warn at validate; leader rule never applies |
| LLM enabled (phase 2 prep) | v1 evaluator ignores `source: 'llm'` unless spec updated — phase 1 validate warns |
| Pause flag (`data/.paused`) | Existing behavior — no new intents |
| Open position exists | Existing `onePositionPerSymbol` skip before veto |

---

## 9. Testing

### 9.1 Unit (`news-veto-evaluator.test.ts`)

- BTC bearish macro blocks ETH long.
- ETH bearish hack does not block BTC long.
- Strength below `minStrength` → no veto.
- Tag `regulation` only (not in `vetoTags`) → no veto.
- Expired signal → no veto.
- Bullish macro does not block long (asymmetric).
- Opposing macro blocks short when signal is long.

### 9.2 Integration (`strategy-engine-news-veto.test.ts`)

- Technical entry passes gate, veto store has opposing BTC macro → no `strategy:intent`.
- Same setup, no veto store entry → intent emitted with `newsId: 'technical'`.
- `newsVeto.enabled: false` → RSS not required; behavior matches existing technical tests.

### 9.3 Regression

- `strategy-engine-technical.test.ts` unchanged when `newsVeto.enabled: false`.
- News mode tests unchanged.

---

## 10. Phase 2 (Future — Not This Spec)

- Enable `sentiment.llm.enabled` for ambiguous macro headlines; veto store accepts `source: 'llm' | 'rule' | 'merged'` with same tag/strength gates.
- Optional `strategy:newsVeto` bus event + CSV column `veto_reason` in trade review export.
- **`llmEntryGate` (2b)** — separate spec; hooks same post-EntryGate insertion point.

---

## 11. Open Questions (Resolved)

| ID | Question | Resolution |
|----|----------|------------|
| OQ-1 | Third `triggerMode` enum? | No — use `newsVeto.enabled` flag |
| OQ-2 | LLM in v1? | No — rule-only |
| OQ-3 | Symmetric veto? | No — asymmetric only |
| OQ-4 | Cross-symbol scope? | BTC leader only |
| OQ-5 | Which tags? | macro, hack, etf |

---

## 12. References

- Operator guide (future §): `docs/HUONG-DAN-FUTURES.md` — add §7.9 after implementation
- Live checklist: note `newsVeto` when enabling on testnet/live
- Brainstorming session: 2026-05-27 (veto B, BTC leader, rule-only A, config flag approach)
