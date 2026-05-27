# News Veto on Technical Mode (2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `strategy.newsVeto` so `triggerMode: technical` can optionally run RSS (rule-only) and block counter-direction trades when macro/hack/etf-tagged signals oppose the technical setup—with BTC leader cross-symbol veto.

**Architecture:** `NewsVetoStore` registers qualifying `news:signal` events (tags + strength filter). `NewsVetoEvaluator.shouldVeto()` applies asymmetric opposite-direction check with BTC leader semantics. `StrategyEngine` calls evaluator after `EntryGate` pass in the technical path only. Bootstrap and `createPaperTradingStack` share `wireNewsVeto()`. Backtest loads/replays signals when `technical + newsVeto.enabled`.

**Tech Stack:** TypeScript, Zod, Vitest, SQLite migration, existing `NewsPipeline` / `SignalMerger` / `backtest-replayer`

**Spec:** `docs/superpowers/specs/2026-05-27-news-veto-technical-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config/schema.ts` | Modify | `NewsVetoConfigSchema`, defaults, refine |
| `config/default.yaml` | Modify | `newsVeto.enabled: false` block |
| `config/production.yaml` | Modify | Commented `newsVeto.enabled: true` example |
| `config/experiments/news-veto-technical.yaml` | Create | Matrix preset (technical + veto on) |
| `src/core/types.ts` | Modify | `NewsSignal.tags` |
| `src/sentiment/signal-merger.ts` | Modify | Pass `rule.tags` into signal |
| `src/storage/migrations/003_news_signal_tags.sql` | Create | `tags_json` column |
| `src/storage/migrate.ts` | Modify | Version 3 |
| `src/storage/repositories/signal-repo.ts` | Modify | Persist/read tags |
| `src/strategy/news-veto-store.ts` | Create | In-memory registry |
| `src/strategy/news-veto-evaluator.ts` | Create | BTC leader + opposite check |
| `src/strategy/wire-news-veto.ts` | Create | Shared bus wiring |
| `src/strategy/strategy-engine.ts` | Modify | Veto hook in technical path |
| `src/app/bootstrap.ts` | Modify | Start RSS when veto enabled |
| `src/app/paper-trading-stack.ts` | Modify | Pass evaluator to StrategyEngine |
| `src/config/profile-warnings.ts` | Modify | Veto-specific warnings |
| `src/execution/backtest-replayer.ts` | Modify | Signal replay for technical+veto |
| `tests/unit/news-veto-store.test.ts` | Create | Store filter/register |
| `tests/unit/news-veto-evaluator.test.ts` | Create | BTC leader cases |
| `tests/unit/strategy-engine-news-veto.test.ts` | Create | Intent blocked/allowed |
| `tests/unit/signal-merger.test.ts` | Modify | Tags on signal |
| `tests/unit/profile-warnings.test.ts` | Modify | New warnings |
| `tests/unit/config-loader.test.ts` | Modify | newsVeto defaults |
| `tests/integration/backtest-news-veto-smoke.test.ts` | Create | Replay with tagged signals |
| `docs/HUONG-DAN-FUTURES.md` | Modify | §7.9 news veto |
| `docs/LIVE-SAFETY-CHECKLIST.md` | Modify | newsVeto bullet |
| `README.md` | Modify | Table row `strategy.newsVeto` |

---

### Task 1: Config schema — `newsVeto`

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `config/default.yaml`
- Modify: `config/production.yaml`
- Test: `tests/unit/config-loader.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/unit/config-loader.test.ts`:

```typescript
  it('defaults strategy.newsVeto.enabled to false', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.strategy.newsVeto.enabled).toBe(false);
    expect(config.strategy.newsVeto.vetoTags).toEqual(['macro', 'hack', 'etf']);
    expect(config.strategy.newsVeto.leaderSymbol).toBe('BTCUSDT');
  });

  it('rejects newsVeto.enabled when all feeds disabled', () => {
    expect(() =>
      AppConfigSchema.parse({
        ...minimalValidConfig,
        feeds: [{ id: 'x', url: 'https://example.com/rss', pollIntervalSec: 60, enabled: false }],
        strategy: { ...minimalValidConfig.strategy, newsVeto: { enabled: true } },
      }),
    ).toThrow(/newsVeto/);
  });
```

