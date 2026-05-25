# Phase 6: Entry Quality Gates

Ship research-backed production config and a single MTF veto layer before intents.

## Deliverables

| Doc / code | Plan |
|------------|------|
| `ENTRY-GATES-DESIGN.md`, `src/strategy/entry-gate.ts` | 06-01 |
| `SENTIMENT-MERGE.md`, `default.yaml` LLM off | 06-02 |
| `MTF-MERGE.md`, fib `0.02` | 06-03 |
| `GATES-CONFIG.md`, `entryGates` schema | 06-04 |
| `tests/unit/entry-gate.test.ts` | 06-05 |
| `tests/integration/entry-gates-intent.test.ts` | 06-06 |
| `PHASE6-VALIDATION.md` | 06-07 |
| `PHASE6-COMPLETE.md` | 06-08 |

## Run validation

```bash
npm run backtest-matrix -- --matrix config/experiments/phase6-validation-matrix.yaml
```

Results: `data/reports/experiments/phase6-validation/`

## Config reference

See [GATES-CONFIG.md](./GATES-CONFIG.md).

## Handoff to Phase 7

- Per-symbol **cooldown after loss** — not implemented in Phase 6
- SL/TP and risk tuning
