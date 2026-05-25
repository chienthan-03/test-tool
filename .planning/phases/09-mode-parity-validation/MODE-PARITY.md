# Mode Parity — Known Differences

## Shared stack (Phase 9)

`src/app/paper-trading-stack.ts` wires the same components for **backtest replay**:

- `StrategyEngine` + `EntryGate` + `SymbolCooldownTracker`
- `RiskEngine` + `SimBroker` execution handlers
- `wireSimPaperExecution` collects trades, equity, gate rejects

`bootstrap.ts` (sim / testnet / live) uses the same strategy/risk/cooldown pattern; differences are below.

## Mode comparison

| Aspect | Backtest | Sim | Testnet / Live |
|--------|----------|-----|----------------|
| Market data | Cached klines replay | Live WS + kline store | Live WS |
| Clock | Simulated (`simNow` per candle) | Wall clock | Wall clock |
| Execution | `SimBroker` | `SimBroker` | `BinanceFuturesAdapter` |
| Symbol filters | `getDefaultFilters` | `getSymbolFilters` (REST) | REST exchangeInfo |
| Trade persistence | `report.json` only | SQLite `trades` | SQLite |
| News | DB signals or mock | RSS + pipeline | RSS + pipeline |
| Gate rejects | Optional `captureRejects` in report | Logs only unless capture wired | N/A |

## Expected divergences

1. **Filter source** — Backtest uses static defaults; sim/testnet may round quantity differently if exchange filters differ.
2. **Timing** — `waitForNextCandleClose` uses real time in sim unless signal timestamps align; backtest uses deterministic candle times.
3. **Fills** — SimBroker conservative model vs exchange order book on testnet.
4. **No auto-parity** — Sim and testnet are not replayed on identical klines in CI; backtest determinism is tested.

## Validation performed

| Check | Result |
|-------|--------|
| Backtest replay determinism (2 runs) | Identical metrics |
| `paper-trading-stack` refactor | Same backtest path |
| Testnet adapter smoke (mocked REST) | Connect + balance OK |

## Commands

```bash
npm test -- tests/integration/mode-parity-replay.test.ts
npm test -- tests/integration/testnet-stack-smoke.test.ts
npm run parity-check
```
