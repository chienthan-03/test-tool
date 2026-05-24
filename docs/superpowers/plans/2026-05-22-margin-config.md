# Margin Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow margin mode (Isolated/Cross) and leverage to be configured in YAML and applied automatically on Binance Futures adapter startup.

**Architecture:** Add `binance.margin` to Zod schema + default.yaml; new `margin-settings.ts` resolves global/per-symbol config; extend `BinanceFuturesClient` with signed POST helpers; call from `BinanceFuturesAdapter.connect()` before reconcile. Sim/backtest unchanged. `positionPercent` stays notional-based.

**Tech Stack:** TypeScript, Zod, Vitest, Binance USDⓈ-M Futures REST (`/fapi/v1/marginType`, `/fapi/v1/leverage`)

**Spec:** `docs/superpowers/specs/2026-05-22-margin-config-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config/schema.ts` | Modify | Add `binance.margin`, `symbolOverrides.*.margin` |
| `config/default.yaml` | Modify | Default isolated / 5x |
| `src/execution/margin-settings.ts` | Create | Resolve per-symbol margin config |
| `src/execution/binance-futures.ts` | Modify | `setMarginType`, `setLeverage`, error parsing |
| `src/execution/binance-futures-adapter.ts` | Modify | `applyMarginSettings()` in `connect()` |
| `tests/unit/margin-settings.test.ts` | Create | Resolver tests |
| `tests/unit/binance-futures.test.ts` | Modify | Client margin API tests |
| `tests/unit/binance-testnet.test.ts` | Modify | Connect applies margin when enabled |
| `README.md` | Modify | Document new config |

---

### Task 1: Config schema + default YAML

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `config/default.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Add Zod schemas**

In `src/config/schema.ts`, add before `AppConfigSchema`:

```typescript
export const MarginModeSchema = z.enum(['isolated', 'cross']);

export const MarginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: MarginModeSchema.default('isolated'),
  leverage: z.number().int().min(1).max(125).default(5),
});

export const SymbolMarginOverrideSchema = z.object({
  mode: MarginModeSchema.optional(),
  leverage: z.number().int().min(1).max(125).optional(),
});
```

Update `symbolOverrides` value schema to include optional margin:

```typescript
symbolOverrides: z.record(z.string(), z.object({
  timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }).optional(),
  risk: z.object({ positionPercent: z.number().min(0.1).max(100) }).optional(),
  margin: SymbolMarginOverrideSchema.optional(),
})).default({}),
```

Add to `binance` object in `AppConfigSchema`:

```typescript
margin: MarginConfigSchema.default({
  enabled: true,
  mode: 'isolated',
  leverage: 5,
}),
```

- [ ] **Step 2: Update default.yaml**

Add under `binance:` (before `circuitBreaker:`):

```yaml
  margin:
    enabled: true
    mode: isolated
    leverage: 5
```

- [ ] **Step 3: Extend config-loader test**

Add to `tests/unit/config-loader.test.ts`:

```typescript
  it('loads binance.margin defaults', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.binance.margin.enabled).toBe(true);
    expect(config.binance.margin.mode).toBe('isolated');
    expect(config.binance.margin.leverage).toBe(5);
  });
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/config-loader.test.ts`
Expected: PASS

---

### Task 2: Margin settings resolver

**Files:**
- Create: `src/execution/margin-settings.ts`
- Create: `tests/unit/margin-settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/margin-settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { resolveSymbolMargin, toBinanceMarginType } from '../../src/execution/margin-settings.js';

const baseConfig = loadConfig('config/default.yaml');

