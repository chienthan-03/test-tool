# Crypto News Auto-Trader — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-20-crypto-news-trader-design` |
| **Status** | Approved (brainstorming) — ready for implementation plan |
| **Stack** | Node.js 20+, TypeScript, CLI |
| **Exchange** | Binance USDⓈ-M Futures |
| **Version** | 1.0 |

---

## 1. Executive Summary

A **Node.js CLI application** that automatically trades **Binance USDⓈ-M Futures** based on **free financial/crypto news** (RSS/API). Sentiment uses a **hybrid pipeline**: rule-based filtering and scoring first, **OpenRouter LLM** only for high-impact or ambiguous headlines. Trading logic uses **multi-timeframe confirmation**, **ATR-based stop loss / take profit**, and **position sizing as a percentage of account balance**.

The same **StrategyEngine** runs across four execution modes:

1. **live** — real orders on mainnet  
2. **testnet** — real API flow on Binance Futures Testnet  
3. **sim** — internal broker with mainnet public market data  
4. **backtest** — historical klines + cached news signals replay  

**Leverage is never set by the bot** — the trader configures leverage on Binance manually. There is **no cap on total open positions**; exposure is limited only by per-trade `% balance` sizing (with documented over-exposure risk).

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Ingest free RSS/crypto/macro news on a configurable poll interval  
- Map news to **whitelist symbols** only; ignore unrelated coins  
- Produce directional signals with TTL via rules + optional OpenRouter  
- Confirm entries with **context TF (bias)** + **entry TF (timing)**  
- Place Futures orders with **ATR SL/TP** and **% balance** notional  
- Support **paper** (testnet + sim) and **live** with identical strategy code  
- Persist news, signals, and trades in **SQLite** for audit and backtest replay  
- Operate entirely via **CLI** with YAML config and `.env` secrets  

### 2.2 Non-Goals (MVP / v1)

- Web dashboard or Telegram bot  
- Setting leverage or margin mode via API  
- Paid news APIs (CryptoPanic Pro, etc.)  
- Auto-reverse / pyramiding / trailing stop (phase 2)  
- Multi-exchange support (design allows future adapter)  
- Investment advice or guaranteed profitability  

---

## 3. Decisions Log (Brainstorming)

| Topic | Decision |
|-------|----------|
| Modes | Paper + live: testnet, sim, backtest, and live |
| Exchange | Binance Futures only (MVP) |
| News | Free RSS/API, self-hosted polling |
| Sentiment | Hybrid: rules → OpenRouter for high/ambiguous |
| LLM | OpenRouter (`provider: openrouter`, model string in config) |
| UI | CLI only |
| Symbols | Configurable whitelist; ignore news for other coins |
| Timeframes | Multi-TF: context (e.g. 1h) + entry (e.g. 15m) |
| SL/TP | ATR multipliers on **entry** timeframe |
| Position size | `% of available balance` per trade |
| Leverage | Not managed by bot |
| Max positions | No global cap; only `% balance` per trade |
| Architecture | Modular monolith + in-process EventBus |

---

## 4. System Architecture

### 4.1 Pattern

**Modular monolith** — single Node.js process, modules with clear interfaces, communication via typed **EventEmitter** bus (no Redis required for MVP).

### 4.2 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLI (commander)                                │
│  validate | start | backtest | status | feeds | pause | resume           │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────────────────┐
│                         ConfigLoader (Zod + YAML)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌───────────────┐            ┌───────────────┐            ┌───────────────┐
│  News Layer   │            │ Market Layer  │            │ Storage       │
│  RSS Pollers  │            │ Klines / WS   │            │ SQLite        │
│  Normalizer   │            │ Indicators    │            │ migrations    │
│  RuleScorer   │            │ MTF cache     │            └───────────────┘
│  LLM Gateway  │            └───────┬───────┘
└───────┬───────┘                    │
        │         EventBus           │
        └──────────► news:signal ────┼──► StrategyEngine (MTF)
                                     │           │
                                     │           ▼
                                     │    RiskEngine (ATR SL/TP, % size)
                                     │           │
                                     │           ▼
                                     │    TradeIntent
                                     │           │
                                     └──────► ExecutionAdapter
                                              (live|testnet|sim|backtest)
