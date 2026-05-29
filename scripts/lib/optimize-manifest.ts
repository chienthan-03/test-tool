import { z } from 'zod';
import { parseStrictIsoDate } from '../../src/cli/backtest-dates.js';

const PeriodSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const TargetsSchema = z.object({
  targetPnlPercent: z.number(),
  minWinRate: z.number().min(0).max(100),
  maxIterations: z.number().int().min(1),
});

const PathsSchema = z
  .object({
    candidatesDir: z.string().default('config/optimize'),
    optimizeDataDir: z.string().default('data/optimize'),
    klineCacheDir: z.string().default('./data/klines'),
  })
  .default({
    candidatesDir: 'config/optimize',
    optimizeDataDir: 'data/optimize',
    klineCacheDir: './data/klines',
  });

export const OptimizeManifestSchema = z.object({
  periods: z.array(PeriodSchema).min(1),
  targets: TargetsSchema,
  baseConfig: z.string().default('config/production.yaml'),
  seedConfig: z.string().optional(),
  symbolPool: z.array(z.string().min(1)).default([]),
  denylist: z.array(z.string().min(1)).default([]),
  paths: PathsSchema,
});

export type OptimizeManifest = z.infer<typeof OptimizeManifestSchema>;

export const parseOptimizeManifest = (raw: unknown, manifestPath: string): OptimizeManifest => {
  const parsed = OptimizeManifestSchema.parse(raw);
  const seedConfig = parsed.seedConfig ?? parsed.baseConfig;

  for (const [i, period] of parsed.periods.entries()) {
    const from = parseStrictIsoDate(period.from, `periods[${i}].from`);
    const to = parseStrictIsoDate(period.to, `periods[${i}].to`);
    if (from.getTime() >= to.getTime()) {
      throw new Error(`${manifestPath}: periods[${i}] from must be before to`);
    }
  }

  return { ...parsed, seedConfig };
};
