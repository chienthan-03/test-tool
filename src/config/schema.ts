import { z } from 'zod';

const timeframeEnum = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']);
const futuresSymbol = z.string().regex(/^[A-Z0-9]+USDT$/);

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

export const FeedSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  pollIntervalSec: z.number().int().min(30).max(3600),
  enabled: z.boolean(),
});

export const TagRuleSchema = z.object({
  tag: z.string(),
  keywords: z.array(z.string()),
  impact: z.number().min(0).max(10),
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
});

export const AlternateEntryPathIdSchema = z.enum(['breakout', 'emaMomentum']);

export const EntryProfileSchema = z.enum(['swing', 'intraday']);

export const TriggerModeSchema = z.enum(['news', 'technical']).default('news');
export type TriggerMode = z.infer<typeof TriggerModeSchema>;

export const ContextEmaSchema = z.object({
  fastPeriod: z.number().int().min(2).max(100).default(20),
  slowPeriod: z.number().int().min(3).max(200).default(50),
  flatPercent: z.number().min(0).max(0.01).default(0.0005),
});

export const SwingProfileSchema = z.object({
  contextMode: z.literal('elliott'),
  entryPaths: z.object({ primary: z.literal('fib') }),
  useAlternateFallback: z.boolean().default(true),
});

export const IntradayProfileSchema = z.object({
  contextMode: z.literal('emaTrend'),
  contextEma: ContextEmaSchema.default({ fastPeriod: 20, slowPeriod: 50, flatPercent: 0.0005 }),
  entryPaths: z.object({
    order: z.array(AlternateEntryPathIdSchema).min(1).default(['breakout', 'emaMomentum']),
  }),
  positionScale: z.number().min(0.1).max(1).default(0.75),
});

export const StrategyProfilesSchema = z.object({
  swing: SwingProfileSchema.default({
    contextMode: 'elliott',
    entryPaths: { primary: 'fib' },
    useAlternateFallback: true,
  }),
  intraday: IntradayProfileSchema.default({
    contextMode: 'emaTrend',
    contextEma: { fastPeriod: 20, slowPeriod: 50, flatPercent: 0.0005 },
    entryPaths: { order: ['breakout', 'emaMomentum'] },
    positionScale: 0.75,
  }),
});

export const BreakoutEntryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lookbackBars: z.number().int().min(5).max(200).default(20),
  bufferPercent: z.number().min(0).max(0.05).default(0.001),
});

export const EmaMomentumEntryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  fastPeriod: z.number().int().min(2).max(50).default(9),
  slowPeriod: z.number().int().min(3).max(200).default(21),
  slopeLookback: z.number().int().min(1).max(20).default(3),
});

export const AlternateEntriesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  order: z.array(AlternateEntryPathIdSchema).default(['breakout', 'emaMomentum']),
  fallbackOnReasons: z
    .array(z.string().min(1))
    .default(['outside_fib_zone', 'no_matching_impulse_leg', 'risk_reward_too_low']),
  positionScale: z.number().min(0.1).max(1).default(1),
  breakout: BreakoutEntryConfigSchema.default({ enabled: true, lookbackBars: 20, bufferPercent: 0.001 }),
  emaMomentum: EmaMomentumEntryConfigSchema.default({
    enabled: true,
    fastPeriod: 9,
    slowPeriod: 21,
    slopeLookback: 3,
  }),
});

