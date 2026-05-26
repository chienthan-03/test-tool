import type { AppConfig } from '../config/schema.js';
import type { EntryPathId } from '../core/types.js';

export const resolvePositionScaleMultiplier = (
  config: AppConfig,
  entryPath: EntryPathId,
): number => {
  if (config.strategy.entryProfile === 'intraday') {
    return config.strategy.profiles.intraday.positionScale;
  }
  if (entryPath !== 'fib' && config.strategy.alternateEntries.enabled) {
    return config.strategy.alternateEntries.positionScale;
  }
  return 1;
};
