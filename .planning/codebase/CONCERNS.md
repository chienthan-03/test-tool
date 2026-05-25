# Concerns

**Analysis Date:** 2026-05-25

## Technical Debt

**Coverage scope narrow:**
- Vitest coverage gates only `src/sentiment/**` and `src/risk/**` (`vitest.config.ts`)
- Execution, market, and bootstrap paths have tests but no coverage thresholds

**Live trading safety:**
- `config/default.yaml` has `allowLive: true` — live mode enabled at config level; relies on operator discipline and `start` checks
- Review before production deploy

**In-memory coordination:**
- `pendingPlans` and `intentMeta` Maps in `src/app/bootstrap.ts` — process-local only; restart loses in-flight linkage

## Known Issues / Risks

**External dependency failures:**
- RSS poll failures, Binance rate limits, WS disconnects — mitigated partially by `src/core/circuit-breaker.ts` and WS reconnect config in `binance-market.ts`
- LLM optional; pipeline degrades to rules when disabled or key missing

**Secret handling:**
- API keys only via `.env`; ensure `.env` not committed (`.env.example` present)
- Validate command warns when `OPENROUTER_API_KEY` unset (`src/cli/commands/validate.ts`)

**No TODO/FIXME in `src/`:**
- Grep found no `TODO`/`FIXME` markers in source (clean for debt tracking)

## Security

**Strengths:**
- Zod validation on config and LLM responses
- Signed Binance requests (`src/execution/binance-sign.ts`)
- Symbol whitelist (`src/news/symbol-mapper.ts`, config `symbols`)
- `allowLive` gate for mainnet

**Watch:**
- Live keys on developer machine — use testnet for development
- RSS URLs are third-party — supply chain / malicious content in feeds (mitigated by rule scoring, not full sanitization)

## Performance

**Long-running process:**
- Multiple RSS pollers + WS streams per symbol/timeframe
- SQLite synchronous writes on news/trade events — acceptable for solo bot scale

**Kline data:**
- JSON fixtures under `data/klines/` can be large (e.g. `BTCUSDT_1d.json`)
- `src/market/kline-cache.ts` caches REST fetches

## Documentation Gaps

**Strong:**
- `README.md`, design spec `docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md`
- Recent margin config spec/plan in `docs/superpowers/`

**Could improve:**
- No `CONTRIBUTING.md` or architecture diagram in repo root
- CodeGraph optional — not required for runtime

## Missing Tests (relative risk)

| Area | Risk | Files |
|------|------|-------|
| Full bootstrap E2E | Medium | `src/app/bootstrap.ts` |
| Live/testnet order placement | High if used | `binance-live.ts`, `binance-testnet.ts` |
| WS reconnection edge cases | Medium | `src/market/binance-ws.ts` |

Overall codebase is structured and tested for a v0.1 trading bot; main operational risk is **live trading configuration and external API reliability**, not structural chaos.

---

*Concerns analysis: 2026-05-25*
