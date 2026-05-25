# Crypto News Auto-Trader — Win Rate Improvement

## What This Is

A Node.js CLI bot that trades Binance USDⓈ-M Futures from crypto RSS news sentiment, technical MTF strategy (Elliott/Fib), and risk-managed execution in `sim`, `backtest`, `testnet`, and `live` modes. This planning cycle focuses on **raising per-entry win rate** without abandoning the existing pipeline—by researching filters, measuring outcomes via manual trade review, and expanding to additional liquid symbols (e.g. SOL, BNB, XRP) on the same exchange.

## Core Value

**Every taken entry should have a demonstrably stronger setup**—validated through research, backtest comparison, and human review of trades in SQLite/logs—before changes ship to all execution modes.

## Requirements

### Validated

- ✓ RSS ingest, dedupe, and SQLite persistence — existing (`src/news/`, `src/storage/repositories/news-repo.ts`)
- ✓ Rule-based sentiment scoring with optional OpenRouter LLM — existing (`src/sentiment/rule-scorer.ts`, `llm-gateway.ts`)
- ✓ Symbol whitelist mapping from news — existing (`src/news/symbol-mapper.ts`)
- ✓ MTF strategy (context + entry timeframes) with Elliott/Fib/swing — existing (`src/strategy/`, `src/market/`)
- ✓ Risk engine: position %, ATR-based SL/TP — existing (`src/risk/`)
- ✓ Execution adapters: sim, testnet, live — existing (`src/execution/adapter-factory.ts`)
- ✓ CLI: start, backtest, validate, feeds, pause/resume, status — existing (`src/cli/`)
- ✓ Margin mode/leverage configuration — existing (`src/execution/margin-settings.ts`, `config/default.yaml`)
- ✓ Config validation via Zod — existing (`src/config/schema.ts`)

### Active

- [ ] **Research phase:** Document current entry path and baseline metrics (win rate, trade count) per mode using backtest + DB trade export
- [ ] **Filter experiments:** Compare MTF alignment rules and cooldown/position limits via backtest matrix (sentiment grid done — see `.planning/phases/03-sentiment-filters/`)
- [x] **Sentiment filter research (Phase 3):** Fixture matrix + recommendation → `config/experiments/sentiment-recommended.yaml` (`llm.enabled: false` pending Phase 6 merge)
- [ ] **Higher-quality entries:** Implement winning filter set(s) in code/config with clear rationale tied to research findings
- [ ] **Symbol expansion:** Add top alts (SOLUSDT, BNBUSDT, XRPUSDT) to whitelist, RSS mapping, and kline coverage—same Binance Futures stack
- [ ] **Review workflow:** Make manual trade review practical (structured logs/DB fields or export) to judge “win rate improved”
- [ ] **Parity across modes:** Logic changes must behave consistently in sim, backtest replay, and testnet

### Out of Scope

- Web UI or dashboard — operator uses CLI, logs, and SQLite
- New exchanges or spot markets — Binance USDⓈ-M Futures only
- Custom ML model training — may use existing LLM gateway, not new models
- Guaranteed live profitability — research and testnet/sim proof first

## Context

**Brownfield baseline** (see `.planning/codebase/`):

- Event-driven monolith: RSS → sentiment → strategy → risk → execution (`ARCHITECTURE.md`)
- Default symbols BTC/ETH; timeframes context `1d` / entry `4h` in `config/default.yaml`
- Pain point on entries not yet quantified—user will discover via research and manual review
- User wants **combo** levers (sentiment + timing + risk), **all equally important** for prioritization
- User may add coins without mandating fewer trades overall—expansion to top alts is in scope
- Concerns: narrow Vitest coverage on execution/market, `allowLive: true` in config (`CONCERNS.md`)

## Constraints

- **Stack:** Stay on Node.js 20+, TypeScript, existing module layout — no framework rewrite
- **Exchange:** Binance Futures only; API keys via `.env`
- **Success metric:** Manual review of trades (not a single automated KPI gate in v1)
- **Execution modes:** Changes must be testable in sim, `backtest`, and testnet before live consideration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Research-first before code changes | Entry pain unknown; avoid guessing thresholds | — Pending |
| Expand to SOL/BNB/XRP (top alts) | User request; more opportunities without new exchange | — Pending |
| Manual trade review as primary metric | User-selected; aligns with operational validation | — Pending |
| No UI / no new exchange / no ML training | Explicit v1 boundaries | — Pending |
| GSD workflow: YOLO + comprehensive depth + parallel execution | User preference for planning/execution style | — Pending |
| Sentiment preset (Phase 3) | `sentiment-no-llm` / `sentiment-recommended.yaml` | Matrix + discard analysis; identical metrics on fixtures | — Pending validation in Phase 6 |

---
*Last updated: 2026-05-25 after Phase 3 execution*
