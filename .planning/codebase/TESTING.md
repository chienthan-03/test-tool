# Testing

**Analysis Date:** 2026-05-25

## Framework

**Runner:** Vitest 3.x (`vitest.config.ts`)

**Environment:** Node (`environment: 'node'`)

**Execution:**
- `npm test` — single run
- `npm run test:watch` — watch mode
- `npm run test:coverage` — coverage report

## Test Structure

**Unit tests:** `tests/unit/*.test.ts`
- Mirror `src/` modules: `rule-scorer.test.ts`, `mtf-engine.test.ts`, `binance-futures.test.ts`, `margin-settings.test.ts`, etc.
- Mock HTTP/WS where needed (`binance-rest.test.ts`, `llm-gateway.test.ts`)

**Integration tests:** `tests/integration/*.test.ts`
- `rss-pipeline.test.ts` — RSS → storage flow
- `news-llm-pipeline.test.ts` — sentiment + optional LLM
- `strategy-sim.test.ts` — strategy with sim broker
- `backtest-smoke.test.ts` — backtest CLI smoke
- `validate-dry-poll.test.ts` — validate command

**Fixtures:** `tests/fixtures/`
- `rss/*.xml` — sample feed items
- `klines/*.json` — candle data for store/backtest tests
- `llm/valid-bullish.json` — LLM response shape

## Coverage

**Configured in** `vitest.config.ts`:
- Include: `src/sentiment/**`, `src/risk/**` only
- Thresholds: 80% lines/functions, 75% branches

**Gap:** Most of `src/execution/`, `src/market/`, `src/app/` rely on unit tests without coverage gates

## Testing Practices

**Patterns:**
- Vitest `describe` / `it` / `expect`
- In-memory or temp SQLite for repo tests
- Fixture-driven RSS and kline data
- Signed request tests for Binance HMAC (`binance-sign.test.ts`)

**What is not present:**
- No Playwright/E2E
- No dedicated testnet integration suite in CI (live keys required for some paths)
- No `.github/workflows` test automation detected in codebase map scope

## Running Tests

```bash
npm test
npm run test:coverage
```

**Prerequisites:** `npm install`; no `.env` required for most unit tests

## Where to Add Tests

| Change type | Location |
|-------------|----------|
| New pure function | `tests/unit/<module>.test.ts` |
| Multi-module flow | `tests/integration/<feature>.test.ts` |
| RSS/LLM/kline samples | `tests/fixtures/` |

---

*Testing analysis: 2026-05-25*