```

### 4.3 Repository Layout

```
crypto-news-trader/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── config/
│   └── default.yaml
├── data/                    # gitignored: SQLite, reports
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-20-crypto-news-trader-design.md
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   └── commands/
│   │       ├── validate.ts
│   │       ├── start.ts
│   │       ├── backtest.ts
│   │       ├── status.ts
│   │       └── feeds.ts
│   ├── config/
│   │   ├── schema.ts          # Zod
│   │   └── loader.ts
│   ├── core/
│   │   ├── event-bus.ts
│   │   ├── types.ts
│   │   └── logger.ts
│   ├── news/
│   │   ├── rss-poller.ts
│   │   ├── normalizer.ts
│   │   ├── symbol-mapper.ts
│   │   └── dedupe.ts
│   ├── sentiment/
│   │   ├── rule-scorer.ts
│   │   ├── llm-gateway.ts     # OpenRouter
│   │   └── signal-merger.ts
│   ├── market/
│   │   ├── binance-market.ts
│   │   ├── kline-store.ts
│   │   └── indicators.ts      # EMA, ATR
│   ├── strategy/
│   │   ├── mtf-engine.ts
│   │   └── strategy-engine.ts
│   ├── risk/
│   │   ├── position-sizer.ts
│   │   └── sl-tp-calculator.ts
│   ├── execution/
│   │   ├── adapter.interface.ts
│   │   ├── binance-live.ts
│   │   ├── binance-testnet.ts
│   │   ├── sim-broker.ts
│   │   └── backtest-replayer.ts
│   └── storage/
│       ├── db.ts
│       ├── migrations/
│       └── repositories/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│       ├── rss/
│       └── llm/
└── README.md
```

### 4.4 Technology Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Runtime | Node.js ≥ 20 | LTS |
| Language | TypeScript 5.x | strict mode |
| CLI | `commander` | subcommands |
| Config | YAML + `zod` | validate on load |
| Logging | `pino` | JSON prod, pretty dev |
| DB | `better-sqlite3` | sync, embedded |
| RSS | `rss-parser` | per-feed poller |
| HTTP | `undici` or `axios` | Binance REST, OpenRouter |
| WS | `ws` or Binance connector | klines + user stream (live/testnet) |
| Tests | `vitest` | unit + integration |
| Binance | Official REST/WS or `binance` npm | USDⓈ-M Futures |

---

## 5. Configuration Specification

### 5.1 Files

- **`config/default.yaml`** — non-secret defaults  
- **`.env`** — secrets (never committed)  

### 5.2 Environment Variables

```bash
# Required for live / testnet trading
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Required if sentiment.llm.enabled = true
OPENROUTER_API_KEY=

# Optional overrides
CONFIG_PATH=./config/default.yaml
SQLITE_PATH=./data/trader.db
LOG_LEVEL=info
```

### 5.3 Full YAML Schema (Logical)

```yaml
# Overridden by CLI: --mode live|testnet|sim
mode: sim

symbols:
  - BTCUSDT
  - ETHUSDT

# Optional per-symbol overrides
symbolOverrides:
  BTCUSDT:
    timeframes:
      context: 1h
      entry: 15m
    risk:
      positionPercent: 1.5

timeframes:
  context: 1h    # bias / trend filter
  entry: 15m     # entry timing + ATR for SL/TP

feeds:
  - id: coindesk
    url: https://www.coindesk.com/arc/outboundfeeds/rss/
    pollIntervalSec: 90
    enabled: true
  - id: cointelegraph
    url: https://cointelegraph.com/rss
    pollIntervalSec: 120
    enabled: true
  # User may add custom entries

