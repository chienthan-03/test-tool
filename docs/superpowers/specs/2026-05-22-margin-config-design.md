# Margin & Leverage Config — Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | `2026-05-22-margin-config-design` |
| **Status** | Approved |
| **Parent spec** | `2026-05-20-crypto-news-trader-design` |
| **Version** | 1.0 |

---

## 1. Summary

Add optional **margin mode** (Isolated / Cross) and **leverage** configuration in `config/default.yaml`. The bot applies settings via Binance Futures API **once at startup** (`connect()`) for each whitelisted symbol. **Position sizing is unchanged** — `positionPercent` remains **notional % of balance**, not margin-based.

**Defaults:** `enabled: true`, `mode: isolated`, `leverage: 5`.

**Out of scope:** Sim/backtest margin simulation, per-order re-apply, changing `position-sizer` formula.

---

## 2. Goals & Non-Goals

### Goals

- Configure global margin mode + leverage under `binance.margin`
- Optional per-symbol override via `symbolOverrides.<SYMBOL>.margin`
- Apply on `BinanceFuturesAdapter.connect()` for `testnet` and `live` only
- Idempotent handling when exchange already has correct settings
- Fail startup on critical API errors; warn on non-fatal (open position blocks mode change)

### Non-Goals

- SimBroker / backtest leverage simulation
- Re-apply before each order
- Margin-based position sizing (option B/C from brainstorming)
- Hedge mode / dual-side positions

---

## 3. Configuration

### 3.1 Global (`binance.margin`)

```yaml
binance:
  margin:
    enabled: true
    mode: isolated    # isolated | cross
    leverage: 5       # integer 1–125 (schema warns >10)
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enabled` | boolean | `true` | When `false`, skip API calls; use exchange defaults |
| `mode` | `isolated` \| `cross` | `isolated` | Maps to Binance `ISOLATED` / `CROSSED` |
| `leverage` | int 1–125 | `5` | Applied per symbol after margin type |

### 3.2 Per-symbol override

```yaml
symbolOverrides:
  BTCUSDT:
    margin:
      leverage: 3
  ETHUSDT:
    margin:
      mode: isolated
      leverage: 5
```

Resolution: override fields merge over global; unspecified fields inherit global.

---

## 4. Architecture

### 4.1 New module: `src/execution/margin-settings.ts`

- `ResolvedSymbolMargin` type: `{ mode: 'isolated' | 'cross'; leverage: number }`
- `resolveSymbolMargin(config, symbol): ResolvedSymbolMargin`
- `toBinanceMarginType(mode): 'ISOLATED' | 'CROSSED'`

### 4.2 `BinanceFuturesClient` additions

- `setMarginType(symbol, marginType: 'ISOLATED' | 'CROSSED')`
- `setLeverage(symbol, leverage: number)`
- Parse Binance error JSON; treat code `-4046` (no margin change needed) as success for margin type

### 4.3 `BinanceFuturesAdapter.connect()` flow

```
getServerTime → loadExchangeInfo → applyMarginSettings (if enabled) → reconcile → interval
```

`applyMarginSettings()`:
1. Loop `config.symbols`
2. Resolve margin per symbol
3. `setMarginType` then `setLeverage`
4. Log info on success; warn if leverage > 10
5. On `-4046` or open-position margin conflict: warn, continue next symbol
6. On other errors: throw → startup fails

### 4.4 Unchanged

- `SimBroker`, `RiskEngine`, `position-sizer.ts`, `StrategyEngine`
- `bootstrap.ts` (connect already invoked)

---

## 5. Binance API

| Endpoint | Method | Params |
|----------|--------|--------|
| `/fapi/v1/marginType` | POST | `symbol`, `marginType` |
| `/fapi/v1/leverage` | POST | `symbol`, `leverage` |

Both use existing signed POST with `recvWindow`.

---

## 6. Error Handling

| Case | Behavior |
|------|----------|
| `enabled: false` | Skip all margin API calls |
| HTTP OK | Log debug/info |
| Binance code `-4046` | Success (already correct margin type) |
| Margin change with open position | Warn, skip symbol, continue |
| Auth / network / unknown API error | Throw; abort `connect()` |
| Leverage > 10 | Warn log (soft advisory) |

---

## 7. Testing

- Unit: `resolveSymbolMargin` with global + overrides
- Unit: `setMarginType` / `setLeverage` signed POST params
- Unit: `-4046` idempotent handling
- Unit: `BinanceTestnetAdapter.connect()` invokes margin endpoints when enabled
- Unit: `connect()` skips margin when `enabled: false`
- Config loader loads new `binance.margin` from default yaml

---

## 8. Documentation

- Update `README.md` margin/leverage section (replace “manual only”)
- Update parent spec section 11.2 to reflect optional margin config

---

## 9. Risks

- User with open positions may have margin type stuck on exchange — bot warns and continues
- High leverage + multiple concurrent positions still possible — documented in README
- Testnet max leverage may differ per symbol — Binance returns error; startup fails with clear message
