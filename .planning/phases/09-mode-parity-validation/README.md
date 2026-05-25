# Phase 9: Mode Parity Validation

## Artifacts

| File | Purpose |
|------|---------|
| `MODE-PARITY.md` | Known differences across modes |
| `PHASE9-SIGNOFF.md` | Ready-for-testnet criteria |
| `parity-check-results.json` | Short backtest metrics snapshot |

## Tests

```bash
npm test -- tests/integration/mode-parity-replay.test.ts
npm test -- tests/integration/testnet-stack-smoke.test.ts
npm run parity-check
```

## Code

- `src/app/paper-trading-stack.ts` — shared sim/backtest wiring
