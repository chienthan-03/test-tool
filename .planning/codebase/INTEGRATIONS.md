# Integrations

**Analysis Date:** 2026-05-25

## External APIs

**Binance USDⓈ-M Futures**
- REST: klines, exchange info, signed orders — `src/market/binance-rest.ts`, `src/execution/binance-futures.ts`
- WebSocket: kline streams — `src/market/binance-ws.ts`, `src/market/binance-market.ts`
- Modes: mainnet (`src/execution/binance-live.ts`) and testnet (`src/execution/binance-testnet.ts`)
- Base URLs configured in `config/default.yaml` under `binance` (see `src/config/schema.ts`)
- Auth: `BINANCE_API_KEY`, `BINANCE_API_SECRET` via `.env` (`src/execution/adapter-factory.ts`)

**OpenRouter (optional LLM)**
- Chat completions for news sentiment when rule score exceeds threshold — `src/sentiment/llm-gateway.ts`
- Schema-validated JSON — `src/sentiment/llm-schema.ts`, prompts in `src/sentiment/llm-prompts.ts`
- Env: `OPENROUTER_API_KEY` (`src/cli/commands/validate.ts`)
- Rate limits tracked in SQLite — `src/storage/repositories/llm-repo.ts`

## RSS News Feeds

**CoinDesk, CoinTelegraph (configurable)**
- Poll intervals in `config/default.yaml` `feeds`
- Poller: `src/news/rss-poller.ts`, manager: `src/news/rss-poller-manager.ts`
- Normalization: `src/news/normalizer.ts`
- Dedupe: `src/news/dedupe.ts`
- Symbol mapping whitelist: `src/news/symbol-mapper.ts`

## Databases

**SQLite (local)**
- Driver: `better-sqlite3` — `src/storage/db.ts`
- Migrations: `src/storage/migrate.ts`
- Repositories: `src/storage/repositories/news-repo.ts`, `feed-repo.ts`, `signal-repo.ts`, `trade-repo.ts`, `llm-repo.ts`
- Default path: `SQLITE_PATH` env or `./data/trader.db`

## Authentication

**Binance**
- HMAC-SHA256 signing — `src/execution/binance-sign.ts`
- Keys required for `testnet` and `live`; not for `sim`

**OpenRouter**
- Bearer token from `OPENROUTER_API_KEY`; optional — rule-only path when disabled or key missing

## Webhooks / Streaming

- Binance combined stream WebSocket for multi-symbol klines (`src/market/binance-market.ts`)
- Internal event bus for decoupling — `src/core/event-bus.ts` (not external)

## Third-Party Tools

- **CodeGraph** — Optional MCP index (`.codegraph/`, `.cursor/rules/codegraph.mdc`); not runtime dependency of trader

## Configuration Files

| Integration | Config location |
|-------------|-----------------|
| Binance URLs, symbols, risk | `config/default.yaml` |
| Secrets | `.env` |
| Per-symbol overrides | `config/default.yaml` `symbolOverrides` |

---

*Integrations analysis: 2026-05-25*
