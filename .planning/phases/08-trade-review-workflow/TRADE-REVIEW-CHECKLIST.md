# Trade Review Checklist

**Primary metric (PROJECT.md):** `would_take_again` = **y** on a sample of ≥20 closed trades after any config change.

## Automated columns (export)

| Column | Source |
|--------|--------|
| `id`, `source`, `mode` | Export script |
| `symbol`, `side`, `direction` | Trade record |
| `entry_price`, `exit_price`, `stop_loss`, `take_profit` | Fill / plan / report |
| `exit_reason` | `SL` or `TP` (backtest sim; empty if legacy report) |
| `pnl_usdt`, `fees_usdt` | Close event |
| `news_id`, `news_signal_id` | Intent metadata |
| `opened_at`, `closed_at` | Timestamps |

## Manual columns (you fill in)

| Column | Guidance |
|--------|----------|
| `setup_quality` | 1–5 overall entry setup |
| `news_quality` | 1–5 signal credibility |
| `mtf_aligned` | y/n — context + entry matched direction |
| `would_take_again` | **y/n — primary judgment** |
| `failure_category` | See enum below |
| `notes` | Freeform |

## failure_category enum

- `false_sentiment` — news/signal wrong
- `bad_timing` — right idea, wrong candle
- `sl_too_tight` — stopped before move
- `sl_too_wide` — loss too large vs setup
- `noise` — chop / no edge
- `gate_miss` — would have been blocked by stricter gate (compare gate-rejects export)
- `other`

## Gate context (Phase 6)

| Stage | Example `reason` |
|-------|------------------|
| `context` | `elliott_context_conflict`, `elliott_sideways_blocked` |
| `entry` | `outside_fib_zone`, `risk_reward_too_low` |

Enable `entryGates.captureRejects: true` and re-run backtest to populate `report.gateRejects` / `*-gate-rejects.csv`.

## Comparison workflow

1. Export run A and run B (same window, same `mockSentiment` flag).
2. Sort `--sort worst` and `--sort best` (limit 10–15 each).
3. Fill manual columns for overlapping symbols/news patterns.
4. Compare `would_take_again` rate and automated `winRate` from matrix.
