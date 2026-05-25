# LLM On/Off Comparison (Phase 3)

## Setup

| Item | Value |
|------|--------|
| Configs | `sentiment-llm-on.yaml` vs `sentiment-no-llm.yaml` |
| Matrix | `config/experiments/sentiment-matrix-llm.yaml` |
| Fixtures | `tests/fixtures/rss/*.xml` + `btc-strong-bull.xml` |
| Window | 2024-10-01 → 2024-12-31 |
| `OPENROUTER_API_KEY` | **Not set** in execution environment |

## Execution status

**Skipped live LLM matrix run** — no API key. Fixture seed script does not call `LlmGateway` (rule-only path for reproducibility). `thresholdLLM` likewise has no effect during seed.

## Metrics (main sentiment matrix, rule-only seed)

| Preset | totalTrades | winRate | totalPnlUsdt |
|--------|------------:|--------:|-------------:|
| sentiment-baseline (LLM enabled in YAML) | 2 | 0% | -50.40 |
| sentiment-no-llm | 2 | 0% | -50.40 |

Identical — expected under fixture replay without LLM calls.

## Recommendation

**Do not enable LLM for production by default until:**

1. `OPENROUTER_API_KEY` is available in the runtime environment, and  
2. A follow-up matrix seeds/runs with **live RSS or LLM-aware seed** so macro-neutral items can resolve.

**Interim default:** `sentiment-no-llm` / `sentiment-recommended.yaml` — rule-only, reproducible backtests, no API cost.

Re-evaluate in Phase 6 after optional `seed-signals` LLM path or sim poll populates real neutral macro items.
