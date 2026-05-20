# Crypto News Auto-Trader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/TypeScript CLI that trades Binance USDⓈ-M Futures from free RSS news (hybrid rule + OpenRouter sentiment), MTF strategy, ATR SL/TP, and % balance sizing — with sim, testnet, live, and backtest modes.

**Architecture:** Modular monolith in one process; typed EventBus between news → sentiment → market/strategy → risk → execution adapter. SQLite for news cache, signals, trades. Same `StrategyEngine` + `RiskEngine` for all modes.

**Tech Stack:** Node 20+, TypeScript 5, commander, zod, yaml, pino, better-sqlite3, rss-parser, vitest, ws/undici, Binance Futures REST/WS.

**Spec reference:** `docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md`

---

## File Map (create order)

| Path | Responsibility |
|------|----------------|
| `package.json` | deps, bin `crypto-trader`, scripts |
| `tsconfig.json` | strict, ESM or CJS (pick CJS + tsc for simplicity) |
| `vitest.config.ts` | test paths |
| `.gitignore` | node_modules, .env, data/ |
| `.env.example` | BINANCE_*, OPENROUTER_* |
| `config/default.yaml` | full default config per spec §5 |
| `src/core/types.ts` | shared interfaces |
| `src/core/event-bus.ts` | typed EventEmitter |
| `src/core/logger.ts` | pino wrapper |
| `src/config/schema.ts` | Zod schema |
| `src/config/loader.ts` | YAML + env merge |
| `src/storage/db.ts` | SQLite singleton |
| `src/storage/migrations/001_initial.sql` | schema §12 |
| `src/storage/migrate.ts` | runner |
| `src/storage/repositories/*.ts` | news, signals, trades, feeds |
| `src/news/*` | RSS pipeline |
| `src/sentiment/*` | rules, LLM, merger |
| `src/market/*` | klines, indicators |
| `src/strategy/*` | MTF + engine |
| `src/risk/*` | SL/TP, sizing |
| `src/execution/*` | adapters |
| `src/app/bootstrap.ts` | wire modules for `start` |
| `src/cli/*` | commands |

---

## Phase 0 — Project Scaffold

