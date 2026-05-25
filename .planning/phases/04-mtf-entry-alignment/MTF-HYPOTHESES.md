# MTF Hypotheses (Phase 4)

**Protocol:** `mockSentiment: true` — isolate strategy/MTF from RSS (see `EXPERIMENT-PROTOCOL.md`).  
**Baseline:** Phase 1 — 25 trades, 32% winRate, Oct–Dec 2024.

| ID | runId | Variable | Hypothesis | Over-filter risk |
|----|-------|----------|------------|------------------|
| H1 | mtf-baseline | default | Reference equal to Phase 1 mock baseline | — |
| H2 | mtf-tighter-fib | `zoneTolerancePercent: 0.02` | Narrower Fib zone → fewer but higher-quality entries | High |
| H3 | mtf-require-impulse | `contextRequireImpulse: true` | Block sideways context; only impulse-aligned trends | High |
| H4 | mtf-higher-min-atr | `minAtrPercent: 0.18` | Skip low-vol chop | Medium |
| H5 | mtf-no-wait-candle | `waitForNextCandleClose: false` | Enter same bar as signal → more trades, more noise | Low (more trades) |
| H6 | mtf-stricter-swing | `minSwingCount: 7` | Richer swing structure before context/entry | High |

## Timeframe appendix (04-04)

| ID | runId | Pair | Hypothesis |
|----|-------|------|------------|
| T1 | mtf-baseline-1d-4h | 1d / 4h | Default (H1) |
| T2 | mtf-tf-4h-1h | 4h / 1h | Faster context + entry |
| T3 | mtf-tf-1d-1h | 1d / 1h | Slow context, fast entry |

## Not in primary matrix

- Real fixture signals + `sentiment-recommended` — Phase 3 showed 2 trades; use Phase 6 combined validation.
- Risk/position sizing — out of scope for Phase 4.
