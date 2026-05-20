# MVP Acceptance Criteria

Copied from [spec §21](superpowers/specs/2026-05-20-crypto-news-trader-design.md). Checked when implemented and verified in this repo.

- [x] **`validate` passes with sim config** — `npm run dev -- validate` exits 0 with default YAML; `tests/unit/config-loader.test.ts` loads `config/default.yaml`; `tests/integration/validate-dry-poll.test.ts` exercises validate dry-poll path.

- [x] **RSS feeds poll and dedupe; symbols not in whitelist ignored** — `tests/integration/rss-pipeline.test.ts`: fixture poll creates signals for whitelisted symbols; `doge-only.xml` yields zero signals when DOGE not in `symbols`.

- [x] **Rules emit signals; LLM called only per gate rules** — `tests/unit/rule-scorer.test.ts`, `tests/integration/news-llm-pipeline.test.ts` (`uses LLM for ambiguous macro headline`): LLM `fetch` invoked once for macro ambiguous item above `thresholdLLM`; strong rule-only items stay on rules.

- [x] **OpenRouter disabled → bot runs rule-only** — `tests/integration/news-llm-pipeline.test.ts` (`runs rule-only when llm is disabled`): `sentiment.llm.enabled: false`, signal `source: 'rule'`, LLM fetch not called.

- [x] **`start --mode sim` places virtual trades with ATR SL/TP** — `SimBroker` + `RiskEngine` (`calcSlTp` ATR multipliers): `tests/unit/sim-broker.test.ts`, `tests/integration/strategy-sim.test.ts` (intent → `risk:orderPlan` with SL/TP); sim bootstrap wired in `src/app/bootstrap.ts`.

- [x] **`start --mode testnet` places real testnet orders with SL/TP** — `BinanceTestnetAdapter` extends signed futures client: `tests/unit/binance-testnet.test.ts` mocks MARKET entry + `STOP_MARKET` / `TAKE_PROFIT_MARKET` order IDs; manual run documented in README with testnet keys.

- [x] **`start --mode live` works with explicit config flag `allowLive: true` safety** — `src/config/loader.ts` + `bootstrapLive` refuse live without `allowLive: true`; `tests/unit/binance-live.test.ts` covers live adapter + circuit breaker; startup logs `LIVE TRADING ENABLED - real funds at risk`.

- [x] **`backtest --from --to` produces JSON report** — CLI prints JSON summary (`src/cli/commands/backtest.ts`); `tests/integration/backtest-smoke.test.ts` writes report under `backtest.reportDir` and asserts trade stats.

- [x] **`status` shows feeds, balance, positions** — `src/cli/commands/status.ts` aggregates adapter balance/positions, feed repo, recent signals; `tests/unit/cli-feeds.test.ts` for feed listing helper.

- [x] **SIGINT graceful shutdown without closing positions** — `src/app/shutdown.ts`: stops RSS/market, logs open positions, warns no auto-close, `disconnect` + `db.close`, exit 0; registered from bootstrap on `start`.

- [x] **Unit tests ≥ 80% coverage on sentiment + risk math modules** — `npm run test:coverage` with `vitest.config.ts` thresholds on `src/sentiment/**` and `src/risk/**` (lines/functions 80%, branches 75%); see README / latest CI run for report numbers.

---

*Last verified: Phase 9 documentation pass.*