### Task 0.1: Initialize package and TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "crypto-news-trader",
  "version": "0.1.0",
  "type": "module",
  "bin": { "crypto-trader": "./dist/cli/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli/index.ts",
    "start": "node dist/cli/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd c:/Publish/tool-test
npm install commander zod yaml pino pino-pretty better-sqlite3 rss-parser undici ws
npm install -D typescript @types/node @types/ws vitest tsx
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
data/
*.db
coverage/
```

- [ ] **Step 6: Verify build**

```bash
npm run lint
```

Expected: no src yet — only fails after first ts file; skip or add empty `src/core/types.ts` exporting `{}`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example
git commit -m "chore: scaffold Node.js TypeScript project"
```

---

### Task 0.2: Core types and EventBus

**Files:**
- Create: `src/core/types.ts`, `src/core/event-bus.ts`, `src/core/logger.ts`
- Test: `tests/unit/event-bus.test.ts`

- [ ] **Step 1: Write failing test for EventBus emit/on**

```typescript
// tests/unit/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AppEventBus } from '../../src/core/event-bus.js';
import type { NewsSignal } from '../../src/core/types.js';

describe('AppEventBus', () => {
  it('emits news:signal to subscriber', () => {
    const bus = new AppEventBus();
    const handler = vi.fn();
    bus.on('news:signal', handler);
    const signal: NewsSignal = {
      id: 'sig-1',
      newsId: 'news-1',
      symbols: ['BTCUSDT'],
      direction: 'long',
      strength: 0.8,
      expiresAt: new Date(Date.now() + 60000),
      source: 'rule',
      createdAt: new Date(),
    };
    bus.emit('news:signal', signal);
    expect(handler).toHaveBeenCalledWith(signal);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/unit/event-bus.test.ts
```

- [ ] **Step 3: Implement `src/core/types.ts`** (minimal interfaces from spec §6)

```typescript
export interface NewsItem {
  id: string;
  sourceId: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt: Date;
  fetchedAt: Date;
  symbols: string[];
  tags: string[];
}

export type SentimentDirection = 'long' | 'short';
export type SignalSource = 'rule' | 'llm' | 'merged';

export interface NewsSignal {
  id: string;
  newsId: string;
  symbols: string[];
  direction: SentimentDirection;
  strength: number;
  expiresAt: Date;
  source: SignalSource;
  createdAt: Date;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export interface TradeIntent {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  newsSignalId: string;
  newsId: string;
  entryPrice: number;
  atr: number;
  contextTimeframe: string;
  entryTimeframe: string;
  createdAt: Date;
}

export interface OrderPlan {
  intentId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryType: 'MARKET';
  stopLoss: number;
  takeProfit: number;
  notionalUsdt: number;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  fee: number;
  timestamp: Date;
}

export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  unrealizedPnl?: number;
}
```

- [ ] **Step 4: Implement `src/core/event-bus.ts`**

```typescript
import { EventEmitter } from 'node:events';
import type { NewsSignal, TradeIntent, OrderPlan, Fill, Candle, NewsItem } from './types.js';

export interface AppEvents {
  'news:raw': NewsItem;
  'news:signal': NewsSignal;
  'market:candleClose': { symbol: string; timeframe: string; candle: Candle };
  'strategy:intent': TradeIntent;
  'risk:orderPlan': OrderPlan;
  'execution:fill': Fill;
  'execution:positionClosed': { symbol: string; pnl: number };
  'system:pause': void;
}

export class AppEventBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
    this.emitter.on(event, listener as (payload: unknown) => void);
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  off<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
    this.emitter.off(event, listener as (payload: unknown) => void);
  }
}
```

- [ ] **Step 5: Implement `src/core/logger.ts`**

```typescript
import pino from 'pino';

export const createLogger = (level = 'info', pretty = true) =>
  pino({
    level,
    transport: pretty ? { target: 'pino-pretty' } : undefined,
  });

export type Logger = ReturnType<typeof createLogger>;
```

- [ ] **Step 6: Run tests — PASS**

```bash
npm test -- tests/unit/event-bus.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/core tests/unit/event-bus.test.ts
git commit -m "feat: add core types, event bus, and logger"
```

---

### Task 0.3: Config schema and loader

**Files:**
- Create: `src/config/schema.ts`, `src/config/loader.ts`, `config/default.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Copy `config/default.yaml`** from spec §5.3 (full YAML block in design spec lines 218–310)

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import path from 'node:path';

describe('loadConfig', () => {
  it('loads default yaml with symbols array', () => {
    const configPath = path.join(process.cwd(), 'config/default.yaml');
    const config = loadConfig(configPath);
    expect(config.symbols).toContain('BTCUSDT');
    expect(config.timeframes.entry).toBe('15m');
  });
});
```

- [ ] **Step 3: Implement Zod schema** in `src/config/schema.ts` — export `AppConfigSchema` matching all keys in spec §5.3 including nested `sentiment`, `strategy`, `risk`, `sim`, `binance`.

Key validations:
- `symbols`: `z.array(z.string().regex(/^[A-Z0-9]+USDT$/)).min(1)`
- `timeframes.context` / `entry`: enum of allowed intervals
- `risk.positionPercent`: `z.number().min(0.1).max(100)`

- [ ] **Step 4: Implement loader**

```typescript
import fs from 'node:fs';
import yaml from 'yaml';
import { AppConfigSchema, type AppConfig } from './schema.js';

export function loadConfig(configPath: string): AppConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = yaml.parse(raw);
  return AppConfigSchema.parse(parsed);
}
```

- [ ] **Step 5: Run test — PASS**

```bash
npm test -- tests/unit/config-loader.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add config/default.yaml src/config tests/unit/config-loader.test.ts
git commit -m "feat: add YAML config schema and loader"
```

---

### Task 0.4: SQLite migrations and repositories

**Files:**
- Create: `src/storage/migrations/001_initial.sql`, `src/storage/migrate.ts`, `src/storage/db.ts`
- Create: `src/storage/repositories/news-repo.ts`, `signal-repo.ts`, `trade-repo.ts`, `feed-repo.ts`
- Test: `tests/unit/news-repo.test.ts`

- [ ] **Step 1: Write SQL migration** — copy verbatim from spec §12.1 + add:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write failing test for insert/find news**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../../src/storage/db.js';
import { NewsRepository } from '../../src/storage/repositories/news-repo.js';

const testDb = path.join(process.cwd(), 'data/test-trader.db');

describe('NewsRepository', () => {
  beforeEach(() => {
    fs.mkdirSync(path.dirname(testDb), { recursive: true });
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  });
  afterEach(() => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  });

  it('inserts and finds raw news by id', () => {
    const db = openDatabase(testDb);
    const repo = new NewsRepository(db);
    repo.insertRaw({
      id: 'abc',
      sourceId: 'coindesk',
      title: 'Bitcoin rises',
      url: 'https://example.com',
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      symbolsJson: '["BTCUSDT"]',
      tagsJson: '["macro"]',
    });
    expect(repo.exists('abc')).toBe(true);
  });
});
```

- [ ] **Step 3: Implement `openDatabase` + `migrate`**

```typescript
// src/storage/db.ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(sqlitePath: string): Database.Database {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  return db;
}
```

`migrate.ts`: read `001_initial.sql`, apply if version < 1.

- [ ] **Step 4: Implement `NewsRepository`**

Methods: `insertRaw`, `exists`, `markProcessed`, `isProcessed`, `insertSignal`, `listSignalsBetween(from, to)`.

- [ ] **Step 5: Run test — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/storage tests/unit/news-repo.test.ts
git commit -m "feat: add SQLite migrations and news repository"
```

