# Symbol Configuration (Phase 5)

## Before / after

| | Symbols |
|---|---------|
| **Before** | BTCUSDT, ETHUSDT |
| **After** | BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT |

## Files updated

- `config/default.yaml` — production whitelist
- `config/experiments/symbols-expanded.yaml` — 5-symbol + Phase 4 MTF preset
- `config/experiments/symbols-btc-eth-only.yaml` — 2-symbol control for comparison
- `src/execution/exchange-info.ts` — `DEFAULT_FILTERS` for backtest/sim when REST cache cold

## Downstream consumers

| Module | Behavior |
|--------|----------|
| `SymbolMapper` | Only emits signals for whitelisted tickers |
| `SignalMerger` | Filters `news.symbols` to whitelist |
| `BacktestReplayer` | Mock signals per symbol; klines per symbol×TF |
| `BinanceMarket` | WS kline streams per `config.symbols` |
| `RiskEngine` | `getDefaultFilters` / `getSymbolFilters` per symbol |
| `margin-settings` | Optional `symbolOverrides` per symbol |

## Experiment presets

Other `config/experiments/*.yaml` still list 2 symbols unless re-run for 5-symbol studies. Use `symbols-expanded.yaml` or copy the `symbols:` block from `default.yaml`.