(Use existing test helper pattern in file for `minimalValidConfig` or inline a minimal parse object matching other tests.)

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- tests/unit/config-loader.test.ts
```

- [ ] **Step 3: Add schema**

In `src/config/schema.ts`, before `strategy: z.object`:

```typescript
export const NewsVetoConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    minStrength: z.number().min(0).max(1).default(0.75),
    vetoTags: z.array(z.string().min(1)).min(1).default(['macro', 'hack', 'etf']),
    leaderSymbol: futuresSymbol.default('BTCUSDT'),
  })
  .default({
    enabled: false,
    minStrength: 0.75,
    vetoTags: ['macro', 'hack', 'etf'],
    leaderSymbol: 'BTCUSDT',
  });
```

Inside `strategy` object (after `triggerMode`):

```typescript
newsVeto: NewsVetoConfigSchema,
```

Append to `AppConfigSchema` chain (after `.object({...})`):

```typescript
export const AppConfigSchema = z
  .object({ /* existing */ })
  .superRefine((cfg, ctx) => {
    if (cfg.strategy.newsVeto.enabled && !cfg.feeds.some((f) => f.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'strategy.newsVeto.enabled requires at least one enabled feed',
        path: ['strategy', 'newsVeto', 'enabled'],
      });
    }
  });
```

- [ ] **Step 4: YAML**

`config/default.yaml` under `strategy:`:

```yaml
  newsVeto:
    enabled: false
    minStrength: 0.75
    vetoTags: [macro, hack, etf]
    leaderSymbol: BTCUSDT
```

`config/production.yaml` (commented example):

```yaml
  # newsVeto:
  #   enabled: true
  #   minStrength: 0.75
  #   vetoTags: [macro, hack, etf]
  #   leaderSymbol: BTCUSDT
```

- [ ] **Step 5: Run test (expect PASS)**

```bash
npm test -- tests/unit/config-loader.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts config/default.yaml config/production.yaml tests/unit/config-loader.test.ts
git commit -m "feat(config): add strategy.newsVeto schema"
```

---

### Task 2: `NewsSignal.tags` + merger

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/sentiment/signal-merger.ts`
- Test: `tests/unit/signal-merger.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/unit/signal-merger.test.ts`:

```typescript
  it('includes rule tags on emitted signal', () => {
    const signal = merger.build(
      {
        newsId: 'n1',
        impactScore: 3,
        ruleSentiment: -1,
        priority: 'high',
        tags: ['macro', 'etf'],
        needsLlm: false,
      },
      newsItem,
      null,
    );
    expect(signal?.tags).toEqual(['macro', 'etf']);
  });
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
npm test -- tests/unit/signal-merger.test.ts
```

- [ ] **Step 3: Implement**

`src/core/types.ts`:

```typescript
export interface NewsSignal {
  // ...existing fields
  tags: string[];
}
```

`src/sentiment/signal-merger.ts` return object:

```typescript
    return {
      id: signalId(),
      newsId: news.id,
      symbols,
      direction,
      strength,
      expiresAt,
      source,
      createdAt: now,
      tags: rule.tags,
    };
```

- [ ] **Step 4: Fix compile errors** — grep `NewsSignal` literals in tests/fixtures; add `tags: []` where needed.

```bash
rg "NewsSignal|news:signal" tests --glob "*.ts" -l
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/signal-merger.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/sentiment/signal-merger.ts tests/
git commit -m "feat(signals): attach rule tags to NewsSignal"
```

---

### Task 3: SQLite migration + SignalRepository

**Files:**
- Create: `src/storage/migrations/003_news_signal_tags.sql`
- Modify: `src/storage/migrate.ts`
- Modify: `src/storage/repositories/signal-repo.ts`
- Test: `tests/unit/signal-repo.test.ts` (create if missing, or add to integration test)