---

## Phase 1 — News Pipeline (rules only, no LLM)

### Task 1.1: Symbol mapper

**Files:**
- Create: `src/news/symbol-mapper.ts`
- Test: `tests/unit/symbol-mapper.test.ts`

- [ ] **Step 1: Failing tests**

Cases:
1. `"Bitcoin hits ATH"` + whitelist `['BTCUSDT']` → `['BTCUSDT']`
2. `"Solana rally"` + whitelist only BTC → `[]`
3. `"BTC and ETH rise"` → both if in whitelist

- [ ] **Step 2: Implement**

```typescript
export class SymbolMapper {
  constructor(
    private readonly whitelist: string[],
    private readonly aliases: Record<string, string> = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      solana: 'SOL',
    },
  ) {}

  extractSymbols(text: string): string[] {
    const upper = text.toUpperCase();
    const found = new Set<string>();
    for (const [alias, ticker] of Object.entries(this.aliases)) {
      const re = new RegExp(`\\b(${alias}|${ticker})\\b`, 'i');
      if (re.test(text)) {
        const symbol = `${ticker}USDT`;
        if (this.whitelist.includes(symbol)) found.add(symbol);
      }
    }
    return [...found];
  }
}
```

- [ ] **Step 3: PASS tests + commit** `feat: add symbol mapper with whitelist filter`

---

### Task 1.2: Rule scorer

**Files:**
- Create: `src/sentiment/rule-scorer.ts`
- Test: `tests/unit/rule-scorer.test.ts`

- [ ] **Step 1: Tests for**

- `needsLlm: true` when high impact + sentiment 0
- `needsLlm: true` when impact >= thresholdLLM
- blacklist → discard (return null)
- hack keyword → bearish tag impact

- [ ] **Step 2: Implement `RuleScorer.score(news: NewsItem)`** returning:

```typescript
export interface RuleScoreResult {
  newsId: string;
  impactScore: number;
  ruleSentiment: -1 | 0 | 1;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  needsLlm: boolean;
  needsLlmReason?: string;
  discard?: boolean;
}
```

- [ ] **Step 3: PASS + commit** `feat: add rule-based news scorer`

---

### Task 1.3: Signal merger (rule-only path)

**Files:**
- Create: `src/sentiment/signal-merger.ts`
- Test: `tests/unit/signal-merger.test.ts`

- [ ] **Step 1: Test rule-only emits long/short with TTL**

- [ ] **Step 2: Implement `buildSignal(rule, news, config)`** — strength formula per spec §6.4; return `null` if below `minStrength`.

- [ ] **Step 3: PASS + commit**

---

### Task 1.4: RSS poller + normalizer + dedupe

**Files:**
- Create: `src/news/rss-poller.ts`, `src/news/normalizer.ts`, `src/news/dedupe.ts`
- Create: `tests/fixtures/rss/coindesk-sample.xml` (minimal 2-item RSS)
- Test: `tests/integration/rss-pipeline.test.ts`

- [ ] **Step 1: Add fixture RSS XML** (2 items, one with "Bitcoin", one with "Dogecoin")

- [ ] **Step 2: Integration test** — parse fixture → mapper → only BTC if whitelist BTC only

- [ ] **Step 3: Implement `RssPoller`**

- constructor(feedConfig, newsRepo, eventBus, logger)
- `start()` / `stop()`
- poll: fetch → parse → normalize → dedupe.check → insert raw → score → merge → persist signal → `bus.emit('news:signal')`
- retry 3x on failure; update `feed_status` table

