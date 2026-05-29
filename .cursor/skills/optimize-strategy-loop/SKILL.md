---
name: optimize-strategy-loop
description: Continues the strategy optimize loop across agent sessions using Cursor loop wakes. Use when optimize-batch runs are long, target PnL not yet met, or the user asks to loop strategy optimization.
---

# Optimize Strategy Loop

Compose with the **loop** skill (`~/.cursor/skills-cursor/loop/SKILL.md`) and [optimize-strategy](../optimize-strategy/SKILL.md) (v2 preflight, diagnose, tiers, finalize).

## When to use

- One batch finished with `targetMet: false` and `iteration < maxIterations`.
- User says "loop optimize" or "tiếp tục optimize".
- Long runs that should resume after sleep without re-deriving state from scratch.

## Before arming

1. Read `data/optimize/leaderboard.json` — `iteration`, `best`, `bestNearEligible`, latest entry `reportPaths`.
2. Read `config/optimize-periods.yaml` — `targets.maxIterations`, optional `maxCodeIterations`, `plateauWindow`.
3. Run `optimize-diagnose` on the latest candidate (or use last batch `--diagnose` output).
4. If `iteration >= maxIterations` → run `optimize-finalize` **first**; do **not** arm another wake.

## Dynamic loop setup

```powershell
Start-Sleep -Seconds 120
Write-Output 'AGENT_LOOP_WAKE_OPTIMIZE {"action":"continue",...}'
```

On wake: run [optimize-strategy](../optimize-strategy/SKILL.md) from **Preflight** through one full **Iteration** (or finalize if at cap).

Re-arm only while stop conditions below are false.

---

## Wake payload (required fields)

Include current state in the loop wake JSON so the next session does not re-parse large reports:

```json
{
  "action": "continue",
  "iteration": 12,
  "tier": "config",
  "bestCandidateId": "candidate-005",
  "minWinRate": 51.1,
  "targetWinRate": 60,
  "totalPnlPercent": 10.77,
  "targetPnlPercent": 60,
  "plateau": true,
  "klinesOk": true
}
```

| Field | Source |
|-------|--------|
| `iteration` | Next iteration number (or last completed + 1 per skill preflight) |
| `tier` | `config` \| `code` — active escalation tier |
| `bestCandidateId` | `leaderboard.best.candidateId` or parent from `pickMutationParent` |
| `minWinRate` / `targetWinRate` | diagnose `aggregate` / manifest `targets.minWinRate` |
| `totalPnlPercent` / `targetPnlPercent` | diagnose / manifest |
| `plateau` | diagnose `plateau.detected` |
| `klinesOk` | diagnose `klinesOk` |

Optional: `gapWinRatePoints`, `weakestPeriod.from`, `reason` from last run-log line.

Vary the embedded `prompt` string with iteration and tier; the JSON block is the source of truth.

---

## Stop arming the loop when

- `targetMet: true` (after finalize if promoting), or
- `iteration >= maxIterations` and **`optimize-finalize` has already run** (mandatory before the last wake — not optional), or
- Tier 3 — waiting on user approval for manifest changes, or
- User says stop — kill sleeper PID; do not re-arm.

## Finalize before max iterations

When `iteration >= maxIterations`:

1. Run `npm run optimize-finalize -- --manifest config/optimize-periods.yaml`.
2. Post the optimize-complete summary from optimize-strategy SKILL.
3. Do **not** schedule another wake unless the user explicitly restarts with a new budget.

If the last batch in the session reaches the cap, **finalize in the same session** before emitting a final wake (or skip the final wake entirely).

---

## Per-tick flow

```
- [ ] Parse wake JSON (or rebuild from leaderboard + diagnose)
- [ ] If klinesOk false → prefetch + re-batch; re-arm only after klinesOk true
- [ ] If targetMet → finalize; stop
- [ ] If iteration > maxIterations → finalize; stop
- [ ] Else one optimize-strategy iteration; update payload; re-arm or stop
```

## Anti-patterns

- Do not arm wakes without `klinesOk` when prior batch had zero trades.
- Do not skip finalize at iteration cap.
- Do not copy candidates to `production.yaml` manually at loop end.
