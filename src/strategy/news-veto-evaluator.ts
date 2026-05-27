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