- [ ] **Step 4: Run integration test with mocked HTTP** (inject fetch function)

- [ ] **Step 5: Commit** `feat: add RSS poller and news pipeline`

---

### Task 1.5: CLI stub — validate + feeds

**Files:**
- Create: `src/cli/index.ts`, `src/cli/commands/validate.ts`, `src/cli/commands/feeds.ts`

- [ ] **Step 1: Wire commander**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerValidate } from './commands/validate.js';

const program = new Command();
program.name('crypto-trader').version('0.1.0');
registerValidate(program);
program.parse();
```

- [ ] **Step 2: `validate` command** — load config, print OK, exit 0

- [ ] **Step 3: Manual test**

```bash
npm run dev -- validate --config config/default.yaml
```

Expected: `Config valid.`

- [ ] **Step 4: Commit** `feat: add validate CLI command`

---

## Phase 2 — Market Data & Indicators

### Task 2.1: EMA and ATR indicators

**Files:**
- Create: `src/market/indicators.ts`
- Test: `tests/unit/indicators.test.ts`

- [ ] **Step 1: Test EMA with known 5-period closes** [1,2,3,4,5] — compare to precomputed value

- [ ] **Step 2: Test ATR with 3 candles** — hand-calculate TR

- [ ] **Step 3: Implement** `ema(closes, period)`, `atr(candles, period)`, `emaSlope(emaSeries, lookback=3)`

- [ ] **Step 4: PASS + commit**

---

### Task 2.2: Kline store + REST bootstrap

**Files:**
- Create: `src/market/kline-store.ts`, `src/market/binance-market.ts`
- Test: `tests/unit/kline-store.test.ts`

- [ ] **Step 1: `KlineStore`** — per symbol per TF: ring buffer 200 candles, `onClose` callback

- [ ] **Step 2: `BinanceMarketClient.fetchKlines(symbol, interval, limit=200)`** — `GET /fapi/v1/klines` using undici; map to `Candle[]`

- [ ] **Step 3: Unit test store update** without network (inject candles)

- [ ] **Step 4: Optional integration test** — skip if no network: `it.skip` for CI

- [ ] **Step 5: Commit**

---

### Task 2.3: WebSocket kline stream (sim/live)

**Files:**
- Modify: `src/market/binance-market.ts` — add `subscribeKlines(symbols, timeframes, onClose)`

- [ ] **Step 1: Combined stream URL** `wss://fstream.binance.com/stream?streams=btcusdt@kline_15m/...`

- [ ] **Step 2: On kline `x: true` (closed)** → update store → emit `market:candleClose`

- [ ] **Step 3: Reconnect with exponential backoff max 10**

- [ ] **Step 4: Manual smoke** (document in README): run 30s listener log closes

- [ ] **Step 5: Commit**

---

## Phase 3 — Strategy (MTF) & Risk

### Task 3.1: MTF engine

**Files:**
- Create: `src/strategy/mtf-engine.ts`, `src/strategy/strategy-engine.ts`
- Test: `tests/unit/mtf-engine.test.ts`

- [ ] **Step 1: Test bullish context** — synthetic candles where close > EMA50 and slope up → allows long

- [ ] **Step 2: Test conflict** — news long + bearish context + low strength → skip

- [ ] **Step 3: Test entry confirm** — close > EMA20, ATR filter pass → true

- [ ] **Step 4: Implement `MtfEngine.evaluateContext` / `evaluateEntry`**

- [ ] **Step 5: `StrategyEngine`**

- listen `news:signal` → store pending per symbol with expiry
- listen `market:candleClose` on entry TF → try confirm → emit `strategy:intent`
- check `onePositionPerSymbol` via adapter callback injected

- [ ] **Step 6: PASS + commit**

---

### Task 3.2: SL/TP calculator and position sizer

**Files:**
- Create: `src/risk/sl-tp-calculator.ts`, `src/risk/position-sizer.ts`, `src/risk/risk-engine.ts`
- Test: `tests/unit/sl-tp-calculator.test.ts`, `tests/unit/position-sizer.test.ts`

- [ ] **Step 1: SL/TP tests**

Long entry 100, ATR 2, slMult 1.5, tpMult 3 → SL 97, TP 106

- [ ] **Step 2: Position sizer test**

balance 1000, 2% → notional 20; quantity respects stepSize 0.001

