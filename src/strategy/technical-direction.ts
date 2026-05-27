import type { AppConfig } from '../config/schema.js';
import type { SignalDirection } from '../core/types.js';
import type { KlineStore } from '../market/kline-store.js';
import { computeEmaTrendState } from './context/ema-trend-state.js';

export const resolveEmaContextDirection = (
  symbol: string,
  store: KlineStore,
  config: AppConfig,
): SignalDirection | null => {
  const state = computeEmaTrendState(symbol, store, config);
  if (!state.ok) return null;
  return state.direction;
};
