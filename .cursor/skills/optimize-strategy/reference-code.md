# Optimize Strategy — Code tier (Tier 2)

Companion to [SKILL.md](SKILL.md). Use when `optimize-diagnose` reports `plateau.detected` on config iterations and win-rate gap remains.

---

## When to escalate

- `suggestedTier` is `"code"` or skill tier-2 gates are met (see SKILL.md).
- `klinesOk: true` and trades exist — code changes address gates, not missing data.
- `iteration < maxIterations` (respect optional `maxCodeIterations` in manifest).

---

## Allowed change surface

| Area | Path | Notes |
|------|------|--------|
| Entry gate | `src/strategy/entry-gate.ts` | Ordering, new reject reason |
| Context | `src/strategy/context/*` | Context EMA gate tweaks |
| Entries | `src/strategy/entries/*` | Entry path evaluators (e.g. emaMomentum) |
| MTF engine | `src/strategy/mtf-engine.ts` | Minor filter hooks only |
| Tests | `tests/unit/*`, `tests/integration/*` | Required for any gate change |

**Forbidden:** `denylist` paths in manifest, live/testnet trading, unrelated refactors, broad style-only edits.

---

## Workflow checklist

```
- [ ] Write 1–3 sentence hypothesis tied to diagnose (weakestPeriod, gateRejectTop)
- [ ] Implement minimal code change
- [ ] Add or extend unit test for changed behavior
- [ ] npm test -- <focused test paths>
- [ ] Copy latest CONFIG parent → new candidate YAML (unchanged params unless diagnose also suggests config tweaks)
- [ ] npm run optimize-batch -- ... --tier code [--diagnose]
- [ ] Confirm leaderboard entry has tier:"code"
```

Stop code tier after `codePlateauWindow` (default 2) code iterations with flat `minWinRate` → propose tier 3 (manifest) to user.

---

## Test command templates

```bash
# Single file
npm test -- tests/unit/entry-gate.test.ts

# Strategy folder
npm test -- tests/unit/strategy

# After gate change + integration touch
npm test -- tests/unit/optimize-scoring.test.ts tests/integration/
```

All tests for touched modules must pass before the next `optimize-batch`.

---

## Example: minimum RR before entry allow

**Hypothesis:** `gateRejectTop` shows many entries that later hit SL with poor R:R; require `tpDistance / slDistance >= minRr` in `entry-gate.ts` before `allow`.

**Steps:**

1. Add `minRiskReward` (or use existing risk config) check in `src/strategy/entry-gate.ts` after ATR/size checks.
2. Add unit case in `tests/unit/entry-gate.test.ts`: reject when RR &lt; threshold; allow when RR ≥ threshold.
3. `npm test -- tests/unit/entry-gate.test.ts`
4. Copy parent config → `candidate-NNN.yaml`; run batch with `--tier code`.

Document the hypothesis and diagnose fields used in the agent message.

---

## Recording tier on the leaderboard

Pass `--tier code` to `optimize-batch` so the entry records `tier: "code"` for plateau windows (config vs code iterations are tracked separately in run-log / diagnose `plateau`).