export const AppConfigSchema = z.object({
  mode: z.enum(['live', 'testnet', 'sim']).default('sim'),
  allowLive: z.boolean().default(false),
  symbols: z.array(futuresSymbol).min(1),
  symbolOverrides: z.record(z.string(), z.object({
    timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }).optional(),
    risk: z.object({ positionPercent: z.number().min(0.1).max(100) }).optional(),
    margin: SymbolMarginOverrideSchema.optional(),
  })).default({}),
  timeframes: z
    .object({ context: timeframeEnum, entry: timeframeEnum })
    .refine(
      (t) => t.context !== t.entry,
      'Elliott+Fib strategy requires different context and entry timeframes (e.g. 4h + 1h)',
    ),
  feeds: z.array(FeedSchema).refine((f) => f.some((x) => x.enabled), 'At least one feed enabled'),
  sentiment: z.object({
    rules: z.object({
      impactHigh: z.number(),
      thresholdLLM: z.number(),
      minStrength: z.number().min(0).max(1),
      strongNewsThreshold: z.number().min(0).max(1),
      bullishKeywords: z.array(z.string()),
      bearishKeywords: z.array(z.string()),
      bearishTags: z.array(z.string()),
      macroTags: z.array(z.string()),
      blacklistKeywords: z.array(z.string()),
      tagRules: z.array(TagRuleSchema),
    }),
    llm: z.object({
      enabled: z.boolean(),
      provider: z.literal('openrouter'),
      baseUrl: z.string().url(),
      model: z.string(),
      maxCallsPerHour: z.number().int().positive(),
      minConfidence: z.number().min(0).max(1),
      timeoutMs: z.number().int().positive(),
      defaultTtlMinutes: z.number().int().min(5).max(240),
    }),
  }),
  strategy: z.object({
    triggerMode: TriggerModeSchema,
    atrPeriod: z.number().int().positive(),
    minAtrPercent: z.number().positive(),
    maxAtrPercent: z.number().positive().nullable().default(3.5),
    entry: z.object({
      waitForNextCandleClose: z.boolean(),
    }),
    onePositionPerSymbol: z.boolean(),
    swing: z.object({
      lookback: z.number().int().min(1).max(10),
      minSwingCount: z.number().int().min(3).max(20),
      minImpulsePercent: z.number().min(0),
    }),
    elliott: z.object({
      allowSideways: z.boolean(),
      contextRequireImpulse: z.boolean().default(false),
    }),
    fibonacci: z.object({
      entryMin: z.number().min(0).max(1),
      entryMax: z.number().min(0).max(1),
      zoneTolerancePercent: z.number().min(0).max(0.5),
      stopLevel: z.number().min(0).max(1),
      targetExtension: z.number().min(1).max(3),
      stopBelowSwing: z.boolean().default(true),
      stopBufferPercent: z.number().min(0).max(0.05).default(0.002),
    }),
    entryProfile: EntryProfileSchema.default('swing'),
    profiles: StrategyProfilesSchema,
    alternateEntries: AlternateEntriesConfigSchema.default({
      enabled: false,
      order: ['breakout', 'emaMomentum'],
      fallbackOnReasons: ['outside_fib_zone', 'no_matching_impulse_leg', 'risk_reward_too_low'],
      positionScale: 1,
      breakout: { enabled: true, lookbackBars: 20, bufferPercent: 0.001 },
      emaMomentum: { enabled: true, fastPeriod: 9, slowPeriod: 21, slopeLookback: 3 },
    }),
  }),
  risk: z.object({
    positionPercent: z.number().min(0.1).max(100),
    minNotionalUsdt: z.number().positive(),
    maxNotionalUsdt: z.number().positive().nullable(),
    slAtrMultiplier: z.number().positive(),
    tpAtrMultiplier: z.number().positive(),
    trailingStop: z.boolean(),
    cooldownAfterLoss: z
      .object({
        enabled: z.boolean().default(false),
        durationHours: z.number().positive().default(12),
      })
      .default({ enabled: false, durationHours: 12 }),
  }),
  binance: z.object({
    baseUrl: z.string().url(),
    testnetBaseUrl: z.string().url(),
    testnetWsUrl: z.string().url(),
    mainnetWsUrl: z.string().url(),
    recvWindow: z.number().int(),
    wsReconnectMaxRetries: z.number().int(),
    margin: MarginConfigSchema.default({
      enabled: true,
      mode: 'isolated',
      leverage: 5,
    }),
    circuitBreaker: z.object({
      enabled: z.boolean(),
      maxFailures: z.number().int(),
      windowMs: z.number().int(),
    }),
  }),
  sim: z.object({
    initialBalanceUsdt: z.number().positive(),
    feeRate: z.number().min(0),
    slippageBps: z.number().min(0),
    fillModel: z.enum(['conservative', 'optimistic']),
  }),
  backtest: z.object({
    klineCacheDir: z.string(),
    reportDir: z.string(),
    fillModel: z.enum(['conservative', 'optimistic']),
  }),
  storage: z.object({ sqlitePath: z.string() }),
  logging: z.object({ level: z.string(), pretty: z.boolean() }),
  entryGates: z
    .object({
      enabled: z.boolean().default(true),
      logRejects: z.boolean().default(false),
      captureRejects: z.boolean().default(false),
    })
    .default({ enabled: true, logRejects: false, captureRejects: false }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type FeedConfig = z.infer<typeof FeedSchema>;
