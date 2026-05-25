# Baseline Metrics Schema

**Date:** 2026-05-25

## Primary success metric (project)

**Manual review:** On a sample of ≥20 closed trades, track `would_take_again` (y/n). Improvement goal = higher rate vs baseline sample after filter changes. Automated `winRate` alone is not sufficient per `PROJECT.md`.

## Automated metrics (backtest CLI)

From `src/cli/commands/backtest.ts` JSON output:

| Field | Meaning |
|-------|---------|
| `totalTrades` | Closed round-trips in range |
| `wins` | PnL > 0 |
| `losses` | PnL ≤ 0 |
| `winRate` | wins / totalTrades (0–1) |
| `totalPnlUsdt` | Sum PnL |
| `maxDrawdownPct` | Peak-to-trough on equity curve |

## Baseline snapshot JSON format

```json
{
  "config_path": "config/default.yaml",
  "from": "2024-10-01",
  "to": "2024-12-31",
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "recorded_at": "2026-05-25T12:00:00.000Z",
  "runs": [
    {
      "label": "mock_sentiment",
      "mock_sentiment": true,
      "metrics": { "totalTrades": 0, "wins": 0, "losses": 0, "winRate": 0, "totalPnlUsdt": 0, "maxDrawdownPct": 0 }
    }
  ]
}
```

## Per-trade fields (`trades` table)

| Column | Source |
|--------|--------|
| `id` | Trade UUID |
| `mode` | sim / testnet / live / backtest |
| `symbol` | e.g. BTCUSDT |
| `side` | BUY / SELL |
| `quantity` | Position size |
| `entry_price` | Fill price |
| `exit_price` | Close price |
| `stop_loss` | Planned SL |
| `take_profit` | Planned TP |
| `pnl_usdt` | Realized PnL |
| `fees_usdt` | Fees if set |
| `news_id` | Link to news item |
| `news_signal_id` | Link to signal |
| `status` | open / closed |
| `opened_at` | ISO timestamp |
| `closed_at` | ISO timestamp |

## Manual review columns (CSV only)

| Column | Type | Purpose |
|--------|------|---------|
| `setup_quality` | 1–5 | Overall entry setup |
| `news_quality` | 1–5 | Was news signal credible |
| `mtf_aligned` | y/n | Context + entry aligned with direction |
| `would_take_again` | y/n | **Primary human judgment** |
| `failure_category` | enum | `false_sentiment`, `bad_timing`, `sl_too_tight`, `sl_too_wide`, `noise`, `other` |
| `notes` | text | Freeform |

See `review-template.csv` for header row.
