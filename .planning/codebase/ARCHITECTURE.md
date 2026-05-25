# Architecture

**Analysis Date:** 2026-05-25

## Pattern Overview

**Overall:** Event-driven monolithic CLI application (single Node process)

**Key Characteristics:**
- Commander CLI with subcommands (`start`, `backtest`, `feeds`, `validate`, …)
- In-process pub/sub via typed event bus
- Adapter pattern for execution (`sim` / `testnet` / `live`)
- Pipeline: RSS → sentiment → strategy → risk → execution
- SQLite as system of record for news and trades

## Layers

**CLI Layer:**
- Purpose: Parse args, load env, register commands
- Contains: `src/cli/index.ts`, `src/cli/commands/*.ts`
- Depends on: config loader, bootstrap for `start`
- Used by: User via `crypto-trader` binary

**Application / Runtime Layer:**
- Purpose: Wire dependencies, start pollers, markets, shutdown hooks
- Contains: `src/app/bootstrap.ts`, `src/app/runtime-context.ts`, `src/app/shutdown.ts`
- Depends on: all domain modules
- Used by: `start` command

**News & Sentiment Layer:**
- Purpose: Ingest RSS, score news, optional LLM merge
- Contains: `src/news/*`, `src/sentiment/*`
- Depends on: storage repos, config
- Emits: signals into pipeline via `NewsPipeline` (`src/sentiment/news-pipeline.ts`)

**Market Layer:**
- Purpose: Klines (REST + WS), indicators, Elliott/Fib, MTF context
- Contains: `src/market/*`, `src/strategy/mtf-engine.ts`, `src/strategy/strategy-engine.ts`
- Depends on: Binance APIs, `KlineStore` (`src/market/kline-store.ts`)

**Risk & Execution Layer:**
- Purpose: Position sizing, SL/TP, place orders via adapter
- Contains: `src/risk/*`, `src/execution/*`
- Depends on: config, exchange info, event bus
- Listens: `strategy:intent`, emits `risk:orderPlan`, `execution:fill`

**Storage Layer:**
- Purpose: Persistence and migrations
- Contains: `src/storage/db.ts`, `migrate.ts`, `repositories/*`
- Used by: news pipeline, trade persistence, LLM rate limits

**Config Layer:**
- Purpose: Load and validate YAML + env
- Contains: `src/config/load-env.ts`, `loader.ts`, `schema.ts`
- Used by: CLI and bootstrap

## Data Flow

**Live trading (`start --mode sim|testnet|live`):**

1. `src/cli/commands/start.ts` loads config and calls `bootstrap()` in `src/app/bootstrap.ts`
2. SQLite opened, migrations applied, repos created
3. `createAdapter()` selects `SimBroker`, `BinanceTestnetAdapter`, or `BinanceLiveAdapter` (`src/execution/adapter-factory.ts`)
4. `RssPollerManager` polls feeds → news stored → `NewsPipeline` scores → `SignalMerger` / `RuleScorer` / optional `LlmGateway`
5. `StrategyEngine` + `MtfEngine` produce `TradeIntent` on event bus
6. `RiskEngine` converts intent to `OrderPlan` → adapter places entry + SL/TP
7. Fills and closes persisted via `TradeRepository`

**Backtest:**

1. `src/cli/commands/backtest.ts` → `src/execution/backtest-replayer.ts`
2. Replays klines from `data/klines/*.json` or cache, drives strategy without live RSS

**State Management:**
- Persistent: SQLite (`news`, `signals`, `trades`, feeds, LLM call log)
- In-memory: `KlineStore`, `PendingSignalStore`, `AppEventBus`, pause flag (`src/core/pause-flag.ts`)
- Config snapshot: loaded once per process from YAML + env

## Key Abstractions

**ExecutionAdapter:**
- Purpose: Unified order API for sim and Binance
- Examples: `src/execution/adapter.interface.ts`, `sim-broker.ts`, `binance-live.ts`, `binance-testnet.ts`
- Pattern: Factory (`src/execution/adapter-factory.ts`)

**AppEventBus:**
- Purpose: Decouple strategy, risk, execution
- Location: `src/core/event-bus.ts`
- Events: `strategy:intent`, `risk:orderPlan`, `execution:fill`, `execution:positionClosed`

**Repositories:**
- Purpose: CRUD for domain entities
- Examples: `NewsRepository`, `TradeRepository`, `SignalRepository`
- Pattern: Thin SQLite wrappers under `src/storage/repositories/`

**AppConfig (Zod):**
- Purpose: Single validated config object
- Location: `src/config/schema.ts`

## Entry Points

**CLI Entry:**
- Location: `src/cli/index.ts`
- Triggers: `crypto-trader` / `npm run dev --`
- Responsibilities: Load `.env`, register Commander commands

**Runtime Entry:**
- Location: `src/app/bootstrap.ts`
- Triggers: `start` subcommand
- Responsibilities: Full stack wiring, graceful shutdown (`src/app/shutdown.ts`)

## Error Handling

**Strategy:** Throw on fatal setup; log and continue on non-fatal runtime errors; circuit breaker for external calls

**Patterns:**
- Order placement try/catch in `bootstrap.ts` `handleOrderPlan` with logging
- `src/core/circuit-breaker.ts` for repeated failures
- `src/core/retry.ts` for transient HTTP
- Config validation fails fast via Zod in `src/config/loader.ts`

## Cross-Cutting Concerns

**Logging:**
- Pino logger — `src/core/logger.ts`, structured fields per event

**Validation:**
- Zod schemas for config and LLM JSON output
- CLI `validate` command — `src/cli/commands/validate.ts`

**Safety gates:**
- `allowLive` must be true for live mode (schema + start command)
- Symbol whitelist via `symbols` and `SymbolMapper`

---

*Architecture analysis: 2026-05-25*
*Update when major patterns change*
