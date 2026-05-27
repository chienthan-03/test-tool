# Live Trading Safety Checklist

Complete **every** item before `npm run dev -- start --mode live` with real funds.

**Tiếng Việt:** [KIEM-TRA-LIVE.md](./KIEM-TRA-LIVE.md) · **Hướng dẫn Futures:** [HUONG-DAN-FUTURES.md](./HUONG-DAN-FUTURES.md)

## 1. Config gate

- [ ] Copy or use `config/production.yaml` as `CONFIG_PATH`
- [ ] Run `npm run dev -- validate --config config/production.yaml`
- [ ] Set `allowLive: true` **only** in the config you will use for live (intentional promotion)
- [ ] Confirm `mode` on CLI is `live` (not sim/testnet)
- [ ] Review win-rate settings: `sentiment.llm.enabled`, `strategy.fibonacci.zoneTolerancePercent`, `entryGates.enabled`, `risk.cooldownAfterLoss`
- [ ] If `strategy.newsVeto.enabled`: confirm RSS feeds enabled; understand BTC leader vetoes all symbols; `llm.enabled` false for phase 1
- [ ] Confirm `strategy.triggerMode` is intentional (`news` = RSS/news pipeline; `technical` = no news, EMA-driven scans — different risk profile than news backtests)

## 2. API keys & exchange

- [ ] Mainnet Futures API key in `.env` (not testnet keys)
- [ ] Withdrawals disabled on API key (Binance key permissions)
- [ ] IP whitelist configured if you use it
- [ ] `binance.margin`: `mode`, `leverage` match your risk plan (default isolated / 5)
- [ ] Understand `risk.positionPercent` — notional per trade vs account balance

## 3. Validation path (required order)

- [ ] Backtest with production config on cached klines (`npm run parity-check` or matrix)
- [ ] Sim run observed (logs, no unexpected errors)
- [ ] Testnet run ≥ 1 week with **real** testnet keys; orders visible on testnet UI
- [ ] Export trades: `npm run export-trade-review -- --source sqlite --limit 50 --out testnet-review.csv`
- [ ] Manual review per `.planning/phases/08-trade-review-workflow/TRADE-REVIEW-CHECKLIST.md`
- [ ] Read `.planning/phases/09-mode-parity-validation/MODE-PARITY.md` — known sim/backtest/testnet differences

## 4. Operational controls

- [ ] Know how to `pause` / `resume` (`data/.paused`)
- [ ] Know Ctrl+C does **not** auto-close open positions
- [ ] Circuit breaker behavior understood (`binance.circuitBreaker`)
- [ ] Feed health: `npm run dev -- feeds`
- [ ] Status check: `npm run dev -- status --mode live`

## 5. Review cadence (ongoing)

| Cadence | Action |
|---------|--------|
| Daily (first 2 weeks) | `status`, open positions on Binance UI, feed errors in logs |
| Weekly | Export SQLite trades → CSV review; note win rate & failure categories |
| After config change | Re-run backtest matrix + parity-check before resuming live |
| After loss streak | Consider enabling `risk.cooldownAfterLoss` (Phase 7 experiments) |

## 6. Rollback

- [ ] `npm run dev -- pause` immediately if behavior is wrong
- [ ] Close positions manually on Binance if needed
- [ ] Set `allowLive: false` and restart only after root-cause review

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Operator | | | Testnet period completed |
| Reviewer | | | Sample trade CSV reviewed |

**Default policy:** `allowLive: false` in `config/default.yaml` and `config/production.yaml` until this checklist is signed.
