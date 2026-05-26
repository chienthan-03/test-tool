import type { AppConfig } from '../../config/schema.js';
import type { SignalDirection } from '../../core/types.js';
import type { KlineStore } from '../../market/kline-store.js';

export type EntryPathId = 'fib' | 'breakout' | 'emaMomentum';

export type EntryEvalContext = {
  symbol: string;
  direction: SignalDirection;
  strength: number;
  config: AppConfig;
  store: KlineStore;
};

export type EntryPathResult = {
  confirm: boolean;
  reason?: string;
  close: number;
  atr: number;
  stopLoss?: number;
  takeProfit?: number;
};

export interface EntryPathEvaluator {
  readonly id: EntryPathId;
  evaluate(ctx: EntryEvalContext): EntryPathResult;
}
