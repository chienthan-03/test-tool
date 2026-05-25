# Codebase Structure

**Analysis Date:** 2026-05-25

## Directory Layout

```
tool-test/
├── config/                 # YAML defaults
├── data/                   # SQLite DB, kline JSON fixtures
├── docs/                   # Design specs, superpowers plans
├── scripts/                # Benchmarks and utilities
├── src/
│   ├── app/                # Bootstrap, runtime, shutdown
│   ├── cli/                # Commander entry + commands
│   ├── config/             # Env, loader, Zod schema
│   ├── core/               # Types, logger, event bus, utilities
│   ├── execution/          # Adapters, Binance, sim, backtest
│   ├── market/             # Klines, indicators, WS/REST
│   ├── news/               # RSS poll, dedupe, symbol map
│   ├── risk/               # Sizing, SL/TP, risk engine
│   ├── sentiment/          # Rules, LLM, pipeline, merger
│   ├── storage/            # DB, migrate, repositories
│   └── strategy/           # MTF, Elliott, pending signals
├── tests/
│   ├── unit/               # Isolated module tests
│   ├── integration/        # Multi-module flows
│   └── fixtures/           # RSS XML, klines, LLM JSON
├── .codegraph/             # CodeGraph index (optional)
├── .cursor/                # Cursor rules
└── .planning/              # GSD planning artifacts (this map)
```

## Directory Purposes

**`src/cli/`:**
- Purpose: User-facing commands
- Contains: `index.ts`, `commands/start.ts`, `backtest.ts`, `feeds.ts`, `validate.ts`, `status.ts`, `pause.ts`, `resume.ts`
- Helpers: `news-stack.ts`, `backtest-dates.ts`

**`src/app/`:**
- Purpose: Process lifecycle and dependency wiring
- Key files: `bootstrap.ts`, `runtime-context.ts`, `shutdown.ts`

**`src/execution/`:**
- Purpose: Order execution and backtest replay
- Key files: `adapter-factory.ts`, `sim-broker.ts`, `binance-futures.ts`, `margin-settings.ts`, `backtest-replayer.ts`

**`src/market/`:**
- Purpose: Market data and technical analysis
- Key files: `binance-market.ts`, `kline-store.ts`, `indicators.ts`, `elliott-wave.ts`, `fibonacci.ts`, `swing-detector.ts`

**`src/sentiment/` + `src/news/`:**
- Purpose: News ingestion and signal generation
- Key files: `news-pipeline.ts`, `rule-scorer.ts`, `llm-gateway.ts`, `rss-poller.ts`

**`src/strategy/` + `src/risk/`:**
- Purpose: Trade intents and position plans
- Key files: `strategy-engine.ts`, `mtf-engine.ts`, `risk-engine.ts`, `position-sizer.ts`

**`src/storage/`:**
- Purpose: SQLite access
- Key files: `db.ts`, `migrate.ts`, `repositories/*.ts`

**`tests/`:**
- Purpose: Vitest suites mirroring `src/` domains
- Fixtures: `tests/fixtures/rss/`, `tests/fixtures/klines/`, `tests/fixtures/llm/`

## Key File Locations

**Entry Points:**
- `src/cli/index.ts` — CLI entry
- `src/app/bootstrap.ts` — Trading runtime entry

**Configuration:**
- `config/default.yaml` — Main app config
- `src/config/schema.ts` — Zod schema
- `src/config/loader.ts` — Load + merge env
- `.env.example` — Secret template
- `tsconfig.json`, `vitest.config.ts`

**Core Logic:**
- `src/sentiment/news-pipeline.ts` — News → signal orchestration
- `src/strategy/strategy-engine.ts` — Intent generation
- `src/risk/risk-engine.ts` — Intent → order plan
- `src/execution/adapter-factory.ts` — Mode-specific broker

**Documentation:**
- `README.md` — User-facing setup and commands
- `docs/superpowers/specs/` — Feature design docs

## Naming Conventions

**Files:**
- kebab-case TypeScript modules: `binance-futures-adapter.ts`, `rule-scorer.ts`
- `*.test.ts` in `tests/unit/` and `tests/integration/`
- Command files match CLI name: `start.ts`, `backtest.ts`

**Directories:**
- Singular domain folders under `src/`: `core`, `market`, `risk`
- Plural `repositories/` under `storage/`

**Special Patterns:**
- ESM imports use `.js` extension in TypeScript source
- Repositories suffixed `-repo.ts`

## Where to Add New Code

**New CLI command:**
- Register in `src/cli/index.ts`
- Implement `src/cli/commands/<name>.ts`

**New exchange or execution mode:**
- Adapter in `src/execution/`
- Register in `src/execution/adapter-factory.ts`
- Types in `src/execution/adapter.interface.ts`

**New sentiment rule or feed behavior:**
- Rules: `src/sentiment/rule-scorer.ts`, config `sentiment.rules` in YAML
- Feed: extend `src/news/rss-poller.ts` or config `feeds`

**New strategy logic:**
- `src/strategy/` and `src/market/` indicators
- Wire in `src/strategy/strategy-engine.ts`

**Tests:**
- Unit: `tests/unit/<module>.test.ts`
- Integration: `tests/integration/`
- Fixtures: `tests/fixtures/`

---

*Structure analysis: 2026-05-25*