- [ ] **Step 1: Migration file**

`src/storage/migrations/003_news_signal_tags.sql`:

```sql
ALTER TABLE news_signals ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
```

- [ ] **Step 2: Bump migrate.ts**

```typescript
const TARGET_VERSION = 3;

const MIGRATION_FILES: Record<number, string> = {
  1: '001_initial.sql',
  2: '002_entry_path.sql',
  3: '003_news_signal_tags.sql',
};
```

- [ ] **Step 3: Update signal-repo**

`insert`:

```typescript
        `INSERT INTO news_signals (
          id, news_id, symbols_json, direction, strength, source, expires_at, created_at, tags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```

```typescript
        JSON.stringify(signal.tags ?? []),
```

`rowToSignal`:

```typescript
  tags: JSON.parse(row.tags_json ?? '[]') as string[],
```

Add `tags_json` to `SignalRow` interface and SELECT columns.

- [ ] **Step 4: Write test**

Create `tests/unit/signal-repo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

describe('SignalRepository tags', () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => db.close());

  it('round-trips tags_json', () => {
    const repo = new SignalRepository(db);
    const signal = {
      id: 'sig-1',
      newsId: 'news-1',
      symbols: ['BTCUSDT'],
      direction: 'short' as const,
      strength: 0.9,
      source: 'rule' as const,
      expiresAt: new Date('2026-06-01T00:00:00Z'),
      createdAt: new Date('2026-05-31T12:00:00Z'),
      tags: ['macro'],
    };
    repo.insert(signal);
    const loaded = repo.listBetween(new Date('2026-05-01'), new Date('2026-07-01'));
    expect(loaded[0]?.tags).toEqual(['macro']);
  });
});
```

- [ ] **Step 5: Run**

```bash
npm test -- tests/unit/signal-repo.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/storage/ tests/unit/signal-repo.test.ts
git commit -m "feat(storage): persist news signal tags for veto backtest"
```

---

### Task 4: NewsVetoStore

**Files:**
- Create: `src/strategy/news-veto-store.ts`
- Create: `tests/unit/news-veto-store.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/news-veto-store.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../src/config/schema.js';
import type { NewsSignal } from '../../src/core/types.js';
import { NewsVetoStore } from '../../src/strategy/news-veto-store.js';

const baseConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  strategy: {
    newsVeto: {
      enabled: true,
      minStrength: 0.75,
      vetoTags: ['macro', 'hack', 'etf'],
      leaderSymbol: 'BTCUSDT',
    },
  },
} as unknown as AppConfig;

const makeSignal = (over: Partial<NewsSignal>): NewsSignal => ({
  id: 'sig-1',
  newsId: 'news-1',
  symbols: ['BTCUSDT'],
  direction: 'short',
  strength: 0.9,
  tags: ['macro'],
  expiresAt: new Date('2026-01-02T00:00:00Z'),
  source: 'rule',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  ...over,
});

