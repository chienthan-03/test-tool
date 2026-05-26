import type { AppConfig } from '../../config/schema.js';
import { BreakoutEntryEvaluator } from './breakout-entry.js';
import { EmaMomentumEntryEvaluator } from './ema-momentum-entry.js';
import type { EntryPathEvaluator } from './types.js';

export const buildIntradayEntryChain = (config: AppConfig): EntryPathEvaluator[] => {
  const order = config.strategy.profiles.intraday.entryPaths.order;
  const paths: EntryPathEvaluator[] = [];
  for (const id of order) {
    const cfg = config.strategy.alternateEntries[id];
    if (!cfg?.enabled) continue;
    if (id === 'breakout') paths.push(new BreakoutEntryEvaluator());
    if (id === 'emaMomentum') paths.push(new EmaMomentumEntryEvaluator());
  }
  return paths;
};
