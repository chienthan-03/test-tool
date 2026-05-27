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