- [ ] **Step 3: `RiskEngine.handleIntent(intent, balance, exchangeFilters)`** → emit `risk:orderPlan`

- [ ] **Step 4: PASS + commit**

---

## Phase 4 — SimBroker & `start --mode sim`

### Task 4.1: Execution adapter interface + SimBroker

**Files:**
- Create: `src/execution/adapter.interface.ts`, `src/execution/sim-broker.ts`
- Test: `tests/unit/sim-broker.test.ts`

- [ ] **Step 1: Define interface** per spec §11.1

- [ ] **Step 2: SimBroker**

- `initialBalanceUsdt`, `feeRate`, `slippageBps`, `fillModel`
- `placeEntry` → fill at conservative price (high for long)
- track open positions; each candle check SL/TP hit on high/low
- `getBalance`, `getPosition`

- [ ] **Step 3: Test round-trip** entry → price hits TP → position closed profit

- [ ] **Step 4: Commit**

---

### Task 4.2: App bootstrap and start command

**Files:**
- Create: `src/app/bootstrap.ts`, `src/cli/commands/start.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: `bootstrapSim(config)`**

1. open DB migrate
2. create bus, logger, repos
3. create SimBroker, StrategyEngine, RiskEngine, BinanceMarket (public only)
4. wire event handlers: intent → risk → execution
5. start RSS pollers, WS klines
6. SIGINT handler: stop pollers/ws, log positions, exit 0

- [ ] **Step 2: `start --mode sim --config ...`**

- [ ] **Step 3: Manual run 2 minutes**

```bash
npm run dev -- start --mode sim --config config/default.yaml
```

Expected: RSS poll logs, optional signal logs, no crash.

- [ ] **Step 4: Commit** `feat: wire sim mode end-to-end`

---

### Task 4.3: pause/resume + status

**Files:**
- Create: `src/cli/commands/pause.ts`, `resume.ts`, `status.ts`, `src/core/pause-flag.ts`

- [ ] **Step 1: `data/.paused` flag** checked in StrategyEngine before intent

- [ ] **Step 2: `status`** prints balance, positions, feed_status rows, signals last 24h count

- [ ] **Step 3: Commit**

---

## Phase 5 — OpenRouter LLM Gateway

### Task 5.1: LLM gateway

**Files:**
- Create: `src/sentiment/llm-gateway.ts`, `src/sentiment/llm-schema.ts`
- Test: `tests/unit/llm-gateway.test.ts` (mock fetch)
- Fixture: `tests/fixtures/llm/valid-response.json`

- [ ] **Step 1: Zod schema for LlmSentiment** per spec §6.3

- [ ] **Step 2: Mock test** — returns parsed sentiment

- [ ] **Step 3: Implement OpenRouter client** with rate limit counter + SQLite `llm_calls` insert

- [ ] **Step 4: Integrate into RssPoller** after RuleScorer when `needsLlm`

- [ ] **Step 5: Test rule-only when `llm.enabled: false`**

- [ ] **Step 6: Commit**

---

### Task 5.2: validate command — OpenRouter ping

- [ ] **Step 1: Extend validate** — if LLM enabled and key present, minimal completion request; warn if missing key

- [ ] **Step 2: Commit**

---

## Phase 6 — Binance Testnet Adapter

### Task 6.1: Exchange info + filters

**Files:**
- Create: `src/execution/exchange-info.ts`
- Test: `tests/unit/exchange-info.test.ts`

- [ ] **Step 1: Cache `LOT_SIZE`, `PRICE_FILTER`** per symbol; `roundQuantity`, `roundPrice`

- [ ] **Step 2: Commit**

---

### Task 6.2: BinanceTestnet adapter

**Files:**
- Create: `src/execution/binance-testnet.ts` (or shared `binance-futures.ts` with baseUrl param)
- Test: manual only checklist

- [ ] **Step 1: Implement signed requests** HMAC SHA256 — `placeMarketOrder`, `placeStopMarket`, `placeTakeProfitMarket`

- [ ] **Step 2: `getBalance`**, `getPositionRisk`**

- [ ] **Step 3: Never call leverage endpoint** — assert no such method in code review

- [ ] **Step 4: User stream** for order updates → reconcile

- [ ] **Step 5: Circuit breaker** — 3 failures in 5 min → halt new orders

- [ ] **Step 6: `bootstrapTestnet` in bootstrap.ts**

- [ ] **Step 7: Manual testnet checklist** per spec §17.3

- [ ] **Step 8: Commit**

---

## Phase 7 — Live Mode (safety gate)

### Task 7.1: BinanceLive + allowLive flag

**Files:**
- Create: `src/execution/binance-live.ts`
- Modify: `src/config/schema.ts` — add `allowLive: z.boolean().default(false)`

- [ ] **Step 1: `start --mode live` fails** unless `allowLive: true` in config

- [ ] **Step 2: Reuse binance-futures client** with mainnet baseUrl

- [ ] **Step 3: Log prominent warning** on startup LIVE TRADING ENABLED

- [ ] **Step 4: Commit**

---

## Phase 8 — Backtest

### Task 8.1: Kline cache downloader

**Files:**
- Create: `src/market/kline-cache.ts`, `src/cli/commands/backtest.ts`

- [ ] **Step 1: Download klines for date range** to `data/klines/{symbol}_{tf}.json`

- [ ] **Step 2: Commit**

---

### Task 8.2: BacktestReplayer

**Files:**
- Create: `src/execution/backtest-replayer.ts`
- Test: `tests/integration/backtest-smoke.test.ts`

- [ ] **Step 1: Load signals from DB between from/to**

- [ ] **Step 2: Iterate entry TF candles chronologically**

- [ ] **Step 3: Same Strategy + Risk** with adapter implementing backtest fills; intrabar SL/TP

- [ ] **Step 4: `--mock-sentiment`** generates synthetic signals for dev

- [ ] **Step 5: Write report JSON** to `data/reports/backtest-{ts}.json`

- [ ] **Step 6: Test smoke with mock sentiment — non-empty trades array**

- [ ] **Step 7: Commit**

---

## Phase 9 — Documentation & Acceptance

### Task 9.1: README and .env.example

**Files:**
- Create: `README.md` (Vietnamese or bilingual per user preference)

Sections per spec §19:
- Install, config, sim → testnet → live
- OpenRouter setup
- Risks disclaimer
- Manual test checklist

- [ ] **Commit** `docs: add README and env example`

---

### Task 9.2: Acceptance checklist run

- [ ] Run full unit suite: `npm test` — all PASS
- [ ] `crypto-trader validate` — PASS
- [ ] `start --mode sim` 5 min — no uncaught errors
- [ ] Coverage check: `npx vitest run --coverage` — sentiment + risk modules ≥ 80%
- [ ] Tick acceptance criteria in spec §21 (copy to PR description)

---

## Dependency Graph (implementation order)

```
Phase 0 (scaffold)
    ↓