sentiment:
  rules:
    impactHigh: 3              # priority = high
    thresholdLLM: 3            # always call LLM if impact >= this
    minStrength: 0.4           # min to emit NewsSignal
    strongNewsThreshold: 0.75  # allow trade against weak context trend
    bullishKeywords:
      - rally
      - approval
      - inflow
      - rate cut
      - partnership
    bearishKeywords:
      - hack
      - exploit
      - ban
      - lawsuit
      - outflow
      - rate hike
    bearishTags:
      - hack
      - regulation
    macroTags:
      - macro
      - fed
      - cpi
    blacklistKeywords:
      - airdrop scam
      - guaranteed returns
    tagRules:
      - tag: macro
        keywords: [fed, cpi, fomc, interest rate]
        impact: 3
      - tag: hack
        keywords: [hack, exploited, drained]
        impact: 3
        sentiment: -1
      - tag: etf
        keywords: [etf, approval]
        impact: 2
  llm:
    enabled: true
    provider: openrouter
    baseUrl: https://openrouter.ai/api/v1
    model: openai/gpt-4o-mini
    maxCallsPerHour: 20
    minConfidence: 0.6
    timeoutMs: 15000
    defaultTtlMinutes: 45

strategy:
  emaContextPeriod: 50
  emaEntryPeriod: 20
  atrPeriod: 14
  minAtrPercent: 0.3          # ATR/price * 100 must exceed this
  entry:
    requireEmaConfirm: true
  # One open position per symbol (no pyramiding MVP)
  onePositionPerSymbol: true

risk:
  positionPercent: 2          # % of available balance per new trade
  minNotionalUsdt: 5
  maxNotionalUsdt: null     # optional hard cap per trade
  slAtrMultiplier: 1.5
  tpAtrMultiplier: 3.0
  trailingStop: false

binance:
  baseUrl: https://fapi.binance.com
  testnetBaseUrl: https://testnet.binancefuture.com
  testnet: false
  recvWindow: 5000
  wsReconnectMaxRetries: 10

sim:
  initialBalanceUsdt: 10000
  feeRate: 0.0004             # taker assumption
  slippageBps: 5
  fillModel: conservative     # conservative | optimistic

backtest:
  klineCacheDir: ./data/klines
  reportDir: ./data/reports
  fillModel: conservative

storage:
  sqlitePath: ./data/trader.db

logging:
  level: info
  pretty: true
```

### 5.4 Zod Validation Rules

- `symbols`: non-empty array, each matches `/^[A-Z0-9]+USDT$/`  
- `timeframes.context` / `entry`: enum `1m|3m|5m|15m|30m|1h|2h|4h|1d`  
- `positionPercent`: 0.1–100 (warn if > 10)  
- `feeds`: at least one `enabled: true`  
- `llm.enabled: true` requires `OPENROUTER_API_KEY` at runtime (not at schema parse if env loaded later)  

---

## 6. Data Models

### 6.1 NewsItem

```typescript
interface NewsItem {
  id: string;              // sha256(sourceId + title + publishedAt)
  sourceId: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt: Date;
  fetchedAt: Date;
  symbols: string[];       // e.g. ["BTCUSDT"] after mapper + whitelist
  tags: string[];
}
```

### 6.2 RuleScoreResult

```typescript
interface RuleScoreResult {
  newsId: string;
  impactScore: number;
  ruleSentiment: -1 | 0 | 1;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  needsLlm: boolean;
  needsLlmReason?: string;
}
```

### 6.3 LlmSentiment (OpenRouter JSON response)

```typescript
interface LlmSentiment {
  sentiment: -1 | 0 | 1;
  confidence: number;      // 0..1
  affectedSymbols: string[];
  rationale: string;       // max 200 chars stored
  ttlMinutes: number;      // 5..240
}
```

### 6.4 NewsSignal (emitted to EventBus)

```typescript
interface NewsSignal {
  id: string;
  newsId: string;
  symbols: string[];
  direction: 'long' | 'short';
  strength: number;          // 0..1
  expiresAt: Date;
  source: 'rule' | 'llm' | 'merged';
  createdAt: Date;
}
```

**Emission rules:**

- Do not emit if `direction` would be `neutral` (strength mapping failed)  
- Do not emit if `strength < sentiment.rules.minStrength`  
- `strength` formula (documented for implementers):  
  - `base = min(impactScore / 5, 1)`  
  - if LLM used: `strength = base * 0.4 + confidence * 0.6`  
  - else: `strength = base * (ruleSentiment !== 0 ? 1 : 0.5)`  

### 6.5 TradeIntent

```typescript
interface TradeIntent {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';      // BUY=long, SELL=short (Futures)
  newsSignalId: string;
  newsId: string;
  entryPrice: number;
  atr: number;
  contextTimeframe: string;
  entryTimeframe: string;
  createdAt: Date;
}
```

### 6.6 OrderPlan (after RiskEngine)

```typescript
interface OrderPlan {
  intentId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryType: 'MARKET';
  stopLoss: number;
  takeProfit: number;
  notionalUsdt: number;
}
```

### 6.7 Fill / Position

```typescript
interface Fill {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  fee: number;
  timestamp: Date;
}

interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  unrealizedPnl?: number;
}
```

---

## 7. News Pipeline (Detailed)

### 7.1 RSS Poller

- One timer per feed: `setInterval(pollIntervalSec * 1000)`  
- On start: immediate first poll  
- Fetch with timeout 10s, User-Agent identifiable (`crypto-news-trader/1.0`)  
- Parse via `rss-parser`; map to raw items  

### 7.2 Deduplication

- Primary key: `id = hash(sourceId + title + ISO(publishedAt))`  
- Before processing: `SELECT 1 FROM news_raw WHERE id = ?`  
- Insert `news_raw` before scoring (audit trail)  

### 7.3 SymbolMapper

**Steps:**

1. Extract candidate tickers from title + summary using:
   - Regex: `\b(BTC|ETH|SOL|...)\b` (configurable alias map)  
   - Full names: Bitcoin → BTC, Ethereum → ETH  
2. Map ticker → Futures symbol: `BTC` → `BTCUSDT`  
3. **Filter:** keep only symbols in `config.symbols`  
4. If empty → **stop pipeline** for this item (no LLM, no signal)  

### 7.4 RuleScorer

**Hard filters (discard):**

- No symbols after mapping  
- Blacklist keyword match (case-insensitive)  
- Duplicate `id` already in `news_processed`  

**Tag & impact scoring:**

- Apply `tagRules` from config; sum impacts (cap at 10)  
- Compute `ruleSentiment` from bullish/bearish keyword counts; tie → `0`  
- Assign `priority`:
  - `high` if `impactScore >= impactHigh` OR any tag in `macroTags`  
  - `medium` if symbols non-empty and `impactScore >= 1`  
  - `low` otherwise  

**`needsLlm` = true when any:**

1. `priority === 'high'` AND `ruleSentiment === 0`  
2. `priority === 'high'` AND both bullish and bearish keywords matched  
3. `impactScore >= thresholdLLM`  
4. Optional: feed-level `forceLlm: true` in feed config (future)  

### 7.5 LLM Gateway (OpenRouter)

**Endpoint:** `POST {baseUrl}/chat/completions`

**Headers:**

```
Authorization: Bearer ${OPENROUTER_API_KEY}
HTTP-Referer: https://github.com/local/crypto-news-trader
X-Title: crypto-news-trader
Content-Type: application/json
```

**System prompt (summary):** You are a financial news analyst for crypto futures. Return ONLY valid JSON matching schema. Consider macro and crypto impact. Only reference symbols from the provided whitelist.

**User payload includes:**

- title, summary, url, publishedAt  
- whitelist symbols  
- rule tags, impactScore, ruleSentiment  

**Expected JSON:**

```json
{
  "sentiment": -1,
  "confidence": 0.82,
  "affectedSymbols": ["BTCUSDT"],
  "rationale": "Fed hawkish tone pressures risk assets.",
  "ttlMinutes": 60
}
```

**Rate limiting:**

- Track calls in memory + SQLite `llm_calls`  
- If `callsLastHour >= maxCallsPerHour`: skip LLM, use rules, log `llm_rate_limited`  

**Failure:**

- 429/5xx: retry max 2 with backoff 1s, 3s  
- Invalid JSON: retry once with stricter prompt; then rule-only  
- Log every call: model, latency, prompt tokens, completion tokens (if returned)  

### 7.6 Signal Merger

| Condition | Final direction | Source |
|-----------|-----------------|--------|
| LLM called, confidence ≥ minConfidence | long if sentiment=1, short if -1 | `llm` or `merged` |
| LLM called, low confidence | fall back to ruleSentiment | `merged` |
| LLM skipped | ruleSentiment → long/short; 0 → no signal | `rule` |

`expiresAt = now + ttlMinutes * 60_000` (LLM ttl or default 45 min)

Persist to `news_signals` and emit `EventBus.emit('news:signal', signal)`.

---

## 8. Market Data Layer

### 8.1 Responsibilities

- Maintain rolling OHLCV for `context` and `entry` TFs for all whitelist symbols  
- Compute EMA(context), EMA(entry), ATR(entry)  
- Provide latest candle close, high, low for sim/backtest  

### 8.2 Live / Testnet / Sim

- **Bootstrap:** REST `GET /fapi/v1/klines` — last 200 candles per symbol per TF  
- **Stream:** WS combined stream or per-symbol `kline_{tf}`  
- On candle **close** event: update indicator cache, emit `market:candleClose`  

### 8.3 Backtest

- Download or load cached klines for `[from, to]` into `klineCacheDir`  
- Iterator yields closed candles in chronological order (no WS)  

### 8.4 Indicators (formulas)

**EMA:**

```
multiplier = 2 / (period + 1)
ema_t = (close_t - ema_{t-1}) * multiplier + ema_{t-1}
```

Seed: SMA of first `period` closes.

**ATR (Wilder, period N):**

```
TR = max(high-low, |high-prevClose|, |low-prevClose|)
ATR = Wilder smooth of TR over N
```

---

## 9. Strategy Engine (MTF)

### 9.1 Trigger

On `news:signal`:

1. For each `symbol` in signal (already whitelist-filtered):  
2. Check signal not expired  
3. Check no existing position if `onePositionPerSymbol` (query adapter)  
4. Run MTF pipeline → maybe produce `TradeIntent`  

### 9.2 Context Timeframe — Trend Bias

**Bullish context (allow long, block short):**

- `close > EMA(emaContextPeriod)`  
- `EMA_now > EMA_prev` (_slope over last 3 closes of EMA*)  

**Bearish context (allow short, block long):**

- `close < EMA(emaContextPeriod)`  
- `EMA_now < EMA_prev`  

**Sideways:**

- Neither condition above  
- Allow trade **only if** `signal.strength >= strongNewsThreshold`  
- Direction must still match signal (no counter-trend)  

*\*EMA slope: compare EMA at t vs t-3 bars on context TF.*

**Conflict:** news `long` + bearish context (and not strong enough) → skip, log `mtf_context_conflict`.

### 9.3 Entry Timeframe — Confirmation

On next **closed** entry candle after signal (or current if signal arrived mid-bar — implementer choice: **wait for next close** to avoid repaint):

**Long confirmation (all required if `requireEmaConfirm`):**

- `close > EMA(emaEntryPeriod)` on entry TF  
- `ATR(atrPeriod) / close * 100 >= minAtrPercent`  

**Short confirmation:**

- `close < EMA(emaEntryPeriod)`  
- Same ATR filter  

**Timeout:** if not confirmed before `signal.expiresAt` → log `entry_timeout`, discard pending signal for symbol.

### 9.4 TradeIntent Creation

- `entryPrice` = close of confirming candle (live/sim) or next bar open (backtest config)  
- `atr` = ATR(14) on entry TF at confirm time  
- `side` = BUY for long, SELL for short  

Emit `strategy:intent` → RiskEngine.

### 9.5 Post-Entry Behavior (MVP)

- No auto-close on opposing news  
- No trailing stop  
- Reconcile external closes via adapter  

---

## 10. Risk Engine

### 10.1 SL/TP Calculation

Given `entryPrice`, `atr`, `side`:

```
slDistance = slAtrMultiplier * atr
tpDistance = tpAtrMultiplier * atr

