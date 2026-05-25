# Phase 10: Rollout & Documentation

Operator-facing rollout for the win-rate improvement cycle (Phases 1–9).

## Deliverables

| Artifact | Path |
|----------|------|
| Production config | `config/production.yaml` |
| Config comments | `config/default.yaml` |
| Live safety | `docs/LIVE-SAFETY-CHECKLIST.md` |
| Operator README | `README.md` (Win rate section) |
| Milestone | `MILESTONE-SUMMARY.md` |

## Quick start

```bash
export CONFIG_PATH=./config/production.yaml
npm run dev -- validate --config config/production.yaml
npm run parity-check
```

Before live: complete `docs/LIVE-SAFETY-CHECKLIST.md` and set `allowLive: true`.