Phase 1 (news/rules) ──────────────────────────┐
    ↓                                          │
Phase 2 (market)                               │
    ↓                                          │
Phase 3 (strategy + risk)                      │
    ↓                                          │
Phase 4 (sim E2E) ← first working demo         │
    ↓                                          │
Phase 5 (LLM)                                  │
    ↓                                          │
Phase 6 (testnet)                              │
    ↓                                          │
Phase 7 (live)                                 │
    ↓                                          │
Phase 8 (backtest) ← needs news cache from sim ┘
    ↓
Phase 9 (docs + acceptance)
```

---

## Commands Reference (developer)

| Action | Command |
|--------|---------|
| Dev CLI | `npm run dev -- <cmd> [opts]` |
| Build | `npm run build` |
| Test all | `npm test` |
| Test one | `npm test -- tests/unit/rule-scorer.test.ts` |
| Sim run | `npm run dev -- start --mode sim --config config/default.yaml` |
| Backtest | `npm run dev -- backtest --from 2025-01-01 --to 2025-01-31 --mock-sentiment` |

---

## Commit Convention

- `chore:` scaffold, deps
- `feat:` new module behavior
- `test:` tests only
- `fix:` bugfix
- `docs:` README

One commit per task section above (or per step group if small).

---

## Risk Notes for Implementers

1. **better-sqlite3** on Windows may need build tools — document `npm install` troubleshooting in README.
2. **Binance testnet** URLs differ from mainnet — use `testnetBaseUrl` from config only.
3. **News backtest** requires prior sim run to populate `news_signals`; document clearly.
4. Do not log API keys; redact in pino serializers.
5. **% balance** multi-position exposure — no code change needed; README warning required.

---

## Execution Handoff

Plan complete. Spec: `docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md`.

**Estimated effort:** 4–5 weeks solo (per spec phases); ~35–45 bite-sized task groups above.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement task-by-task in current session with checkpoints  

**Which approach do you want to start implementation with?**
