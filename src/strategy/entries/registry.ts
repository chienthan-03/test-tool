import type { AppConfig } from '../../config/schema.js';
import type { KlineStore } from '../../market/kline-store.js';
import type { MtfEngine } from '../mtf-engine.js';
import { BreakoutEntryEvaluator } from './breakout-entry.js';
import { EmaMomentumEntryEvaluator } from './ema-momentum-entry.js';
import { FibEntryEvaluator } from './fib-entry.js';
import type { EntryPathEvaluator } from './types.js';

export type EntryPathRegistry = {
  primary: FibEntryEvaluator;
  alternates: EntryPathEvaluator[];
};

export const buildEntryPathRegistry = (
  config: AppConfig,
  mtf: MtfEngine,
  _store: KlineStore,
): EntryPathRegistry => {
  const primary = new FibEntryEvaluator(mtf);
  const alternates: EntryPathEvaluator[] = [];

  for (const id of config.strategy.alternateEntries.order) {
    const pathConfig = config.strategy.alternateEntries[id];
    if (!pathConfig?.enabled) continue;

    if (id === 'breakout') {
      alternates.push(new BreakoutEntryEvaluator());
    } else if (id === 'emaMomentum') {
      alternates.push(new EmaMomentumEntryEvaluator());
    }
  }

  return { primary, alternates };
};
