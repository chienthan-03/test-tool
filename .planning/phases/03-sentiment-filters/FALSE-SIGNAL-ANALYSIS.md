# False Signal Analysis (Phase 3)

**Source:** `data/reports/experiments/sentiment-phase3/discards.jsonl` (480 lines = 4 matrix runs × 120 discards each)  
**Seed:** RSS fixtures × 30 repeats, `sentiment-baseline` rules, LLM not called during seed

## Discard counts (per run; identical across presets)

| Reason | Count | Share |
|--------|------:|------:|
| `neutral_sentiment` | 240 | 50% |
| `below_min_strength` | 120 | 25% |
| `no_symbols` | 120 | 25% |

## Examples by reason

### below_min_strength (impact 2, strength 0.4)

- Bitcoin surges to new high
- Bitcoin surges to new high [seed-N]

Rule-only strength = `impactScore/5`; ETF tag yields impact 2 → 0.4 &lt; `minStrength` 0.5.

### neutral_sentiment

- Ethereum holds steady amid mixed crypto trading
- Fed and CPI in focus as FOMC holds rates; Bitcoin traders watch Powell

Macro/high-impact but `ruleSentiment === 0`; without LLM, merger drops signal.

### no_symbols

- Dogecoin rallies as DOGE whales accumulate (DOGE not in BTC/ETH whitelist)

## Emitted signals (pass filters)

`btc-strong-bull.xml` items (macro + etf tags, impact ≥ 3) → strength ≥ 0.6.  
60 signals seeded per run; backtest took **2 trades** (MTF gates limited entries).

## Recommended rule tweaks (Phase 6 — not implemented)

1. **Lower `minStrength` to 0.4** for medium-impact ETF-only headlines, or boost ETF `impact` to 3 — reduces false negatives on “Bitcoin surges” class items.
2. **Macro neutral + high priority:** keep LLM path for `high_priority_neutral_sentiment` in production; rule-only backtests understate macro items.
3. **Blacklist review:** no fixture hits; keep current list.

## Manual review instructions

Use `signals-review-sample.csv` and gates 1–3 in `.planning/phases/01-entry-baseline/01-ENTRY-PATH.md` (RSS → rule score → signal strength).

```bash
npm run seed-signals -- --config config/experiments/sentiment-baseline.yaml \
  --db data/reports/experiments/sentiment-phase3/sentiment-baseline-signals.db \
  --from 2024-10-01 --to 2024-12-31
npx tsx scripts/export-signals-review.ts --db data/reports/experiments/sentiment-phase3/sentiment-baseline-signals.db
```

Fill `would_trade` and `notes` after reviewing titles against live market context.
