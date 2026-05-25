# Crypto News Auto-Trader — Win Rate Improvement

## What This Is

A Node.js CLI bot that trades Binance USDⓈ-M Futures from crypto RSS news sentiment, technical MTF strategy (Elliott/Fib), and risk-managed execution in `sim`, `backtest`, `testnet`, and `live` modes. This planning cycle focuses on **raising per-entry win rate** without abandoning the existing pipeline—by researching filters, measuring outcomes via manual trade review, and expanding to additional liquid symbols (e.g. SOL, BNB, XRP) on the same exchange.

## Core Value

**Every taken entry should have a demonstrably stronger setup**—validated through research, backtest comparison, and human review of trades in SQLite/logs—before changes ship to all execution modes.

## Requirements

### Validated

- ✓ **Entry quality gates (Phase 6, 2026-05-25):** `EntryGate` MTF veto layer; production `config/default.yaml` — rule-only sentiment (`llm.enabled: false`), tighter fib (`zoneTolerancePercent: 0.02`), 5-symbol universe; mock validation 47 trades / 25.5% win vs pre-research 50 / 24.0%
- ✓ **Risk & exit tuning (Phase 7, 2026-05-25):** `SymbolCooldownTracker` + `risk.cooldownAfterLoss` (default off); risk matrix validated Phase 6 exits as baseline; `analyze-backtest-losses` CLI
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
- [ ] **Filter experiments:** Cooldown / risk experiments via backtest matrix (Phase 7+)
- [ ] **Higher-quality entries:** Further tuning after Phase 7 risk/cooldown research
- [ ] **Trade review workflow (Phase 8):** Export and structured fields for manual review
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
| Sentiment preset (Phase 3) | `llm.enabled: false` in `default.yaml` | Merged Phase 6 | ✓ |
| MTF preset (Phase 4) | `zoneTolerancePercent: 0.02` | Merged Phase 6; 5-sym validation 25.5% win | ✓ |
| Symbol universe (Phase 5) | 5 symbols in `default.yaml` | Production default | ✓ |
| Phase 6 production config | `config/default.yaml` | EntryGate + merged presets | ✓ |
| Phase 7 risk | Cooldown optional; Fib exits unchanged | Baseline wins win-rate goal on mock matrix | ✓ |

---
*Last updated: 2026-05-25 after Phase 7 execution*