describe('margin-settings', () => {
  it('toBinanceMarginType maps isolated and cross', () => {
    expect(toBinanceMarginType('isolated')).toBe('ISOLATED');
    expect(toBinanceMarginType('cross')).toBe('CROSSED');
  });

  it('resolveSymbolMargin uses global defaults', () => {
    expect(resolveSymbolMargin(baseConfig, 'BTCUSDT')).toEqual({
      mode: 'isolated',
      leverage: 5,
    });
  });

  it('resolveSymbolMargin merges symbol override', () => {
    const config = {
      ...baseConfig,
      symbolOverrides: {
        BTCUSDT: { margin: { leverage: 3 } },
        ETHUSDT: { margin: { mode: 'cross' as const, leverage: 10 } },
      },
    };
    expect(resolveSymbolMargin(config, 'BTCUSDT')).toEqual({
      mode: 'isolated',
      leverage: 3,
    });
    expect(resolveSymbolMargin(config, 'ETHUSDT')).toEqual({
      mode: 'cross',
      leverage: 10,
    });
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm test -- tests/unit/margin-settings.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement margin-settings.ts**

Create `src/execution/margin-settings.ts`:

```typescript
import type { AppConfig } from '../config/schema.js';

export type MarginMode = 'isolated' | 'cross';
export type BinanceMarginType = 'ISOLATED' | 'CROSSED';

export type ResolvedSymbolMargin = {
  mode: MarginMode;
  leverage: number;
};

export const toBinanceMarginType = (mode: MarginMode): BinanceMarginType =>
  mode === 'isolated' ? 'ISOLATED' : 'CROSSED';

export const resolveSymbolMargin = (
  config: AppConfig,
  symbol: string,
): ResolvedSymbolMargin => {
  const global = config.binance.margin;
  const override = config.symbolOverrides[symbol]?.margin;

  return {
    mode: override?.mode ?? global.mode,
    leverage: override?.leverage ?? global.leverage,
  };
};
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/margin-settings.test.ts`
Expected: PASS

---

### Task 3: BinanceFuturesClient margin API methods

**Files:**
- Modify: `src/execution/binance-futures.ts`
- Modify: `tests/unit/binance-futures.test.ts`

- [ ] **Step 1: Add Binance error type + parser**

At top of `binance-futures.ts`:

```typescript
type BinanceErrorBody = { code?: number; msg?: string };

const parseBinanceError = async (response: Response): Promise<BinanceErrorBody> => {
  try {
    return (await response.json()) as BinanceErrorBody;
  } catch {
    return {};
  }
};

export class BinanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}
```

Update `signedPost` to throw `BinanceApiError` with parsed code:

```typescript
    if (!response.ok) {
      const body = await parseBinanceError(response);
      throw new BinanceApiError(
        body.msg ?? `Binance POST ${path} failed: HTTP ${response.status}`,
        response.status,
        body.code,
      );
    }
```

Apply same pattern to `signedGet` and `signedDelete` for consistency.

- [ ] **Step 2: Add setMarginType and setLeverage**

```typescript
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<void> {
    await this.signedPost<Record<string, never>>('/fapi/v1/marginType', {
      symbol,
      marginType,
    });
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedPost<{ leverage: number; maxNotionalValue: string }>(
      '/fapi/v1/leverage',
      { symbol, leverage },
    );
  }
```

- [ ] **Step 3: Add tests**

Extend `mockFetch` in `binance-futures.test.ts` to handle marginType and leverage POSTs.

Add tests:

```typescript
  it('setMarginType posts ISOLATED', async () => {
    const fetchFn = mockFetch({});
    // extend mockFetch to return ok for /fapi/v1/marginType
    const client = new BinanceFuturesClient(BASE, API_KEY, API_SECRET, RECV_WINDOW, fetchFn);
    await client.setMarginType('BTCUSDT', 'ISOLATED');
    const url = String(vi.mocked(fetchFn).mock.calls[0]?.[0]);
    expect(url).toContain('/fapi/v1/marginType');
    expect(url).toContain('symbol=BTCUSDT');
    expect(url).toContain('marginType=ISOLATED');
  });

  it('setLeverage posts leverage value', async () => {
    // similar for /fapi/v1/leverage
  });
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/binance-futures.test.ts`
Expected: PASS

---

### Task 4: Adapter applyMarginSettings on connect

**Files:**
- Modify: `src/execution/binance-futures-adapter.ts`
- Modify: `tests/unit/binance-testnet.test.ts`

- [ ] **Step 1: Implement applyMarginSettings**

In `binance-futures-adapter.ts`:

```typescript
import { BinanceApiError } from './binance-futures.js';
import {
  resolveSymbolMargin,
  toBinanceMarginType,
} from './margin-settings.js';

const MARGIN_ALREADY_SET_CODE = -4046;
const HIGH_LEVERAGE_WARN_THRESHOLD = 10;

// inside class:
  private async applyMarginSettings(): Promise<void> {
    const marginConfig = this.config.binance.margin;
    if (!marginConfig.enabled) {
      this.log.debug({ mode: this.mode }, 'margin_config_disabled');
      return;
    }

    for (const symbol of this.config.symbols) {
      const resolved = resolveSymbolMargin(this.config, symbol);

      try {
        await this.callApi(() =>
          this.client.setMarginType(symbol, toBinanceMarginType(resolved.mode)),
        );
      } catch (err) {
        if (err instanceof BinanceApiError && err.code === MARGIN_ALREADY_SET_CODE) {
          this.log.debug({ symbol }, 'margin_type_already_set');
        } else {
          this.log.warn(
            { symbol, err: err instanceof Error ? err.message : String(err) },
            'margin_type_apply_failed',
          );
        }
      }

      await this.callApi(() => this.client.setLeverage(symbol, resolved.leverage));

      if (resolved.leverage > HIGH_LEVERAGE_WARN_THRESHOLD) {
        this.log.warn({ symbol, leverage: resolved.leverage }, 'high_leverage_configured');
      }

      this.log.info(
        { symbol, mode: resolved.mode, leverage: resolved.leverage },
        'margin_settings_applied',
      );
    }
  }
```

In `connect()`, after `loadExchangeInfo`:

```typescript
    await this.applyMarginSettings();
```

- [ ] **Step 2: Update binance-testnet mockFetch**

Add handlers for:
- `POST /fapi/v1/marginType` → `{ ok: true }`
- `POST /fapi/v1/leverage` → `{ leverage: 5, maxNotionalValue: '1000000' }`

Add test:

```typescript
  it('connect applies margin settings when enabled', async () => {
    const fetchFn = mockFetch();
    const adapter = new BinanceTestnetAdapter(config, 'k', 's', {}, fetchFn);
    await adapter.connect();
    const urls = vi.mocked(fetchFn).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/fapi/v1/marginType'))).toBe(true);
    expect(urls.some((u) => u.includes('/fapi/v1/leverage'))).toBe(true);
    await adapter.disconnect();
  });

  it('connect skips margin API when disabled', async () => {
    const cfg = {
      ...config,
      binance: { ...config.binance, margin: { ...config.binance.margin, enabled: false } },
    };
    const fetchFn = mockFetch();
    const adapter = new BinanceTestnetAdapter(cfg, 'k', 's', {}, fetchFn);
    await adapter.connect();
    const urls = vi.mocked(fetchFn).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/fapi/v1/marginType'))).toBe(false);
    await adapter.disconnect();
  });
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All PASS

Run: `npm run lint`
Expected: No errors

---

### Task 5: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update configuration table**

Add row for `binance.margin.enabled`, `binance.margin.mode`, `binance.margin.leverage`.

- [ ] **Step 2: Update risks section**

Replace "bot không set leverage" with: bot applies margin on startup when `binance.margin.enabled: true`; set `enabled: false` to use exchange defaults manually.

- [ ] **Step 3: Add YAML example**

```yaml
binance:
  margin:
    enabled: true
    mode: isolated
    leverage: 5
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Global margin config | Task 1 |
| Symbol overrides | Task 1, 2 |
| Apply on connect | Task 4 |
| Skip sim/backtest | No adapter change for SimBroker |
| Idempotent -4046 | Task 3, 4 |
| positionPercent unchanged | No risk changes |
| Tests | Tasks 1–4 |
| README | Task 5 |
