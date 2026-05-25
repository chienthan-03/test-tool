# Technology Stack

**Analysis Date:** 2026-05-25

## Languages

**Primary:**
- TypeScript 6.x — All application code under `src/`, `tests/`, `scripts/`

**Secondary:**
- YAML — Runtime config (`config/default.yaml`)
- SQL — SQLite schema via migrations in `src/storage/migrate.ts`

## Runtime

**Environment:**
- Node.js ≥ 20 (`package.json` `engines.node`)
- ESM modules (`"type": "module"` in `package.json`)

**Package Manager:**
- npm (lockfile: `package-lock.json`)

## Frameworks

**Core:**
- Commander 14.x — CLI framework (`src/cli/index.ts`, `src/cli/commands/*.ts`)
- Zod 4.x — Config validation (`src/config/schema.ts`)

**Testing:**
- Vitest 3.x — Unit and integration tests (`vitest.config.ts`, `tests/**/*.test.ts`)
- @vitest/coverage-v8 — Coverage for `src/sentiment/**` and `src/risk/**`

**Build/Dev:**
- TypeScript 6.x — Compile to `dist/` (`tsconfig.json`, `npm run build`)
- tsx 4.x — Dev execution without build (`npm run dev`)

## Key Dependencies

**Critical:**
- `better-sqlite3` — Local persistence for news, signals, trades (`src/storage/db.ts`)
- `rss-parser` — RSS feed polling (`src/news/rss-poller.ts`)
- `undici` — HTTP client for Binance REST and OpenRouter (`src/market/binance-rest.ts`, `src/sentiment/llm-gateway.ts`)
- `ws` — Binance futures WebSocket klines (`src/market/binance-ws.ts`)
- `pino` / `pino-pretty` — Structured logging (`src/core/logger.ts`)
- `yaml` — Load `config/default.yaml` (`src/config/loader.ts`)
- `dotenv` — `.env` loading (`src/config/load-env.ts`)

**Infrastructure:**
- `commander` — CLI routing
- `zod` — Schema for `AppConfig` and LLM JSON output

## Configuration

**Environment:**
- `.env` via `dotenv` — `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `OPENROUTER_API_KEY`, `CONFIG_PATH`, `SQLITE_PATH`, `LOG_LEVEL` (see `.env.example`, `README.md`)
- `config/default.yaml` — Trading mode, symbols, feeds, sentiment rules, risk, margin (`src/config/loader.ts`)

**Build:**
- `tsconfig.json` — TypeScript compile options
- `vitest.config.ts` — Test include paths and coverage thresholds

## Platform Requirements

**Development:**
- Windows / macOS / Linux with Node 20+
- Optional: Binance Futures testnet keys for `testnet` mode
- Optional: OpenRouter key when `sentiment.llm.enabled: true`

**Production:**
- Long-running Node process (`crypto-trader start`)
- Outbound HTTPS to Binance Futures API/WebSocket and RSS URLs
- Local SQLite file (default `./data/trader.db`)

---

*Stack analysis: 2026-05-25*
*Update after major dependency changes*
