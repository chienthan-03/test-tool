# Symbol Universe Backtest Comparison

**Matrix:** `config/experiments/symbols-matrix.yaml`  
**Window:** 2024-10-01 → 2024-12-31 · **mockSentiment:** true  
**Strategy:** Phase 4 `mtf-recommended` (`zoneTolerancePercent: 0.02`)

## Results

| runId | Symbols | totalTrades | winRate | totalPnlUsdt | maxDrawdownPct |
|-------|---------|------------:|--------:|-------------:|---------------:|
| symbols-btc-eth | 2 | 22 | 36.4% | +358.30 | 1.69% |
| symbols-expanded | 5 | 47 | 25.5% | -258.95 | 5.73% |

## Interpretation

- **Trade count** scales with symbol count under mock sentiment (6h alternating signals **per symbol**). Expanded universe ≈ 2×+ trades vs 2-symbol control — expected.
- **Win rate** drops from 36.4% → 25.5% on expanded set — alts add losing entries in this window; not a reason to revert expansion.
- **Per-symbol rate:** ~11 trades/symbol (2 sym) vs ~9.4 trades/symbol (5 sym) — MTF gates still limit entries.

## References

| Baseline | Trades | winRate | Notes |
|----------|-------:|--------:|-------|
| Phase 1 mock | 25 | 32% | 2 symbols, default strategy (not tighter fib) |
| Phase 4 `mtf-tighter-fib` | 22 | 36.4% | 2 symbols — matches `symbols-btc-eth` |

## Recommendation

**Proceed with 5-symbol default** for Phase 6 combined validation. Monitor per-symbol PnL in future reports; consider `symbolOverrides` for risk if alts need smaller size.

## Caveat

Do not compare expanded **totalTrades** to Phase 1 (25) without noting strategy preset differs (tighter fib on btc-eth run).
