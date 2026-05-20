# Crypto News Auto-Trader — Implementation Plan (Full)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/TypeScript CLI that trades Binance USDⓈ-M Futures from free RSS news (hybrid rule + OpenRouter sentiment), MTF strategy, ATR SL/TP, and % balance sizing — with sim, testnet, live, and backtest modes.

**Architecture:** Modular monolith in one process; typed EventBus between news → sentiment → market/strategy → risk → execution adapter. SQLite for news cache, signals, trades. Same `StrategyEngine` + `RiskEngine` for all modes.

**Tech Stack:** Node 20+, TypeScript 5, commander, zod, yaml, pino, better-sqlite3, rss-parser, vitest, undici, ws.

**Spec:** `docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md`

---

## Table of Contents

1. [Prerequisites & Dev Environment](#1-prerequisites--dev-environment)
2. [Complete Repository Tree](#2-complete-repository-tree)
3. [Runtime Sequence Diagrams](#3-runtime-sequence-diagrams)
4. [Configuration — Full Artifacts](#4-configuration--full-artifacts)
5. [Module Specifications (Every File)](#5-module-specifications-every-file)
6. [Binance Futures API Reference](#6-binance-futures-api-reference)
7. [OpenRouter LLM — Full Contract](#7-openrouter-llm--full-contract)
8. [State Machines & Edge Cases](#8-state-machines--edge-cases)
9. [Test Matrix (All Cases)](#9-test-matrix-all-cases)
10. [Implementation Tasks (Exhaustive)](#10-implementation-tasks-exhaustive)
11. [Manual QA Scripts](#11-manual-qa-scripts)
12. [Phase Deliverables & Definition of Done](#12-phase-deliverables--definition-of-done)
13. [Troubleshooting](#13-troubleshooting)
14. [Execution Handoff](#14-execution-handoff)

---

## 1. Prerequisites & Dev Environment

### 1.1 Required accounts

| Account | Purpose | Setup |
|---------|---------|--------|
| Binance Futures Testnet | Paper API trading | https://testnet.binancefuture.com → API Management |
| Binance Futures Mainnet | Live (phase 7 only) | API key: Futures enabled, **Withdrawals disabled**, IP whitelist recommended |
| OpenRouter | LLM sentiment | https://openrouter.ai → API key, set spending limit |

### 1.2 Local machine (Windows)

- Node.js **20 LTS** (`node -v` ≥ 20)
- **Visual Studio Build Tools** (for `better-sqlite3` native compile on Windows)  
  - Or: `npm install --build-from-source=false` if prebuilt binary available
- Git Bash or PowerShell
- Optional: Docker **not** required for MVP

### 1.3 Project root after full build

```
c:/Publish/tool-test/
├── config/default.yaml
├── data/                    # gitignored
│   ├── trader.db
│   ├── klines/
│   ├── reports/
│   └── .paused
├── dist/                    # tsc output
├── src/                     # see §2
├── tests/
└── docs/superpowers/...
```

### 1.4 Global npm scripts (final)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run build` | `tsc` | Compile to `dist/` |
| `npm run dev` | `tsx src/cli/index.ts` | Dev CLI without build |
| `npm start` | `node dist/cli/index.js` | Production CLI |
| `npm test` | `vitest run` | All tests |
| `npm run test:coverage` | `vitest run --coverage` | Coverage gate |
| `npm run lint` | `tsc --noEmit` | Typecheck |

---

## 2. Complete Repository Tree

Every file below MUST exist at MVP completion. `[P#]` = phase number.

```
crypto-news-trader/
├── package.json                          [P0]
├── package-lock.json                     [P0]
├── tsconfig.json                         [P0]
├── vitest.config.ts                      [P0]
├── .gitignore                            [P0]
├── .env.example                          [P0]
├── README.md                             [P9]
├── config/
│   └── default.yaml                      [P0]
├── src/
│   ├── cli/
│   │   ├── index.ts                      [P1] entry, register all commands
│   │   └── commands/
│   │       ├── validate.ts               [P1]
│   │       ├── start.ts                  [P4]
│   │       ├── backtest.ts               [P8]
│   │       ├── status.ts                 [P4]
│   │       ├── feeds.ts                  [P1]
│   │       ├── pause.ts                  [P4]
│   │       └── resume.ts                 [P4]
│   ├── config/
│   │   ├── schema.ts                     [P0] Zod + exported AppConfig type
│   │   └── loader.ts                     [P0] loadConfig, loadConfigWithEnv
│   ├── core/
│   │   ├── types.ts                      [P0] all domain interfaces
│   │   ├── event-bus.ts                  [P0]
│   │   ├── logger.ts                     [P0]
│   │   ├── pause-flag.ts                 [P4]
│   │   ├── circuit-breaker.ts            [P6]
│   │   ├── hash.ts                       [P1] sha256 for news id
│   │   └── retry.ts                      [P1] exponential backoff helper
│   ├── storage/
│   │   ├── db.ts                         [P0]
│   │   ├── migrate.ts                    [P0]
│   │   ├── migrations/001_initial.sql    [P0]
│   │   └── repositories/
│   │       ├── news-repo.ts              [P0]
│   │       ├── signal-repo.ts            [P0]
│   │       ├── trade-repo.ts             [P4]
│   │       ├── feed-repo.ts              [P1]
│   │       └── llm-repo.ts               [P5]
│   ├── news/
│   │   ├── rss-poller.ts                 [P1]
│   │   ├── rss-poller-manager.ts         [P1] manages N feeds
│   │   ├── normalizer.ts                 [P1]
│   │   ├── dedupe.ts                     [P1]
│   │   └── symbol-mapper.ts              [P1]
│   ├── sentiment/
│   │   ├── rule-scorer.ts                [P1]
│   │   ├── signal-merger.ts              [P1]
│   │   ├── signal-strength.ts            [P1] pure formula
│   │   ├── llm-schema.ts                 [P5] Zod LlmSentiment
│   │   ├── llm-gateway.ts                [P5]
│   │   ├── llm-prompts.ts                [P5] system + user templates
│   │   └── news-pipeline.ts              [P1] orchestrates poll→signal
│   ├── market/
│   │   ├── indicators.ts                 [P2]
│   │   ├── kline-store.ts                [P2]
│   │   ├── binance-rest.ts               [P2] unsigned public + signed
│   │   ├── binance-ws.ts                 [P2]
│   │   ├── binance-market.ts             [P2] facade: bootstrap + subscribe
│   │   ├── kline-cache.ts                [P8]
│   │   └── timeframe.ts                  [P2] interval enum helpers
│   ├── strategy/
│   │   ├── mtf-engine.ts                 [P3]
│   │   ├── pending-signals.ts            [P3] in-memory store
│   │   └── strategy-engine.ts            [P3]
│   ├── risk/
│   │   ├── sl-tp-calculator.ts           [P3]
│   │   ├── position-sizer.ts             [P3]
│   │   └── risk-engine.ts                [P3]
│   ├── execution/
│   │   ├── adapter.interface.ts          [P4]
│   │   ├── exchange-info.ts              [P6]
│   │   ├── binance-sign.ts               [P6] HMAC SHA256
│   │   ├── binance-futures.ts            [P6] shared REST order methods
│   │   ├── binance-testnet.ts            [P6]
│   │   ├── binance-live.ts               [P7]
│   │   ├── sim-broker.ts                 [P4]
│   │   ├── backtest-replayer.ts          [P8]
│   │   └── adapter-factory.ts            [P4] createAdapter(mode, config)
│   └── app/
│       ├── bootstrap.ts                  [P4] wire all modules
│       ├── shutdown.ts                   [P4] SIGINT handler
│       └── runtime-context.ts            [P4] holds bus, config, adapter, repos
├── tests/
│   ├── unit/                             (see §9)
│   ├── integration/
│   └── fixtures/
│       ├── rss/coindesk-sample.xml
│       ├── rss/macro-ambiguous.xml
│       ├── llm/valid-bullish.json
│       ├── llm/invalid-json.txt
│       └── klines/btcusdt_15m_sample.json
└── docs/superpowers/...
```

---

## 3. Runtime Sequence Diagrams

### 3.1 News → Signal (live/sim)

```
RssPollerManager          NewsPipeline           RuleScorer      LlmGateway       SignalMerger
      |                        |                    |               |                |
      |--poll feed------------>|                    |               |                |
      |                        |--normalize------>|               |                |
      |                        |--map symbols---->|               |                |
      |                        |--dedupe check--->|               |                |
      |                        |--insert raw DB-->|               |                |
      |                        |--score---------->|               |                |
      |                        |                    |               |                |
      |                        |--if needsLlm--------------------->|               |
      |                        |                    |<--LlmSentiment|                |
      |                        |--merge------------------------------------------->|
      |                        |--persist signal DB------------------------------>|
      |                        |--emit news:signal--------------------------------> EventBus
```

### 3.2 Signal → Order (sim)

```
EventBus          StrategyEngine       MtfEngine      RiskEngine      SimBroker
   |                    |                 |              |               |
   |--news:signal------>|                 |              |               |
   |                    |--store pending |              |               |
   |--candleClose------>|                 |              |               |
   |                    |--evaluate MTF->|              |               |
   |                    |--emit intent------------------>|               |
   |                    |                 |              |--orderPlan-->|
   |                    |                 |              |               |--fill
   |                    |                 |              |<--execution:fill
```

### 3.3 Testnet order placement

```
RiskEngine    BinanceFuturesClient    Binance REST
     |               |                      |
     |--MARKET order->|--POST /order------->|
     |               |<--fill--------------|
     |--STOP_MARKET-->|--POST /order------->|
     |--TP_MARKET---->|--POST /order------->|
```

### 3.4 Backtest loop

```
BacktestReplayer     KlineCache        news_signals DB      StrategyEngine
       |                  |                  |                    |
       |--load klines---->|                  |                    |
       |--load signals---------------------->|                    |
       |--for each candle close----------------------------------->|
       |                  |                  |                    |--same as live
       |--check SL/TP on high/low (intrabar)---------------------> SimBroker logic
       |--write report JSON-------------------------------------->|
```

---

## 4. Configuration — Full Artifacts

### 4.1 `.env.example` (complete)

```bash
# Binance USD-M Futures (testnet keys for dev)
BINANCE_API_KEY=
BINANCE_API_SECRET=

# OpenRouter (required if sentiment.llm.enabled: true)
OPENROUTER_API_KEY=

# Overrides
CONFIG_PATH=./config/default.yaml
SQLITE_PATH=./data/trader.db
LOG_LEVEL=info
```

### 4.2 `config/default.yaml` (copy exactly)

```yaml
mode: sim

allowLive: false

symbols:
  - BTCUSDT
  - ETHUSDT

symbolOverrides: {}

timeframes:
  context: 1h
  entry: 15m

feeds:
  - id: coindesk
    url: https://www.coindesk.com/arc/outboundfeeds/rss/
    pollIntervalSec: 90
    enabled: true
  - id: cointelegraph
    url: https://cointelegraph.com/rss
    pollIntervalSec: 120
    enabled: true

sentiment:
  rules:
    impactHigh: 3
    thresholdLLM: 3
    minStrength: 0.4
    strongNewsThreshold: 0.75
    bullishKeywords:
      - rally
      - approval
      - inflow
      - rate cut
      - partnership
      - surge
    bearishKeywords:
      - hack
      - exploit
      - ban
      - lawsuit
      - outflow
      - rate hike
      - crash
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
        keywords: [fed, cpi, fomc, interest rate, powell]
        impact: 3
      - tag: hack
        keywords: [hack, exploited, drained, breach]
        impact: 3
        sentiment: -1
      - tag: etf
        keywords: [etf, approval, inflow]
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
  minAtrPercent: 0.3
  entry:
    requireEmaConfirm: true
    waitForNextCandleClose: true
  onePositionPerSymbol: true

risk:
  positionPercent: 2
  minNotionalUsdt: 5
  maxNotionalUsdt: null
  slAtrMultiplier: 1.5
  tpAtrMultiplier: 3.0
  trailingStop: false

binance:
  baseUrl: https://fapi.binance.com
  testnetBaseUrl: https://testnet.binancefuture.com
  testnetWsUrl: wss://stream.binancefuture.com
  mainnetWsUrl: wss://fstream.binance.com
  recvWindow: 5000
  wsReconnectMaxRetries: 10
  circuitBreaker:
    enabled: true
    maxFailures: 3
    windowMs: 300000

sim:
  initialBalanceUsdt: 10000
  feeRate: 0.0004
  slippageBps: 5
  fillModel: conservative

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

### 4.3 `src/config/schema.ts` — full Zod (implement verbatim)

```typescript
import { z } from 'zod';

const timeframeEnum = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']);
const futuresSymbol = z.string().regex(/^[A-Z0-9]+USDT$/);

export const FeedSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  pollIntervalSec: z.number().int().min(30).max(3600),
  enabled: z.boolean(),
});

export const TagRuleSchema = z.object({
  tag: z.string(),
  keywords: z.array(z.string()),
  impact: z.number().min(0).max(10),
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
});

export const AppConfigSchema = z.object({
  mode: z.enum(['live', 'testnet', 'sim']).default('sim'),
  allowLive: z.boolean().default(false),
  symbols: z.array(futuresSymbol).min(1),
  symbolOverrides: z.record(z.object({
    timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }).optional(),
    risk: z.object({ positionPercent: z.number().min(0.1).max(100) }).optional(),
  })).default({}),
  timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }),
  feeds: z.array(FeedSchema).refine((f) => f.some((x) => x.enabled), 'At least one feed enabled'),
  sentiment: z.object({
    rules: z.object({
      impactHigh: z.number(),
      thresholdLLM: z.number(),
      minStrength: z.number().min(0).max(1),
      strongNewsThreshold: z.number().min(0).max(1),
      bullishKeywords: z.array(z.string()),
      bearishKeywords: z.array(z.string()),
      bearishTags: z.array(z.string()),
      macroTags: z.array(z.string()),
      blacklistKeywords: z.array(z.string()),
      tagRules: z.array(TagRuleSchema),
    }),
    llm: z.object({
      enabled: z.boolean(),
      provider: z.literal('openrouter'),
      baseUrl: z.string().url(),
      model: z.string(),
      maxCallsPerHour: z.number().int().positive(),
      minConfidence: z.number().min(0).max(1),
      timeoutMs: z.number().int().positive(),
      defaultTtlMinutes: z.number().int().min(5).max(240),
    }),
  }),
  strategy: z.object({
    emaContextPeriod: z.number().int().positive(),
    emaEntryPeriod: z.number().int().positive(),
    atrPeriod: z.number().int().positive(),
    minAtrPercent: z.number().positive(),
    entry: z.object({
      requireEmaConfirm: z.boolean(),
      waitForNextCandleClose: z.boolean(),
    }),
    onePositionPerSymbol: z.boolean(),
  }),
  risk: z.object({
    positionPercent: z.number().min(0.1).max(100),
    minNotionalUsdt: z.number().positive(),
    maxNotionalUsdt: z.number().positive().nullable(),
    slAtrMultiplier: z.number().positive(),
    tpAtrMultiplier: z.number().positive(),
    trailingStop: z.boolean(),
  }),
  binance: z.object({
    baseUrl: z.string().url(),
    testnetBaseUrl: z.string().url(),
    testnetWsUrl: z.string().url(),
    mainnetWsUrl: z.string().url(),
    recvWindow: z.number().int(),
    wsReconnectMaxRetries: z.number().int(),
    circuitBreaker: z.object({
      enabled: z.boolean(),
      maxFailures: z.number().int(),
      windowMs: z.number().int(),
    }),
  }),
  sim: z.object({
    initialBalanceUsdt: z.number().positive(),
    feeRate: z.number().min(0),
    slippageBps: z.number().min(0),
    fillModel: z.enum(['conservative', 'optimistic']),
  }),
  backtest: z.object({
    klineCacheDir: z.string(),
    reportDir: z.string(),
    fillModel: z.enum(['conservative', 'optimistic']),
  }),
  storage: z.object({ sqlitePath: z.string() }),
  logging: z.object({ level: z.string(), pretty: z.boolean() }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type FeedConfig = z.infer<typeof FeedSchema>;
```

### 4.4 `loadConfigWithEnv` behavior

```typescript
// src/config/loader.ts
export function loadConfigWithEnv(configPath: string): AppConfig {
  const config = loadConfig(configPath);
  if (process.env.SQLITE_PATH) {
    config.storage.sqlitePath = process.env.SQLITE_PATH;
  }
  return config;
}

export function assertRuntimeSecrets(config: AppConfig, mode: string): void {
  if (mode === 'testnet' || mode === 'live') {
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET required');
    }
  }
  if (config.sentiment.llm.enabled && !process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY required when llm.enabled');
  }
  if (mode === 'live' && !config.allowLive) {
    throw new Error('Refusing live mode: set allowLive: true in config');
  }
}
```

---

## 5. Module Specifications (Every File)

### 5.1 `src/core/hash.ts`

```typescript
import { createHash } from 'node:crypto';

export function newsId(sourceId: string, title: string, publishedAt: Date): string {
  const payload = `${sourceId}|${title.trim()}|${publishedAt.toISOString()}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function signalId(): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16);
}
```

### 5.2 `src/sentiment/signal-strength.ts`

```typescript
export function computeStrength(params: {
  impactScore: number;
  ruleSentiment: -1 | 0 | 1;
  confidence?: number;
  usedLlm: boolean;
}): number {
  const base = Math.min(params.impactScore / 5, 1);
  if (params.usedLlm && params.confidence != null) {
    return base * 0.4 + params.confidence * 0.6;
  }
  return base * (params.ruleSentiment !== 0 ? 1 : 0.5);
}
```

### 5.3 `src/news/symbol-mapper.ts` — full API

| Method | Input | Output |
|--------|-------|--------|
| `extractSymbols(text)` | title + summary | `string[]` whitelist symbols |

**Alias table (extend in constructor):**

```typescript
const DEFAULT_ALIASES: Record<string, string> = {
  bitcoin: 'BTC', btc: 'BTC',
  ethereum: 'ETH', eth: 'ETH',
  solana: 'SOL', sol: 'SOL',
  ripple: 'XRP', xrp: 'XRP',
  binance: 'BNB', bnb: 'BNB',
};
```

### 5.4 `src/sentiment/rule-scorer.ts` — algorithm

```
INPUT: NewsItem, config.sentiment.rules
1. if blacklist match in title+summary → return { discard: true }
2. impactScore = sum(tagRules matches), cap 10
3. bullCount, bearCount from keywords
4. ruleSentiment = sign(bullCount - bearCount), 0 if equal
5. priority = high if impact>=impactHigh OR tags∩macroTags else medium/low
6. needsLlm = per spec §7.4 (three conditions)
OUTPUT: RuleScoreResult
```

### 5.5 `src/sentiment/news-pipeline.ts` — orchestrator

```typescript
export class NewsPipeline {
  constructor(
    private readonly deps: {
      mapper: SymbolMapper;
      scorer: RuleScorer;
      merger: SignalMerger;
      llm: LlmGateway | null;
      newsRepo: NewsRepository;
      signalRepo: SignalRepository;
      bus: AppEventBus;
      config: AppConfig;
      log: Logger;
    },
  ) {}

  async processRawItem(raw: RssRawItem, sourceId: string): Promise<void> {
    // 1 normalize → NewsItem
    // 2 if symbols empty return
    // 3 if newsRepo.exists(id) return
    // 4 newsRepo.insertRaw
    // 5 score → if discard mark processed return
    // 6 llm if needsLlm && gateway
    // 7 merger.build → if null return
    // 8 signalRepo.insert + bus.emit('news:signal')
    // 9 newsRepo.markProcessed
  }
}
```

### 5.6 `src/market/indicators.ts` — exports

| Function | Signature |
|----------|-----------|
| `sma` | `(values: number[], period: number) => number \| null` |
| `ema` | `(closes: number[], period: number) => number[]` |
| `atr` | `(candles: Candle[], period: number) => number[]` |
| `last` | `<T>(arr: T[]) => T \| undefined` |
| `emaSlopeUp` | `(emaSeries: number[], lookback = 3) => boolean` |
| `emaSlopeDown` | `(emaSeries: number[], lookback = 3) => boolean` |

### 5.7 `src/strategy/mtf-engine.ts` — exports

| Method | Returns |
|--------|---------|
| `evaluateContext(symbol, candles1h, signal)` | `{ allow: boolean; reason?: string }` |
| `evaluateEntry(symbol, candles15m, direction)` | `{ confirm: boolean; atr: number; close: number }` |

**Context bullish:** `close > ema50` AND `emaSlopeUp(ema50Series)`  
**Entry long:** `close > ema20` AND `atr/close*100 >= minAtrPercent`

### 5.8 `src/risk/sl-tp-calculator.ts`

```typescript
export function calcSlTp(params: {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  atr: number;
  slMult: number;
  tpMult: number;
}): { stopLoss: number; takeProfit: number } {
  const { side, entryPrice, atr, slMult, tpMult } = params;
  const slDist = slMult * atr;
  const tpDist = tpMult * atr;
  if (side === 'BUY') {
    return { stopLoss: entryPrice - slDist, takeProfit: entryPrice + tpDist };
  }
  return { stopLoss: entryPrice + slDist, takeProfit: entryPrice - tpDist };
}
```

### 5.9 `src/risk/position-sizer.ts`

```typescript
export function calcQuantity(params: {
  availableBalance: number;
  positionPercent: number;
  entryPrice: number;
  minNotional: number;
  maxNotional: number | null;
  stepSize: number;
  minQty: number;
}): { quantity: number; notional: number } | null {
  let notional = params.availableBalance * (params.positionPercent / 100);
  if (params.maxNotional != null) notional = Math.min(notional, params.maxNotional);
  if (notional < params.minNotional) return null;
  const rawQty = notional / params.entryPrice;
  const quantity = Math.floor(rawQty / params.stepSize) * params.stepSize;
  if (quantity < params.minQty) return null;
  return { quantity, notional: quantity * params.entryPrice };
}
```

### 5.10 `src/execution/adapter.interface.ts`

See spec §11.1 — implement **exactly** these methods; no `setLeverage`.

### 5.11 `src/app/runtime-context.ts`

```typescript
export interface RuntimeContext {
  config: AppConfig;
  mode: 'live' | 'testnet' | 'sim';
  bus: AppEventBus;
  log: Logger;
  db: Database.Database;
  adapter: ExecutionAdapter;
  newsPipeline: NewsPipeline;
  rssManager: RssPollerManager;
  market: BinanceMarket;
  strategy: StrategyEngine;
  risk: RiskEngine;
  startedAt: Date;
}
```

### 5.12 `src/app/bootstrap.ts` — wiring checklist

- [ ] `openDatabase` + `migrate`
- [ ] `createAdapter(mode)`
- [ ] `adapter.connect()`
- [ ] Instantiate repos, bus, pipeline, market, strategy, risk
- [ ] `bus.on('news:signal', ...)` → strategy
- [ ] `bus.on('market:candleClose', ...)` → strategy
- [ ] `bus.on('strategy:intent', ...)` → risk → adapter
- [ ] `bus.on('execution:fill', ...)` → tradeRepo
- [ ] `rssManager.start()` + `market.start(symbols, [contextTf, entryTf])`
- [ ] `registerShutdown(ctx)` — SIGINT

---

## 6. Binance Futures API Reference

### 6.1 Public (no sign) — sim market data

| Method | HTTP | Path | Query |
|--------|------|------|-------|
| Server time | GET | `/fapi/v1/time` | — |
| Klines | GET | `/fapi/v1/klines` | `symbol`, `interval`, `limit=200` |
| Exchange info | GET | `/fapi/v1/exchangeInfo` | — |
| Mark price | GET | `/fapi/v1/premiumIndex` | `symbol` |

**Kline response mapping:** `[openTime, open, high, low, close, volume, closeTime, ...]`

### 6.2 Signed (testnet/live)

**Signature:** `HMAC_SHA256(queryString, secret)` → `signature` query param  
**Headers:** `X-MBX-APIKEY: key`

| Action | Method | Path | Key params |
|--------|--------|------|------------|
| Balance | GET | `/fapi/v2/balance` | `timestamp`, `recvWindow` |
| Position | GET | `/fapi/v2/positionRisk` | `symbol` optional |
| Market order | POST | `/fapi/v1/order` | `symbol`, `side`, `type=MARKET`, `quantity` |
| Stop loss | POST | `/fapi/v1/order` | `type=STOP_MARKET`, `stopPrice`, `reduceOnly=true` |
| Take profit | POST | `/fapi/v1/order` | `type=TAKE_PROFIT_MARKET`, `stopPrice`, `reduceOnly=true` |
| Cancel all | DELETE | `/fapi/v1/allOpenOrders` | `symbol` |

**Side mapping:**

| Intent | Futures side | Position side (one-way) |
|--------|--------------|-------------------------|
| Long | `BUY` | BOTH |
| Short | `SELL` | BOTH |

**SL/TP side for close:** opposite of position (long → SELL stop)

### 6.3 WebSocket

**Kline:** `wss://fstream.binance.com/stream?streams=btcusdt@kline_15m/ethusdt@kline_1h`  
Parse: `data.k.x === true` → closed candle.

**User data (testnet/live):** listenKey → `wss://fstream.binance.com/ws/{listenKey}`  
Events: `ORDER_TRADE_UPDATE` → reconcile fills.

### 6.4 Error codes to handle

| Code | Meaning | Action |
|------|---------|--------|
| -2019 | Margin insufficient | Log, skip trade, no retry |
| -1021 | Timestamp | Sync server time, retry once |
| -1003 | Rate limit | Backoff per `Retry-After` |
| -4118 | Reduce-only reject | Log config error |

---

## 7. OpenRouter LLM — Full Contract

### 7.1 `src/sentiment/llm-prompts.ts`

```typescript
export const SYSTEM_PROMPT = `You are a crypto futures news analyst.
Return ONLY valid JSON with keys: sentiment (-1|0|1), confidence (0-1), affectedSymbols (array), rationale (max 200 chars), ttlMinutes (5-240).
Only include symbols from the provided whitelist.
No markdown. No explanation outside JSON.`;

export function buildUserPrompt(item: NewsItem, rule: RuleScoreResult, whitelist: string[]): string {
  return JSON.stringify({
    title: item.title,
    summary: item.summary ?? '',
    url: item.url,
    publishedAt: item.publishedAt.toISOString(),
    whitelist,
    ruleTags: rule.tags,
    impactScore: rule.impactScore,
    ruleSentiment: rule.ruleSentiment,
  });
}
```

### 7.2 HTTP request body

```json
{
  "model": "openai/gpt-4o-mini",
  "temperature": 0.1,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user", "content": "<buildUserPrompt>" }
  ]
}
```

### 7.3 `LlmSentimentSchema` (Zod)

```typescript
export const LlmSentimentSchema = z.object({
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  confidence: z.number().min(0).max(1),
  affectedSymbols: z.array(z.string()),
  rationale: z.string().max(200),
  ttlMinutes: z.number().int().min(5).max(240),
});
```

### 7.4 Rate limit implementation

```typescript
// src/sentiment/llm-gateway.ts
export class LlmGateway {
  private callTimestamps: number[] = [];

  canCall(maxPerHour: number): boolean {
    const hourAgo = Date.now() - 3600_000;
    this.callTimestamps = this.callTimestamps.filter((t) => t > hourAgo);
    return this.callTimestamps.length < maxPerHour;
  }

  async analyze(...): Promise<LlmSentiment | null> {
    if (!this.canCall(this.config.maxCallsPerHour)) return null;
    // fetch → parse → llmRepo.insert → return
  }
}
```

---

## 8. State Machines & Edge Cases

### 8.1 Pending signal (per symbol)

```
States: NONE → PENDING → CONFIRMED | EXPIRED | SKIPPED

NONE + news:signal        → PENDING (store expiresAt, direction)
PENDING + candleClose     → evaluate MTF → CONFIRMED (emit intent) or stay PENDING
PENDING + now > expiresAt → EXPIRED
PENDING + position exists → SKIPPED (onePositionPerSymbol)
PENDING + pause flag      → hold until resume
```

### 8.2 Feed health

```
OK → FAIL (1 error) → ... → FAIL (5 consecutive) → DEGRADED (skip poll 10 min) → OK
```

### 8.3 Circuit breaker (Binance orders)

```
CLOSED → OPEN (3 failures in 5 min) → HALF (on resume manual) → CLOSED
When OPEN: reject new OrderPlan, log halt
```

### 8.4 Edge case catalog

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| E1 | RSS item "Dogecoin moon" whitelist BTC only | Skip silently |
| E2 | Duplicate headline republished | Dedupe by id, skip |
| E3 | LLM returns sentiment 0 | Merger uses rule-only; may no signal |
| E4 | LLM returns symbol not in whitelist | Filter before signal |
| E5 | News long, context bearish, strength 0.5 | Skip (mtf_conflict) |
| E6 | News long, context bearish, strength 0.8 | Allow (strong news) |
| E7 | ATR too low | Entry not confirmed |
| E8 | quantity < minQty | Log quantity_too_small, no order |
| E9 | SIGINT during open position | Stop process, position remains |
| E10 | balance 0 | Skip trade |
| E11 | OpenRouter 429 | Fallback rule, log |
| E12 | WS disconnect | Reconnect, no duplicate orders |
| E13 | SL hit same bar as TP (backtest) | **Conservative:** SL first |
| E14 | live without allowLive | Exit code 1 with message |
| E15 | backtest no news in DB | Exit 1, suggest --mock-sentiment |

---

## 9. Test Matrix (All Cases)

### 9.1 Unit tests — file → cases

| File | Test name | Assertion |
|------|-----------|-----------|
| `event-bus.test.ts` | emits news:signal | handler called once |
| `config-loader.test.ts` | loads default yaml | symbols contains BTCUSDT |
| `config-loader.test.ts` | rejects empty symbols | Zod throws |
| `hash.test.ts` | stable news id | same input → same hash |
| `symbol-mapper.test.ts` | maps Bitcoin | ['BTCUSDT'] |
| `symbol-mapper.test.ts` | filters non-whitelist | [] for SOL only whitelist BTC |
| `symbol-mapper.test.ts` | multiple tickers | BTC+ETH when both whitelisted |
| `rule-scorer.test.ts` | blacklist discards | discard true |
| `rule-scorer.test.ts` | hack bearish | ruleSentiment -1 |
| `rule-scorer.test.ts` | needsLlm high ambiguous | needsLlm true |
| `rule-scorer.test.ts` | macro tag high priority | priority high |
| `signal-strength.test.ts` | llm blend | value in 0..1 |
| `signal-merger.test.ts` | rule long | direction long |
| `signal-merger.test.ts` | below minStrength | null |
| `indicators.test.ts` | ema known series | matches snapshot |
| `indicators.test.ts` | atr calculation | matches manual TR |
| `mtf-engine.test.ts` | bullish context allows long | allow true |
| `mtf-engine.test.ts` | bearish blocks long | allow false |
| `mtf-engine.test.ts` | entry confirm long | confirm true |
| `sl-tp-calculator.test.ts` | long SL/TP prices | 97 and 106 |
| `position-sizer.test.ts` | 2% of 1000 | notional 20 |
| `position-sizer.test.ts` | stepSize floor | quantity stepped |
| `exchange-info.test.ts` | round price | tickSize respect |
| `sim-broker.test.ts` | open and close long TP | balance increased |
| `sim-broker.test.ts` | SL hit | position closed loss |
| `circuit-breaker.test.ts` | trips after 3 failures | isOpen true |
| `llm-gateway.test.ts` | parses valid JSON | LlmSentiment |
| `llm-gateway.test.ts` | rate limit blocks | returns null |
| `pending-signals.test.ts` | expires pending | removed |

### 9.2 Integration tests

| File | Scenario |
|------|----------|
| `rss-pipeline.test.ts` | fixture coindesk → 1 signal BTC |
| `rss-pipeline.test.ts` | fixture doge → 0 signals |
| `news-llm-pipeline.test.ts` | mock fetch OpenRouter → merged signal |
| `strategy-sim.test.ts` | synthetic candles + signal → intent emitted |
| `backtest-smoke.test.ts` | mock sentiment 7d → report trades > 0 |

### 9.3 Fixtures to create

**`tests/fixtures/rss/coindesk-sample.xml`** — 2 items  
**`tests/fixtures/rss/macro-ambiguous.xml`** — Fed rate headline, no clear keyword  
**`tests/fixtures/llm/valid-bullish.json`** — full LlmSentiment  
**`tests/fixtures/klines/btcusdt_15m_sample.json`** — 100 candles array  

---

## 10. Implementation Tasks (Exhaustive)

> Each task: failing test → implement → pass → commit.  
> Commit message format shown in last step.

---

### PHASE 0 — Scaffold (Tasks 0.1–0.8)

#### Task 0.1: package.json + deps

- [ ] Create `package.json` with name `crypto-news-trader`, bin `crypto-trader`, engines node>=20
- [ ] Run: `npm install commander zod yaml pino pino-pretty better-sqlite3 rss-parser undici ws`
- [ ] Run: `npm install -D typescript @types/node @types/ws vitest tsx @vitest/coverage-v8`
- [ ] Commit: `chore: init package and dependencies`

#### Task 0.2: TypeScript + Vitest config

- [ ] Create `tsconfig.json` (module NodeNext, strict, outDir dist, rootDir src)
- [ ] Create `vitest.config.ts` with coverage thresholds:

```typescript
coverage: {
  provider: 'v8',
  include: ['src/sentiment/**', 'src/risk/**'],
  thresholds: { lines: 80, functions: 80, branches: 75 },
},
```

- [ ] Commit: `chore: add tsconfig and vitest`

#### Task 0.3: .gitignore + .env.example + data dir

- [ ] Create `.gitignore`, `.env.example` per §4.1
- [ ] `mkdir -p data/klines data/reports`
- [ ] Commit: `chore: gitignore and env example`

#### Task 0.4: config/default.yaml + schema + loader

- [ ] Copy YAML §4.2 to `config/default.yaml`
- [ ] Implement `src/config/schema.ts` §4.3
- [ ] Implement `src/config/loader.ts` + `loadConfigWithEnv` + `assertRuntimeSecrets`
- [ ] Tests: `tests/unit/config-loader.test.ts` (2 cases §9.1)
- [ ] Commit: `feat: config schema and loader`

#### Task 0.5: core/types.ts (complete)

- [ ] Implement ALL interfaces from spec §6 including `RuleScoreResult`, `LlmSentiment`, `BacktestReport`, `ExchangeFilters`, `RssRawItem`
- [ ] Commit: `feat: domain types`

#### Task 0.6: event-bus + logger + hash + retry

- [ ] `event-bus.ts`, `logger.ts`, `hash.ts`, `retry.ts`
- [ ] Tests: event-bus, hash
- [ ] Commit: `feat: core utilities`

#### Task 0.7: SQLite migration + repos

- [ ] `migrations/001_initial.sql` — full schema spec §12.1 + schema_migrations table
- [ ] `migrate.ts` — apply if version < 1
- [ ] `news-repo.ts`: insertRaw, exists, markProcessed, isProcessed
- [ ] `signal-repo.ts`: insert, listBetween
- [ ] `feed-repo.ts`: upsertStatus
- [ ] `trade-repo.ts`: insertOpen, close
- [ ] `llm-repo.ts`: insertCall, countLastHour
- [ ] Tests: news-repo
- [ ] Commit: `feat: sqlite storage layer`

#### Task 0.8: CLI skeleton

- [ ] `src/cli/index.ts` register stub commands
- [ ] `validate.ts` load config print OK
- [ ] Run: `npm run dev -- validate --config config/default.yaml`
- [ ] Commit: `feat: cli skeleton and validate`

**Phase 0 DoD:** `npm test` passes, `validate` exits 0.

---

### PHASE 1 — News Pipeline (Tasks 1.1–1.12)

#### Task 1.1: symbol-mapper + tests

- [ ] Implement §5.3, tests §9.1 (3 cases)
- [ ] Commit: `feat: symbol mapper`

#### Task 1.2: rule-scorer + tests

- [ ] Implement §5.4, tests (4 cases)
- [ ] Commit: `feat: rule scorer`

#### Task 1.3: signal-strength + signal-merger + tests

- [ ] Implement §5.2, merger uses minStrength
- [ ] Commit: `feat: signal merger`

#### Task 1.4: normalizer + dedupe

- [ ] `normalizer.ts`: RssRawItem → NewsItem using hash id
- [ ] `dedupe.ts`: wrapper newsRepo.exists
- [ ] Commit: `feat: news normalizer and dedupe`

#### Task 1.5: RSS fixtures

- [ ] Write `coindesk-sample.xml`, `macro-ambiguous.xml`
- [ ] Commit: `test: rss fixtures`

#### Task 1.6: rss-poller.ts

- [ ] Fetch with undici, timeout 10s, User-Agent header
- [ ] Parse with rss-parser
- [ ] Retry via `retry.ts` 3 attempts
- [ ] Commit: `feat: rss poller`

#### Task 1.7: news-pipeline.ts

- [ ] Orchestrate §5.5 without LLM
- [ ] Commit: `feat: news pipeline orchestrator`

#### Task 1.8: rss-poller-manager.ts

- [ ] Start/stop all feeds, update feed_status
- [ ] Degraded 10 min after 5 failures §8.2
- [ ] Commit: `feat: rss poller manager`

#### Task 1.9: integration test rss-pipeline

- [ ] Mock HTTP return fixture XML
- [ ] Assert signal emitted once for BTC headline
- [ ] Commit: `test: rss integration`

#### Task 1.10: feeds command

- [ ] `feeds.ts` print table of feed_status
- [ ] Commit: `feat: feeds cli command`

#### Task 1.11: wire pipeline to validate dry-run

- [ ] Add `validate --dry-poll` optional: poll once, print signal count
- [ ] Commit: `feat: validate dry poll option`

#### Task 1.12: Phase 1 manual test

- [ ] Run dry-poll against real RSS (network)
- [ ] Verify SQLite `news_raw` rows inserted
- [ ] Document in README

**Phase 1 DoD:** RSS → rule signal in DB + event (unit/integration pass).

---

### PHASE 2 — Market Data (Tasks 2.1–2.10)

#### Task 2.1: timeframe.ts + indicators.ts

- [ ] Binance interval mapping helpers
- [ ] EMA, ATR, slope functions §5.6
- [ ] Tests + snapshot for EMA
- [ ] Commit: `feat: technical indicators`

#### Task 2.2: kline-store.ts

- [ ] Ring buffer 200 candles per symbol+tf
- [ ] `onCandleClose(callback)` when closed candle appended
- [ ] Commit: `feat: kline store`

#### Task 2.3: binance-rest.ts (public)

- [ ] `getKlines(baseUrl, symbol, interval, limit)`
- [ ] `getExchangeInfo`, `getServerTime`
- [ ] Commit: `feat: binance public rest`

#### Task 2.4: binance-ws.ts

- [ ] Combined stream builder for N symbols × 2 TF
- [ ] Reconnect logic §8
- [ ] Commit: `feat: binance kline websocket`

#### Task 2.5: binance-market.ts facade

- [ ] `start()`: REST bootstrap then WS subscribe
- [ ] On close emit `market:candleClose`
- [ ] Commit: `feat: binance market facade`

#### Task 2.6: kline fixture + store test

- [ ] `btcusdt_15m_sample.json` 100 bars
- [ ] Test store updates indicators
- [ ] Commit: `test: kline store fixtures`

#### Task 2.7: optional live kline smoke script

- [ ] `src/scripts/smoke-klines.ts` log 3 closes (dev only, not in bin)
- [ ] Commit: `chore: kline smoke script`

**Phase 2 DoD:** WS/REST klines update store, indicators computed.

---

### PHASE 3 — Strategy & Risk (Tasks 3.1–3.12)

#### Task 3.1: pending-signals.ts

- [ ] Map symbol → pending NewsSignal
- [ ] Expire sweep method `pruneExpired()`
- [ ] Tests
- [ ] Commit: `feat: pending signal store`

#### Task 3.2: mtf-engine.ts

- [ ] Implement §5.7, §8.1 state transitions
- [ ] Tests (3 cases)
- [ ] Commit: `feat: mtf engine`

#### Task 3.3: strategy-engine.ts

- [ ] Subscribe news:signal + candleClose
- [ ] Check pause flag §5.11
- [ ] Inject `hasPosition(symbol)` from adapter
- [ ] Emit strategy:intent
- [ ] Commit: `feat: strategy engine`

#### Task 3.4: sl-tp-calculator + position-sizer

- [ ] §5.8, §5.9 + tests
- [ ] Commit: `feat: risk calculators`

#### Task 3.5: risk-engine.ts

- [ ] Listen strategy:intent
- [ ] Get balance from adapter, filters from exchange-info (sim: defaults)
- [ ] Emit risk:orderPlan
- [ ] Commit: `feat: risk engine`

#### Task 3.6: integration strategy-sim.test.ts

- [ ] Synthetic klines + signal → intent
- [ ] Commit: `test: strategy integration`

**Phase 3 DoD:** Intent emitted on fixture candles when aligned.

---

### PHASE 4 — Sim Mode E2E (Tasks 4.1–4.15)

#### Task 4.1: adapter.interface.ts + factory

- [ ] `adapter-factory.ts` returns SimBroker for sim
- [ ] Commit: `feat: execution adapter interface`

#### Task 4.2: sim-broker.ts (full)

- [ ] Positions map, balance, fees, slippage
- [ ] `onCandle(candle)` check SL/TP intrabar §E13 SL first
- [ ] Tests §9.1
- [ ] Commit: `feat: sim broker`

#### Task 4.3: exchange-info.ts defaults for sim

- [ ] Static filters BTCUSDT ETHUSDT or fetch once
- [ ] Commit: `feat: exchange info cache`

#### Task 4.4: runtime-context + bootstrap sim

- [ ] Wire all modules §5.12
- [ ] Sim mode uses mainnet public WS only
- [ ] Commit: `feat: sim bootstrap wiring`

#### Task 4.5: shutdown.ts

- [ ] SIGINT handler §4.12 spec
- [ ] Commit: `feat: graceful shutdown`

#### Task 4.6: start command

- [ ] `--mode sim --config`
- [ ] Optional `--symbols BTCUSDT`
- [ ] Commit: `feat: start command sim mode`

#### Task 4.7: pause-flag + pause/resume commands

- [ ] `data/.paused` check in strategy
- [ ] Commit: `feat: pause resume commands`

#### Task 4.8: status command

- [ ] Balance, positions, feeds, signal count 24h
- [ ] Commit: `feat: status command`

#### Task 4.9: trade-repo wiring on fills

- [ ] Persist trades on execution events
- [ ] Commit: `feat: trade persistence`

#### Task 4.10: Manual sim run 10 minutes

- [ ] Document expected logs in README
- [ ] Verify no uncaught exceptions

#### Task 4.11: build + bin

- [ ] `npm run build` && `npm start -- status`
- [ ] Commit: `chore: production build verified`

**Phase 4 DoD:** `start --mode sim` runs 10+ min; trades in SQLite when signals align.

---

### PHASE 5 — LLM (Tasks 5.1–5.8)

#### Task 5.1: llm-schema + llm-prompts

- [ ] §7 full
- [ ] Commit: `feat: llm prompts and schema`

#### Task 5.2: llm-gateway.ts

- [ ] undici POST, parse, rate limit §7.4
- [ ] Mock tests
- [ ] Commit: `feat: openrouter llm gateway`

#### Task 5.3: integrate into news-pipeline

- [ ] Branch needsLlm
- [ ] Commit: `feat: llm in news pipeline`

#### Task 5.4: validate OpenRouter ping

- [ ] Minimal 1-token or models request
- [ ] Commit: `feat: validate openrouter`

#### Task 5.5: integration news-llm-pipeline.test.ts

- [ ] Commit: `test: llm pipeline integration`

**Phase 5 DoD:** Ambiguous macro fixture triggers mock LLM → signal in DB.

---

### PHASE 6 — Testnet (Tasks 6.1–6.14)

#### Task 6.1: binance-sign.ts

- [ ] `sign(query, secret)` HMAC SHA256 hex
- [ ] Test vector known query
- [ ] Commit: `feat: binance signing`

#### Task 6.2: binance-futures.ts

- [ ] All signed endpoints §6.2
- [ ] **Assert no leverage endpoint in codebase** — grep check in CI script optional
- [ ] Commit: `feat: binance futures rest client`

#### Task 6.3: circuit-breaker.ts

- [ ] §8.3
- [ ] Commit: `feat: circuit breaker`

#### Task 6.4: binance-testnet.ts adapter

- [ ] Implements ExecutionAdapter
- [ ] placeEntry + SL + TP sequence
- [ ] User stream reconcile
- [ ] Commit: `feat: binance testnet adapter`

#### Task 6.5: bootstrap testnet mode

- [ ] `start --mode testnet`
- [ ] Commit: `feat: testnet bootstrap`

#### Task 6.6: Manual testnet checklist §11

- [ ] Run with positionPercent 0.5, BTC only
- [ ] Screenshot/log proof SL TP orders created

**Phase 6 DoD:** Testnet entry + SL + TP visible in Binance testnet UI.

---

### PHASE 7 — Live (Tasks 7.1–7.4)

#### Task 7.1: binance-live.ts

- [ ] Same as testnet, mainnet baseUrl
- [ ] Commit: `feat: binance live adapter`

#### Task 7.2: allowLive gate + warning banner

- [ ] Refuse without `allowLive: true`
- [ ] Commit: `feat: live safety gate`

#### Task 7.3: README live section + risks

- [ ] Commit: `docs: live trading warnings`

**Phase 7 DoD:** Live starts only with explicit flag; places order (user verified).

---

### PHASE 8 — Backtest (Tasks 8.1–8.10)

#### Task 8.1: kline-cache.ts downloader

- [ ] Paginate klines REST by time range
- [ ] Save JSON per symbol+tf
- [ ] Commit: `feat: kline cache downloader`

#### Task 8.2: backtest-replayer.ts

- [ ] Load signals, iterate candles, reuse strategy/risk
- [ ] Intrabar SL first §E13
- [ ] Commit: `feat: backtest replayer`

#### Task 8.3: mock-sentiment generator

- [ ] `--mock-sentiment` inserts synthetic signals
- [ ] Commit: `feat: mock sentiment for backtest`

#### Task 8.4: backtest command + report JSON

- [ ] Output `BacktestReport` §6
- [ ] Commit: `feat: backtest cli`

#### Task 8.5: backtest-smoke.test.ts

- [ ] Commit: `test: backtest smoke`

**Phase 8 DoD:** `backtest --mock-sentiment` produces report with trades > 0.

---

### PHASE 9 — Docs & Acceptance (Tasks 9.1–9.6)

#### Task 9.1: README.md Vietnamese sections

- [ ] Install, config, modes, risks, disclaimer
- [ ] Commit: `docs: readme`

#### Task 9.2: Coverage gate

- [ ] `npm run test:coverage` sentiment+risk ≥80%
- [ ] Commit: `test: coverage thresholds`

#### Task 9.3: Acceptance checklist

- [ ] Copy spec §21 into `docs/ACCEPTANCE.md` and tick items
- [ ] Commit: `docs: acceptance checklist`

#### Task 9.4: Final package.json bin

- [ ] Verify `npx crypto-trader` after global link optional

**Phase 9 DoD:** All §21 acceptance criteria checked.

---

## 11. Manual QA Scripts

### 11.1 Sim smoke (10 min)

```bash
cd c:/Publish/tool-test
cp .env.example .env
# fill OPENROUTER_API_KEY optional
npm run dev -- validate --config config/default.yaml
npm run dev -- start --mode sim --config config/default.yaml
# Wait 10 min — expect: RSS polled, feed OK logs
npm run dev -- status --config config/default.yaml
# Ctrl+C — expect: shutdown message, no position auto-close
```

### 11.2 Testnet small trade

```bash
# config: symbols [BTCUSDT], positionPercent: 0.5
npm run dev -- start --mode testnet --config config/default.yaml
# Verify on testnet.binancefuture.com: position + SL + TP orders
npm run dev -- pause
# Confirm no new trades after conflicting news
npm run dev -- resume
```

### 11.3 Backtest

```bash
npm run dev -- backtest --from 2025-01-01 --to 2025-01-07 --mock-sentiment --config config/default.yaml
ls data/reports/
```

### 11.4 LLM rate limit

```bash
# Set maxCallsPerHour: 1, publish 2 ambiguous macro headlines in mock
# Expect: second uses rule-only, log llm_rate_limited
```

---

## 12. Phase Deliverables & Definition of Done

| Phase | Deliverable | DoD |
|-------|-------------|-----|
| 0 | Build + validate + DB | `npm test`, `validate` OK |
| 1 | News → signal | Integration RSS test pass, DB rows |
| 2 | Klines + indicators | Store receives closed candles |
| 3 | MTF + risk math | strategy-sim test pass |
| 4 | Sim E2E | 10 min run, optional sim trade in DB |
| 5 | OpenRouter | LLM integration test pass |
| 6 | Testnet | Manual checklist §11.2 complete |
| 7 | Live gate | allowLive blocks by default |
| 8 | Backtest | Report JSON with trades |
| 9 | Docs | README + acceptance all checked |

**MVP complete when:** all Phase 9 DoD + spec §21 criteria satisfied.

---

## 13. Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `better-sqlite3` compile error Windows | Missing build tools | Install VS Build Tools or use prebuilt binary |
| `BINANCE_API_KEY required` | Missing .env | Copy `.env.example` |
| No signals in sim | No whitelist match in news | Lower minStrength or add feeds |
| LLM never called | impact below threshold | Use macro-ambiguous fixture or lower thresholdLLM |
| WS disconnect loop | Network/firewall | Increase retries; use REST poll fallback (phase 2) |
| backtest empty trades | No news_signals in range | Run sim first or `--mock-sentiment` |
| Testnet 401 | Wrong key or URL | Use testnet keys + testnetBaseUrl |
| `-2019` margin | Too large positionPercent | Lower % or add testnet USDT |
| Duplicate orders | Double signal same symbol | Verify onePositionPerSymbol + dedupe |

---

## 14. Execution Handoff

**Plan path:** `docs/superpowers/plans/2026-05-20-crypto-news-trader.md`  
**Spec path:** `docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md`

**Scope:** 9 phases, **~75 atomic tasks**, **~30 test cases**, full module API + Binance/OpenRouter contracts.

**Estimated calendar time:** 4–5 weeks (1 developer).

### Start implementation

| Option | Description |
|--------|-------------|
| **1. Subagent-Driven** | One subagent per Task (e.g. 0.1, 0.2…), review between tasks |
| **2. Inline** | Execute Phase 0 → 9 in this session with checkpoints |

**Reply with `1` or `2`** (or `Inline Phase 0`) to begin coding.

---

*End of full implementation plan.*
