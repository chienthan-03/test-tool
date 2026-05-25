# Market Smoke (Phase 5)

## REST smoke test

**File:** `tests/integration/market-symbols-smoke.test.ts`

Fetches 5 recent `4h` klines per symbol from `config.binance.baseUrl` (mainnet futures).

```bash
npm test -- tests/integration/market-symbols-smoke.test.ts
```

**Result:** All five symbols return klines (passed 2026-05-25).

## Validate CLI

```bash
npm run dev -- validate --config config/experiments/symbols-expanded.yaml
```

Optional `--dry-poll` exercises RSS pipeline (network + feeds).

## Testnet

Same symbol names on USDⓈ-M testnet (`config.binance.testnetBaseUrl`) when API keys are set.

## Not in scope

Long-running WebSocket soak test.