describe('NewsVetoStore', () => {
  it('registers qualifying macro signal', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({}));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(true);
  });

  it('skips signal below minStrength', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ strength: 0.5 }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(false);
  });

  it('skips signal without veto tag', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ tags: ['regulation'] }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z'))).toBe(false);
  });

  it('prunes expired signals', () => {
    const store = new NewsVetoStore(baseConfig);
    store.register(makeSignal({ expiresAt: new Date('2026-01-01T13:00:00Z') }));
    expect(store.hasOpposing('ETHUSDT', 'long', new Date('2026-01-02T00:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
npm test -- tests/unit/news-veto-store.test.ts
```

- [ ] **Step 3: Implement**

`src/strategy/news-veto-store.ts`:

```typescript
import type { AppConfig } from '../config/schema.js';
import type { NewsSignal, SignalDirection } from '../core/types.js';

type VetoRecord = {
  signalId: string;
  newsId: string;
  symbols: string[];
  direction: SignalDirection;
  strength: number;
  tags: string[];
  expiresAt: Date;
  isLeader: boolean;
};

export class NewsVetoStore {
  private records: VetoRecord[] = [];

  constructor(private readonly config: AppConfig) {}

  register(signal: NewsSignal): void {
    const nv = this.config.strategy.newsVeto;
    if (!nv.enabled) return;
    if (signal.strength < nv.minStrength) return;
    if (!signal.tags.some((t) => nv.vetoTags.includes(t))) return;

    const isLeader = signal.symbols.includes(nv.leaderSymbol);
    this.records.push({
      signalId: signal.id,
      newsId: signal.newsId,
      symbols: signal.symbols,
      direction: signal.direction,
      strength: signal.strength,
      tags: signal.tags,
      expiresAt: signal.expiresAt,
      isLeader,
    });
  }

  hasOpposing(symbol: string, tradeDirection: SignalDirection, now: Date): boolean {
    this.prune(now);
    return this.activeFor(symbol, now).some((r) => r.direction !== tradeDirection);
  }

  opposingRecord(
    symbol: string,
    tradeDirection: SignalDirection,
    now: Date,
  ): VetoRecord | undefined {
    this.prune(now);
    return this.activeFor(symbol, now).find((r) => r.direction !== tradeDirection);
  }

  private activeFor(symbol: string, now: Date): VetoRecord[] {
    return this.records.filter((r) => {
      if (now.getTime() > r.expiresAt.getTime()) return false;
      if (r.symbols.includes(symbol)) return true;
      if (r.isLeader && this.config.symbols.includes(symbol)) return true;
      return false;
    });
  }

  private prune(now: Date): void {
    this.records = this.records.filter((r) => now.getTime() <= r.expiresAt.getTime());
  }
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
npm test -- tests/unit/news-veto-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/strategy/news-veto-store.ts tests/unit/news-veto-store.test.ts
git commit -m "feat(strategy): add NewsVetoStore"
```

---

### Task 5: NewsVetoEvaluator

**Files:**
- Create: `src/strategy/news-veto-evaluator.ts`
- Create: `tests/unit/news-veto-evaluator.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/news-veto-evaluator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../src/config/schema.js';
import type { NewsSignal } from '../../src/core/types.js';
import { NewsVetoEvaluator } from '../../src/strategy/news-veto-evaluator.js';
import { NewsVetoStore } from '../../src/strategy/news-veto-store.js';

const config = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  strategy: {
    newsVeto: {
      enabled: true,
      minStrength: 0.75,
      vetoTags: ['macro', 'hack', 'etf'],
      leaderSymbol: 'BTCUSDT',
    },
  },
} as unknown as AppConfig;

const register = (store: NewsVetoStore, signal: Partial<NewsSignal>) => {
  store.register({
    id: 'sig-1',
    newsId: 'news-1',
    symbols: ['BTCUSDT'],
    direction: 'short',
    strength: 0.9,
    tags: ['macro'],
    expiresAt: new Date('2026-01-02T00:00:00Z'),
    source: 'rule',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    ...signal,
  });
};

describe('NewsVetoEvaluator', () => {
  it('vetoes ETH long when BTC macro bearish', () => {
    const store = new NewsVetoStore(config);
    register(store, { symbols: ['BTCUSDT'], direction: 'short' });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(true);
  });

  it('does not veto BTC long when only ETH bearish hack', () => {
    const store = new NewsVetoStore(config);
    register(store, { symbols: ['ETHUSDT'], direction: 'short', tags: ['hack'] });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('BTCUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(false);
  });

  it('does not veto same-direction macro', () => {
    const store = new NewsVetoStore(config);
    register(store, { direction: 'long' });
    const ev = new NewsVetoEvaluator(config, store);
    expect(ev.shouldVeto('ETHUSDT', 'long', new Date('2026-01-01T18:00:00Z')).veto).toBe(false);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
npm test -- tests/unit/news-veto-evaluator.test.ts
```

- [ ] **Step 3: Implement**

`src/strategy/news-veto-evaluator.ts`:

```typescript
import type { AppConfig } from '../config/schema.js';
import type { SignalDirection } from '../core/types.js';
import type { NewsVetoStore } from './news-veto-store.js';

export type NewsVetoResult = {
  veto: boolean;
  reason?: string;
  blockingSignalId?: string;
};

export class NewsVetoEvaluator {
  constructor(
    private readonly config: AppConfig,
    private readonly store: NewsVetoStore,
  ) {}

  shouldVeto(symbol: string, tradeDirection: SignalDirection, now: Date): NewsVetoResult {
    if (!this.config.strategy.newsVeto.enabled) {
      return { veto: false };
    }
    const blocking = this.store.opposingRecord(symbol, tradeDirection, now);
    if (!blocking) {
      return { veto: false };
    }
    return {
      veto: true,
      reason: 'news_veto_counter',
      blockingSignalId: blocking.signalId,
    };
  }
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
npm test -- tests/unit/news-veto-evaluator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/strategy/news-veto-evaluator.ts tests/unit/news-veto-evaluator.test.ts
git commit -m "feat(strategy): add NewsVetoEvaluator with BTC leader"
```

---

### Task 6: wireNewsVeto + StrategyEngine hook

**Files:**
- Create: `src/strategy/wire-news-veto.ts`
- Modify: `src/strategy/strategy-engine.ts`
- Create: `tests/unit/strategy-engine-news-veto.test.ts`

- [ ] **Step 1: Write failing integration test**

Follow candle seeding helpers from `tests/unit/strategy-engine-technical.test.ts`. Add test file that:

1. Builds technical intraday config with `newsVeto.enabled: true`.
2. Creates `NewsVetoStore`, registers opposing BTC macro signal manually (or emit `news:signal` on bus before candle).
3. Emits entry-TF `market:candleClose` with uptrend data.
4. Asserts **no** `strategy:intent` when veto active.
5. Asserts **intent emitted** when store empty.

- [ ] **Step 2: Implement wireNewsVeto**

`src/strategy/wire-news-veto.ts`:

```typescript
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import { NewsVetoEvaluator } from './news-veto-evaluator.js';
import { NewsVetoStore } from './news-veto-store.js';

export const wireNewsVeto = (
  config: AppConfig,
  bus: AppEventBus,
): NewsVetoEvaluator | undefined => {
  if (!config.strategy.newsVeto.enabled) {
    return undefined;
  }
  const store = new NewsVetoStore(config);
  bus.on('news:signal', (signal) => {
    store.register(signal);
  });
  return new NewsVetoEvaluator(config, store);
};
```

- [ ] **Step 3: Extend StrategyEngine constructor**

Add optional last parameter:

```typescript
private readonly newsVeto?: NewsVetoEvaluator,
```

In `handleTechnicalCandleClose`, after gate pass:

```typescript
      if (this.newsVeto) {
        const veto = this.newsVeto.shouldVeto(symbol, direction, this.getNow());
        if (veto.veto) {
          continue;
        }
      }
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/strategy-engine-news-veto.test.ts tests/unit/strategy-engine-technical.test.ts
```

Expected: all PASS; technical tests unchanged when no evaluator passed.

- [ ] **Step 5: Commit**

```bash
git add src/strategy/wire-news-veto.ts src/strategy/strategy-engine.ts tests/unit/strategy-engine-news-veto.test.ts
git commit -m "feat(strategy): apply news veto in technical candle path"
```

---

### Task 7: Bootstrap + paper-trading-stack

**Files:**
- Modify: `src/app/bootstrap.ts`
- Modify: `src/app/paper-trading-stack.ts`

- [ ] **Step 1: bootstrap.ts**

Replace news stack condition:

```typescript
const startNewsStack =
  config.strategy.triggerMode !== 'technical' || config.strategy.newsVeto.enabled;

let newsPipeline: NewsPipeline | undefined;
let rssManager: RssPollerManager | undefined;

if (startNewsStack) {
  // existing NewsPipeline + RssPollerManager block unchanged
}
```

Before `StrategyEngine` construction:

```typescript
  const newsVeto = wireNewsVeto(config, bus);
```

Pass `newsVeto` as last arg to `new StrategyEngine(...)`.

Startup log:

```typescript
  log.info(
    {
      symbols: config.symbols,
      mode,
      triggerMode: config.strategy.triggerMode,
      newsVeto: config.strategy.newsVeto.enabled,
    },
    `${mode}_runtime_started`,
  );
```

- [ ] **Step 2: paper-trading-stack.ts**

Import `wireNewsVeto`. Before `new StrategyEngine`:

```typescript
  const newsVeto = wireNewsVeto(params.config, params.bus);
```

Pass to `StrategyEngine` constructor.

- [ ] **Step 3: Smoke run validate**

```bash
npm run dev -- validate --config config/default.yaml
```

Expected: `Config valid.`

- [ ] **Step 4: Commit**

```bash
git add src/app/bootstrap.ts src/app/paper-trading-stack.ts
git commit -m "feat(runtime): start RSS when newsVeto enabled on technical mode"
```

---

### Task 8: profile-warnings

**Files:**
- Modify: `src/config/profile-warnings.ts`
- Modify: `tests/unit/profile-warnings.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
  it('warns feeds active for veto when technical + newsVeto.enabled', () => {
    const config: AppConfig = {
      ...baseConfig,
      strategy: {
        ...baseConfig.strategy,
        triggerMode: 'technical',
        entryProfile: 'intraday',
        newsVeto: { ...baseConfig.strategy.newsVeto, enabled: true },
      },
    };
    expect(collectProfileWarnings(config)).toContain(
      'newsVeto enabled: RSS feeds active for macro veto; trades remain technical',
    );
    expect(
      collectProfileWarnings(config).some((w) => w.includes('RSS feeds') && w.includes('ignored')),
    ).toBe(false);
  });

  it('warns when leaderSymbol not in symbols', () => {
    const config: AppConfig = {
      ...baseConfig,
      symbols: ['ETHUSDT'],
      strategy: {
        ...baseConfig.strategy,
        triggerMode: 'technical',
        newsVeto: {
          ...baseConfig.strategy.newsVeto,
          enabled: true,
          leaderSymbol: 'BTCUSDT',
        },
      },
    };
    expect(collectProfileWarnings(config)).toContain(
      'newsVeto.leaderSymbol BTCUSDT not in symbols; BTC leader rule inactive',
    );
  });
```

- [ ] **Step 2: Update profile-warnings.ts**

Replace feeds-ignored warning condition:

```typescript
  if (config.strategy.triggerMode === 'technical') {
    // existing swing warning
    if (config.strategy.newsVeto.enabled) {
      if (config.feeds.some((f) => f.enabled)) {
        warnings.push(
          'newsVeto enabled: RSS feeds active for macro veto; trades remain technical',
        );
      }
      if (!config.symbols.includes(config.strategy.newsVeto.leaderSymbol)) {
        warnings.push(
          `newsVeto.leaderSymbol ${config.strategy.newsVeto.leaderSymbol} not in symbols; BTC leader rule inactive`,
        );
      }
      if (config.sentiment.llm.enabled) {
        warnings.push('newsVeto phase 1 expects rule-only sentiment; llm.enabled should be false');
      }
    } else if (config.feeds.some((f) => f.enabled)) {
      warnings.push('triggerMode technical: RSS feeds are enabled in config but ignored at runtime');
    }
  }
```

- [ ] **Step 3: Run**

```bash
npm test -- tests/unit/profile-warnings.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/config/profile-warnings.ts tests/unit/profile-warnings.test.ts
git commit -m "feat(config): profile warnings for newsVeto on technical"
```

---

### Task 9: Backtest replayer

**Files:**
- Modify: `src/execution/backtest-replayer.ts`
- Create: `config/experiments/news-veto-technical.yaml`
- Create: `tests/integration/backtest-news-veto-smoke.test.ts`

- [ ] **Step 1: Update signal loading**

Replace:

```typescript
    const isTechnical = config.strategy.triggerMode === 'technical';
    let signals: NewsSignal[] = [];

    if (isTechnical) {
```

With:

```typescript
    const isTechnical = config.strategy.triggerMode === 'technical';
    const newsVetoEnabled = config.strategy.newsVeto.enabled;
    const needsSignals = !isTechnical || newsVetoEnabled;
    let signals: NewsSignal[] = [];

    if (isTechnical && !newsVetoEnabled) {
```

Keep mock-sentiment ignore warning in this branch only.

Add `else if (needsSignals) {` — existing signal load block.

Error message when empty:

```typescript
        throw new Error(
          newsVetoEnabled
            ? 'No news_signals in date range (required for newsVeto backtest). Run seed-signals or sim.'
            : 'No news_signals in date range. Run sim first or pass --mock-sentiment.',
        );
```

- [ ] **Step 2: Emit signals in timeline loop**

Replace:

```typescript
      if (!isTechnical) {
        for (const signal of signalsInBar(signals, candle)) {
          bus.emit('news:signal', signal);
        }
      }
```

With:

```typescript
      if (!isTechnical || newsVetoEnabled) {
        for (const signal of signalsInBar(signals, candle)) {
          bus.emit('news:signal', signal);
        }
      }
```

- [ ] **Step 3: Experiment YAML**

`config/experiments/news-veto-technical.yaml` — copy `config/production.yaml`, set:

```yaml
strategy:
  triggerMode: technical
  entryProfile: intraday
  newsVeto:
    enabled: true
sentiment:
  llm:
    enabled: false
```

- [ ] **Step 4: Integration smoke test**

Seed in-memory DB with one tagged opposing signal + run short backtest window using synthetic klines (pattern from `backtest-technical-smoke.test.ts`). Assert `totalTrades` with veto ≤ without veto OR `gateRejects`/no intent when veto opposes all entries.

- [ ] **Step 5: Run**

```bash
npm test -- tests/integration/backtest-news-veto-smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/execution/backtest-replayer.ts config/experiments/news-veto-technical.yaml tests/integration/backtest-news-veto-smoke.test.ts
git commit -m "feat(backtest): replay news signals for technical newsVeto mode"
```

---

### Task 10: Docs + full test suite

**Files:**
- Modify: `docs/HUONG-DAN-FUTURES.md`
- Modify: `docs/LIVE-SAFETY-CHECKLIST.md`
- Modify: `README.md`

- [ ] **Step 1: HUONG-DAN-FUTURES.md §7.9**

Add section **Bot technical + news veto (2a)** covering:

- `newsVeto.enabled` on `triggerMode: technical`
- macro/hack/etf tags, BTC leader, rule-only phase 1
- Example YAML snippet from production comments

- [ ] **Step 2: LIVE-SAFETY-CHECKLIST.md**

Add bullet under win-rate settings:

```markdown
- [ ] If `strategy.newsVeto.enabled`: confirm RSS feeds enabled; understand BTC leader vetoes all symbols; `llm.enabled` false for phase 1
```

- [ ] **Step 3: README.md**

Add table row:

```markdown
| `strategy.newsVeto` | Optional macro veto on `triggerMode: technical` (rule-only phase 1) |
```

- [ ] **Step 4: Full test run**

```bash
npm test
npm run lint
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/HUONG-DAN-FUTURES.md docs/LIVE-SAFETY-CHECKLIST.md README.md
git commit -m "docs: news veto on technical mode (2a)"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `newsVeto` config schema | Task 1 |
| Rule-only phase 1 | Tasks 1, 7, 8 (warn if LLM on) |
| Tags macro/hack/etf | Tasks 2, 4 |
| BTC leader cross-symbol | Tasks 4, 5 |
| Asymmetric veto only | Tasks 4, 5 |
| RSS when veto enabled | Task 7 |
| Technical trigger unchanged | Task 6 |
| `NewsSignal.tags` + DB | Tasks 2, 3 |
| Backtest signal replay | Task 9 |
| profile warnings | Task 8 |
| Unit + integration tests | Tasks 4–6, 9 |
| Docs | Task 10 |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-news-veto-technical.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — implement tasks in this session with checkpoints

**Which approach?**
