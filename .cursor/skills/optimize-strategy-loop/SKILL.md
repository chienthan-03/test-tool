---
name: optimize-strategy-loop
description: Continues the strategy optimize loop across agent sessions using Cursor loop wakes. Use when optimize-batch runs are long, target PnL not yet met, or the user asks to loop strategy optimization.
---

# Optimize Strategy Loop

Compose with the **loop** skill (`~/.cursor/skills-cursor/loop/SKILL.md`).

## When to use

- `optimize-strategy` finished one batch but `targetMet: false` and `iteration < maxIterations`.
- User says "loop optimize" or "tiếp tục optimize".

## Dynamic loop setup

1. Read `data/optimize/leaderboard.json` for latest `iteration` and `best.totalPnlPercent`.
2. Read `targets.maxIterations` from `config/optimize-periods.yaml`.
3. If done → run `optimize-finalize` and stop.
4. Otherwise arm one-shot wake (PowerShell example):

```powershell
Start-Sleep -Seconds 120
Write-Output 'AGENT_LOOP_WAKE_OPTIMIZE {"prompt":"Continue optimize-strategy from iteration N. Read leaderboard and run next candidate."}'
```

5. On wake: follow `optimize-strategy` checklist from "Determine iteration N".
6. Re-arm until `targetMet`, `iteration >= maxIterations`, or user stops.

## Stop conditions

- JSON summary `targetMet: true`
- `iteration >= maxIterations` → finalize best-effort
- User says stop → kill sleeper PID, do not re-arm

## Payload

Vary prompt each tick with current state:

```json
{"action":"continue","iteration":3,"bestPercent":42.5,"target":60}
```
