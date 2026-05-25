# MTF Experiment Grid

**Matrix:** `config/experiments/mtf-matrix.yaml`  
**Window:** 2024-10-01 → 2024-12-31  
**mockSentiment:** `true`  
**Output:** `data/reports/experiments/mtf-phase4/`

## Runs

| runId | Config | Hypothesis |
|-------|--------|------------|
| mtf-baseline | `mtf-baseline.yaml` | H1 |
| mtf-tighter-fib | `mtf-tighter-fib.yaml` | H2 |
| mtf-require-impulse | `mtf-require-impulse.yaml` | H3 |
| mtf-higher-min-atr | `mtf-higher-min-atr.yaml` | H4 |
| mtf-no-wait-candle | `mtf-no-wait-candle.yaml` | H5 |
| mtf-stricter-swing | `mtf-stricter-swing.yaml` | H6 |

## Acceptance

| Metric | Rule |
|--------|------|
| `totalTrades` | Flag if &lt; 12 (&lt; 50% of baseline 25) — over-filtered |
| `winRate` | Primary screen vs baseline 0.32 |
| `totalPnlUsdt` | Secondary |

## Timeframe matrix

**File:** `config/experiments/mtf-matrix-timeframes.yaml`  
**Output:** `data/reports/experiments/mtf-phase4-timeframes/`
