import { z } from 'zod';

const timeframeEnum = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']);
const futuresSymbol = z.string().regex(/^[A-Z0-9]+USDT$/);

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

export const AppConfigSchema = z.object({
  mode: z.enum(['live', 'testnet', 'sim']).default('sim'),
  allowLive: z.boolean().default(false),
  symbols: z.array(futuresSymbol).min(1),
  symbolOverrides: z.record(z.string(), z.object({
    timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }).optional(),
    risk: z.object({ positionPercent: z.number().min(0.1).max(100) }).optional(),
  })).default({}),
  timeframes: z.object({ context: timeframeEnum, entry: timeframeEnum }),
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
    emaContextPeriod: z.number().int().positive(),
    emaEntryPeriod: z.number().int().positive(),
    atrPeriod: z.number().int().positive(),
    minAtrPercent: z.number().positive(),
    entry: z.object({
      requireEmaConfirm: z.boolean(),
      waitForNextCandleClose: z.boolean(),
    }),
    onePositionPerSymbol: z.boolean(),
  }),
  risk: z.object({
    positionPercent: z.number().min(0.1).max(100),
    minNotionalUsdt: z.number().positive(),
    maxNotionalUsdt: z.number().positive().nullable(),
    slAtrMultiplier: z.number().positive(),
    tpAtrMultiplier: z.number().positive(),
    trailingStop: z.boolean(),
  }),
  binance: z.object({
    baseUrl: z.string().url(),
    testnetBaseUrl: z.string().url(),
    testnetWsUrl: z.string().url(),
    mainnetWsUrl: z.string().url(),
    recvWindow: z.number().int(),
    wsReconnectMaxRetries: z.number().int(),
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
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type FeedConfig = z.infer<typeof FeedSchema>;