LONG:  SL = entryPrice - slDistance,  TP = entryPrice + tpDistance
SHORT: SL = entryPrice + slDistance,  TP = entryPrice - tpDistance
```

Round prices per symbol `PRICE_FILTER` from exchange info.

### 10.2 Position Sizing

```
availableBalance = adapter.getBalance().available
notional = availableBalance * (positionPercent / 100)
apply minNotionalUsdt, maxNotionalUsdt if set
quantity = floor(notional / entryPrice / stepSize) * stepSize
```

If `quantity < minQty` → abort with log `quantity_too_small`.

**Note:** Multiple concurrent positions each use full `positionPercent` — total exposure can exceed 100% of balance notionally; documented risk.

### 10.3 OrderPlan Output

Emit `risk:orderPlan` consumed by ExecutionAdapter.

---

## 11. Execution Adapters

### 11.1 Interface

```typescript
interface ExecutionAdapter {
  readonly mode: 'live' | 'testnet' | 'sim' | 'backtest';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getBalance(): Promise<{ available: number; total: number }>;
  getPosition(symbol: string): Promise<Position | null>;
  getAllPositions(): Promise<Position[]>;
  placeEntry(plan: OrderPlan): Promise<Fill>;
  placeStopLoss(symbol: string, side: string, stopPrice: number, quantity: number): Promise<string>;
  placeTakeProfit(symbol: string, side: string, stopPrice: number, quantity: number): Promise<string>;
  reconcile(): Promise<void>;
}
```

### 11.2 BinanceLive / BinanceTestnet

- Use respective `baseUrl` / `testnetBaseUrl`  
- **Entry:** `POST /fapi/v1/order` — `MARKET`, `positionSide` BOTH (one-way mode assumed)  
- After fill: place `STOP_MARKET` and `TAKE_PROFIT_MARKET`, `reduceOnly: true`  
- Subscribe user data stream for order updates  
- **Never call** `/fapi/v1/leverage`  
- Exchange info cached 24h for filters  
- Error code handling: `-2019` margin insufficient → log, skip; `-1021` timestamp → sync server time  

### 11.3 SimBroker

- Public mainnet klines only  
- Virtual balance `initialBalanceUsdt`  
- On MARKET intent: fill at next candle per `fillModel`  
- Check each candle high/low for SL/TP hits  
- Deduct fees on entry and exit  

### 11.4 BacktestReplayer

- Inputs: date range, symbols, config, SQLite `news_signals`, cached klines  
- Loop: chronological entry candles; inject signals whose `createdAt` falls in current bar window  
- Same MTF + risk logic; no network  
- Output: `BacktestReport` JSON  

```typescript
interface BacktestReport {
  from: string;
  to: string;
  symbols: string[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
  maxDrawdownPct: number;
  sharpe?: number;       // optional phase 2
  trades: Array<{ symbol; side; entry; exit; pnl; newsId }>;
}
```

---

## 12. SQLite Schema

### 12.1 Tables

```sql
-- Raw ingested news
CREATE TABLE news_raw (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  symbols_json TEXT,
  tags_json TEXT,
  raw_json TEXT
);

-- Processed marker
CREATE TABLE news_processed (
  news_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);

-- Emitted signals
CREATE TABLE news_signals (
  id TEXT PRIMARY KEY,
  news_id TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  direction TEXT NOT NULL,
  strength REAL NOT NULL,
  source TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- LLM audit
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  success INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

-- Trades
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  pnl_usdt REAL,
  fees_usdt REAL,
  news_id TEXT,
  news_signal_id TEXT,
  status TEXT NOT NULL,  -- open|closed|cancelled
  opened_at TEXT NOT NULL,
  closed_at TEXT
);

-- Feed health
CREATE TABLE feed_status (
  feed_id TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0
);
```

### 12.2 Migrations

- Version table `schema_migrations`  
- Migration runner on app start  

---

## 13. CLI Specification

### 13.1 Binary Name

`crypto-trader` (package name `@local/crypto-news-trader` or `crypto-news-trader`)

### 13.2 Commands

#### `crypto-trader validate`

- Load config, run Zod  
- Test Binance ping (if keys present)  
- Test OpenRouter minimal request (if LLM enabled)  
- Exit 0 or 1  

#### `crypto-trader start [options]`

| Option | Description |
|--------|-------------|
| `--mode` | `live` \| `testnet` \| `sim` (required) |
| `--config` | Path to YAML |
| `--symbols` | Comma override whitelist |

Flow: connect adapter → start pollers → WS → listen until SIGINT.

**Graceful shutdown (SIGINT):**

- Stop pollers and WS  
- Do **not** auto-close positions  
- Log open positions and reminder to manage manually  

#### `crypto-trader backtest [options]`

| Option | Description |
|--------|-------------|
| `--from` | ISO date (required) |
| `--to` | ISO date (required) |
| `--config` | YAML path |
| `--mock-sentiment` | Dev: generate synthetic signals (documented) |

#### `crypto-trader status`

- Mode, uptime, balance, positions, pending signals count  
- Feed table: last success, failures  
- LLM: calls in last hour / limit  

#### `crypto-trader feeds`

- List feeds, poll interval, enabled, last error  

#### `crypto-trader pause` / `resume`

- Toggle file flag `data/.paused` checked by strategy loop  

---

## 14. Event Bus Topics

| Event | Payload | Publishers | Subscribers |
|-------|---------|------------|-------------|
| `news:raw` | NewsItem | RSS | (debug) |
| `news:signal` | NewsSignal | Sentiment | Strategy |
| `market:candleClose` | { symbol, tf, candle } | Market | Strategy |
| `strategy:intent` | TradeIntent | Strategy | Risk |
| `risk:orderPlan` | OrderPlan | Risk | Execution |
| `execution:fill` | Fill | Execution | Storage, Logger |
| `execution:positionClosed` | { symbol, pnl } | Execution | Storage |
| `system:pause` | — | CLI | All loops |

---

## 15. Error Handling & Resilience

| Component | Error | Action |
|-----------|-------|--------|
| RSS | Timeout, 5xx | Retry 3× exp backoff; after 5 consecutive failures mark feed degraded 10 min |
| RSS | Parse error | Skip item, log warn |
| Binance REST | Rate limit | Respect `Retry-After`, queue orders |
| Binance | Insufficient margin | Log, skip trade |
| OpenRouter | 429/5xx | Retry 2×; fallback rules |
| OpenRouter | Bad JSON | Retry 1×; fallback rules |
| WS disconnect | — | Reconnect with jitter, max 10 attempts |
| DB locked | — | Retry 3× 50ms apart |

**Trading halt:** if 3 consecutive Binance order failures within 5 minutes → set internal `haltTrading` until `resume` or restart (configurable `circuitBreaker: true` default on).

---

## 16. Security

- Secrets only in `.env`; `.env` in `.gitignore`  
- Binance API: enable Futures only; **disable withdrawals**  
- Recommend IP whitelist on Binance API key  
- Separate OpenRouter key with spending limit  
- No secrets in logs or SQLite  
- README disclaimer: educational tool, not financial advice  

---

## 17. Testing Plan

### 17.1 Unit Tests (Vitest)

- `SymbolMapper`: aliases, whitelist filter  
- `RuleScorer`: impact, priority, needsLlm triggers  
- `SignalMerger`: confidence threshold, TTL  
- `indicators`: EMA, ATR vs known values  
- `sl-tp-calculator`: long/short prices  
- `position-sizer`: percent, min/max notional, stepSize rounding  

### 17.2 Integration Tests

- RSS fixture → NewsItem → signal (no LLM)  
- Mock OpenRouter → LlmSentiment parse  
- MTF engine with synthetic candles → TradeIntent / skip  

### 17.3 Manual Checklist (Testnet)

1. `validate` passes  
2. `start --mode testnet` with 1 symbol, small `positionPercent`  
3. Confirm entry + SL + TP appear in Binance UI  
4. `status` shows position; kill switch `pause` stops new trades  
5. SIGINT does not close positions  

### 17.4 Backtest Smoke

- Run 7-day window with `--mock-sentiment` → non-empty report  
- Re-run with cached signals → deterministic PnL  

---

## 18. Implementation Phases

### Phase 1 — Foundation (Week 1)

- Project scaffold, config Zod, SQLite migrations  
- EventBus, logging  
- RSS poller + normalizer + dedupe + SymbolMapper  
- RuleScorer + signal persistence (no LLM)  

### Phase 2 — Market & Strategy (Week 2)

- Klines REST + indicators  
- MTF StrategyEngine  
- Risk engine SL/TP + sizing  
- SimBroker + `start --mode sim`  

### Phase 3 — LLM & Testnet (Week 3)

- OpenRouter gateway + merger  
- Binance testnet adapter  
- SL/TP placement on testnet  

### Phase 4 — Live & Backtest (Week 4)

- BinanceLive adapter + circuit breaker  
- BacktestReplayer + `backtest` command  
- README, `.env.example`, manual test checklist  

### Phase 5 — Hardening

- Feed health dashboard in `status`  
- Golden backtest fixture  
- Performance: batch kline fetch  

---

## 19. CLI & Operator Documentation (README Outline)

1. Prerequisites: Node 20, Binance Futures account, optional OpenRouter  
2. Setup: `npm install`, copy `.env.example`  
3. Configure `symbols`, `feeds`, `risk.positionPercent`  
4. Run sim → testnet → small live  
5. Accumulate news cache for backtest  
6. Risks: lag, LLM errors, over-exposure, leverage manual  
7. Legal disclaimer  

---

## 20. Open Questions / Phase 2 Backlog

| Item | Notes |
|------|-------|
| Trailing stop | ATR-based trail after TP1 partial |
| Telegram alerts | Notify on signal/fill |
| Vietnamese news feeds | Custom RSS URLs |
| Pyramiding | Config flag off by default |
| Risk-based sizing | Size from SL distance instead of % balance |
| Web UI | Read-only monitor |
| One-way vs hedge mode | MVP assumes one-way (BOTH) |

---

## 21. Acceptance Criteria (MVP Done)

- [ ] `validate` passes with sim config  
- [ ] RSS feeds poll and dedupe; symbols not in whitelist ignored  
- [ ] Rules emit signals; LLM called only per gate rules  
- [ ] OpenRouter disabled → bot runs rule-only  
- [ ] `start --mode sim` places virtual trades with ATR SL/TP  
- [ ] `start --mode testnet` places real testnet orders with SL/TP  
- [ ] `start --mode live` works with explicit config flag `allowLive: true` safety  
- [ ] `backtest --from --to` produces JSON report  
- [ ] `status` shows feeds, balance, positions  
- [ ] SIGINT graceful shutdown without closing positions  
- [ ] Unit tests ≥ 80% coverage on sentiment + risk math modules  

---

## 22. References

- [Binance USDⓈ-M Futures API](https://binance-docs.github.io/apidocs/futures/en/)  
- [OpenRouter API](https://openrouter.ai/docs)  
- Binance Futures Testnet: https://testnet.binancefuture.com  

---

*End of specification.*
