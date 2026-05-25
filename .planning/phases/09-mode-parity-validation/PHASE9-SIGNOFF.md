# Phase 9 Sign-Off — Ready Beyond Testnet?

**Date:** 2026-05-25  
**Verdict:** Ready for **testnet validation with human review**; **not** ready for unsupervised live.

## Criteria

| Criterion | Status |
|-----------|--------|
| Backtest replay deterministic | Pass |
| Strategy/risk/cooldown shared wiring | Pass (`paper-trading-stack`) |
| Testnet adapter connects (mocked CI) | Pass |
| Production config validated (Phases 6–7) | Pass |
| Trade review workflow (Phase 8) | Pass |
| Live `allowLive` + keys + manual review | Operator checklist (Phase 10) |

## Before live

1. Run testnet with real keys for ≥1 week; export SQLite trades via `export-trade-review`.
2. Compare testnet `would_take_again` sample to backtest expectations.
3. Complete Phase 10 live safety checklist.
4. Keep `allowLive: false` until explicit promotion.

## Not in scope Phase 9

- Full sim-vs-backtest numeric parity on live WS feed
- Automated testnet order placement in CI
